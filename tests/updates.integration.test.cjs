'use strict';
// Exercise the real GitHub provider, NSIS downloader, and SHA512 validation.
// Only the HTTP transport is routed to a local fixture; no installer executes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { NsisUpdater } = require('electron-updater');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
const { createUpdateManager } = require('../electron/updates.cjs');

test('real GitHub prerelease discovery and NSIS downloads verify hashes and reject corrupt bytes and downgrades', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tweaker-updates-'));
  const bytes = Buffer.from('Fixture installer bytes; never executed.\n'.repeat(1024));
  const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
  let badBytes = false, version = '0.7.0', downloads = 0;
  const requested = [];
  const server = http.createServer((req, res) => {
    requested.push(req.url);
    const base = '/marajdesigns215-dot/tweakerzzz/releases';
    if (req.url === base + '.atom') {
      res.end(`<feed><entry><title>Tester build</title><link href="https://github.com${base}/tag/v${version}"/><content>Useful fixes</content></entry></feed>`);
    } else if (req.url === `${base}/download/v${version}/latest.yml`) {
      res.end(JSON.stringify({ version, releaseDate: '2026-10-08T00:00:00Z', files: [{ url: `Tweakerzzz-Setup-${version}-x64.exe`, size: bytes.length, sha512 }] }));
    } else if (req.url === `${base}/download/v${version}/Tweakerzzz-Setup-${version}-x64.exe`) {
      downloads++; const body = badBytes ? Buffer.from('corrupt') : bytes;
      res.writeHead(200, { 'Content-Length': body.length }); res.end(body);
    } else { res.writeHead(404); res.end('Unknown fixture URL'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  class LocalTransport extends ElectronHttpExecutor {
    createRequest(options, callback) {
      assert.equal(options.hostname, 'github.com', 'Only the production GitHub provider should be used');
      return http.request({ ...options, agent: false, protocol: 'http:', hostname: '127.0.0.1', port: server.address().port }, callback);
    }
  }
  async function create(suffix) {
    const root = path.join(directory, suffix); await fs.mkdir(root);
    const config = path.join(root, 'app-update.yml'); await fs.writeFile(config, 'updaterCacheDirName: fixture-cache\n');
    const adapter = { version: '0.6.0', name: 'Tweakerzzz', isPackaged: true, userDataPath: root, baseCachePath: root, appUpdateConfigPath: config, whenReady: async () => {}, onQuit: () => assert.fail('Automatic install-on-quit must stay disabled') };
    const engine = new NsisUpdater(null, adapter); engine.logger = null;
    engine.httpExecutor = new LocalTransport(); engine._testOnlyOptions = { platform: 'win32' };
    const manager = createUpdateManager({ engine, currentVersion: adapter.version });
    engine.quitAndInstall = () => assert.fail('Test must never execute installer bytes');
    return { manager, engine };
  }
  try {
    const good = await create('good');
    assert.equal((await good.manager.check()).phase, 'available'); assert.equal(downloads, 0);
    assert.equal((await good.manager.download()).phase, 'downloaded'); assert.equal(downloads, 1);
    assert.deepEqual(await fs.readFile(good.engine.installerPath), bytes);
    badBytes = true;
    const bad = await create('bad'); await bad.manager.check();
    assert.equal((await bad.manager.download()).phase, 'error'); assert.match(bad.manager.status().error, /checksum mismatch/i);
    await assert.rejects(bad.manager.install(), /Download and verify/);
    version = '0.6.0'; const current = await create('current');
    assert.equal((await current.manager.check()).phase, 'up-to-date');
    version = '0.5.2'; const older = await create('older');
    assert.equal((await older.manager.check()).phase, 'up-to-date');
    assert.equal(downloads, 2);
    assert.ok(requested.every(url => url.startsWith('/marajdesigns215-dot/tweakerzzz/releases')));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
