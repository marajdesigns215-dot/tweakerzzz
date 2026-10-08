'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createUpdateManager, releaseDetails, FEED } = require('../electron/updates.cjs');
const { FakeUpdater, deferred, updateInfo } = require('./helpers/updater.cjs');
const manager = (engine, options = {}) => createUpdateManager({ engine, currentVersion: '0.6.0', ...options });

test('updates use the fixed public tester feed and never start checks, downloads or installation implicitly', async () => {
  const engine = new FakeUpdater(), updates = manager(engine);
  assert.deepEqual(engine.feed, FEED);
  assert.equal(engine.autoDownload, false); assert.equal(engine.autoInstallOnAppQuit, false);
  assert.equal(engine.allowPrerelease, true); assert.equal(engine.allowDowngrade, false);
  assert.equal(engine.disableWebInstaller, true);
  assert.equal(updates.status().phase, 'idle'); assert.equal(engine.checks, 0);
  await assert.rejects(updates.install(), /Download and verify/);
  const result = await updates.check();
  assert.equal(result.phase, 'available'); assert.equal(result.availableVersion, '0.7.0');
  assert.equal(result.releaseNotes, 'Optional update.');
  assert.equal(engine.downloads, 0); assert.equal(engine.installs, 0);
  await updates.download();
  assert.equal(updates.status().phase, 'downloaded'); assert.equal(engine.installs, 0);
  await updates.check(); assert.equal(engine.checks, 1, 'Keep the verified download until user chooses installation');
  engine.emit('quit'); assert.equal(engine.installs, 0);
  await updates.install(); assert.equal(engine.installs, 1); assert.deepEqual(engine.installArgs, [false, true]);
  await assert.rejects(updates.install(), /Download and verify/);
});

test('check/download concurrency and progress do not start extra operations', async () => {
  const engine = new FakeUpdater(), updates = manager(engine);
  engine.checkWait = deferred(); const first = updates.check();
  assert.equal((await updates.check()).phase, 'checking'); assert.equal(engine.checks, 1);
  engine.checkWait.resolve(); await first;
  engine.downloadWait = deferred(); const download = updates.download();
  await assert.rejects(updates.download(), /Check for an available/);
  engine.emit('download-progress', { percent: 40.2, transferred: 400, total: 1000 });
  assert.equal(updates.status().progress.percent, 40.2);
  const copy = updates.status(); copy.progress.percent = 99; assert.equal(updates.status().progress.percent, 40.2);
  await updates.check(); assert.equal(engine.checks, 1);
  engine.downloadWait.resolve(); await download;
  assert.equal(updates.status().phase, 'downloaded');
});

test('cancelled downloads cannot install and can be checked and retried', async () => {
  const engine = new FakeUpdater(), updates = manager(engine);
  await updates.check(); engine.downloadWait = deferred(); const download = updates.download();
  assert.equal(updates.cancel().phase, 'cancelling'); assert.equal(engine.token.cancelled, true);
  await download; assert.equal(updates.status().phase, 'idle'); assert.equal(updates.status().error, '');
  await assert.rejects(updates.install());
  engine.downloadWait = null; await updates.check(); await updates.download();
  assert.equal(updates.status().phase, 'downloaded'); assert.equal(engine.downloads, 2);
});

test('offline and checksum errors leave the current app usable without allowing installation', async () => {
  const engine = new FakeUpdater(), updates = manager(engine);
  engine.checkError = Error('Network unavailable');
  assert.equal((await updates.check()).phase, 'error'); assert.match(updates.status().error, /Network/);
  engine.checkError = null; await updates.check();
  engine.downloadError = Error('sha512 checksum mismatch');
  assert.equal((await updates.download()).phase, 'error');
  await assert.rejects(updates.install()); assert.equal(engine.installs, 0);
  engine.downloadError = null; await updates.check(); await updates.download();
  assert.equal(updates.status().phase, 'downloaded');
});

test('only the expected Windows installer and a full SHA512 checksum can reach download', async () => {
  for (const change of [i => i.version = '../bad', i => i.files[0].url = 'https://other.example/install.exe', i => i.files[0].url = '../install.exe', i => i.files[0].sha512 = 'bad', i => i.files = []]) {
    const engine = new FakeUpdater(), updates = manager(engine); change(engine.info);
    assert.equal((await updates.check()).phase, 'error');
    await assert.rejects(updates.download()); assert.equal(engine.downloads, 0);
  }
  assert.equal(releaseDetails({ ...updateInfo(), releaseNotes: '<script>alert(1)</script>' }).releaseNotes, 'alert(1)');
});

test('up-to-date and source builds do not offer downloads', async () => {
  const engine = new FakeUpdater(), updates = manager(engine); engine.available = false;
  assert.equal((await updates.check()).phase, 'up-to-date'); assert.ok(updates.status().checkedAt);
  await assert.rejects(updates.download());
  const source = manager(null); assert.equal(source.status().supported, false);
  await assert.rejects(source.check(), /Install the Windows/);
});

test('installation waits for native cleanup, retains downloads when blocked, and reports installer failures', async () => {
  const engine = new FakeUpdater(); let blocked = true; const close = deferred();
  const updates = manager(engine, { prepareInstall: async () => { if (blocked) throw Error('Stop recording'); await close.promise; } });
  await updates.check(); await updates.download();
  assert.equal((await updates.install()).phase, 'downloaded'); assert.match(updates.status().error, /Stop recording/); assert.equal(engine.installs, 0);
  blocked = false; const install = updates.install();
  assert.equal(updates.isInstalling(), true); assert.equal(engine.installs, 0);
  close.resolve(); await install; assert.equal(engine.installs, 1);
  engine.emit('error', Error('Installer launch failed'));
  assert.equal(updates.isInstalling(), false); assert.equal(updates.status().phase, 'error');
});
