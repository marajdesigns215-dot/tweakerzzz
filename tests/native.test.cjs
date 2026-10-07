'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { TWEAK_IDS, validateTweakIds, validateBackupId, validateSettingsTarget, validateDisplayMode } = require('../electron/validation.cjs');

test('the native optimization boundary accepts only unique known IDs', () => {
  assert.deepEqual(validateTweakIds(['game-mode', 'power-plan']), ['game-mode', 'power-plan']);
  for (const ids of [[], null, 'game-mode', ['game-mode', 'game-mode'], ['window-shadows'], ['disable-defender'], ['game-mode; Remove-Item C:\\'], [{ toString: () => 'game-mode' }]]) {
    assert.throws(() => validateTweakIds(ids));
  }
  const original = ['game-mode'];
  const validated = validateTweakIds(original);
  original.push('arbitrary-command');
  assert.deepEqual(validated, ['game-mode']);
});

test('JavaScript and PowerShell optimization allowlists agree', () => {
  const script = fs.readFileSync(path.join(__dirname, '../scripts/windows/tweaks.ps1'), 'utf8');
  const manifest = script.slice(script.indexOf('$manifest = @{'), script.indexOf('$allowedValues = @{}'));
  const powershellIds = [...manifest.matchAll(/^\s*'([a-z-]+)' = /gm)].map(match => match[1]);
  assert.deepEqual(powershellIds.sort(), [...TWEAK_IDS].sort());
});

test('backup requests cannot traverse directories or supply filenames', () => {
  const id = '0123456789abcdef0123456789abcdef';
  assert.equal(validateBackupId(id), id);
  for (const invalid of ['../' + id, id + '.json', 'C:\\backup.json', '', null, 12, '../'.repeat(10)]) {
    assert.throws(() => validateBackupId(invalid));
  }
});

test('settings targets cannot launch arbitrary commands or protocols', () => {
  assert.equal(validateSettingsTarget('graphics'), 'ms-settings:display-advancedgraphics');
  assert.equal(validateSettingsTarget('nvidia'), 'nvidia');
  for (const invalid of ['__proto__', 'constructor', 'toString', 'https://example.com', 'file:///C:/Windows/System32/cmd.exe', 'ms-settings:display', null]) {
    assert.throws(() => validateSettingsTarget(invalid));
  }
});

test('display requests require bounded integers and discard extra fields', () => {
  assert.deepEqual(validateDisplayMode({ width: 1920, height: 1080, refreshRate: 144, command: 'ignored' }), { width: 1920, height: 1080, refreshRate: 144 });
  for (const mode of [null, [], { width: '1920', height: 1080, refreshRate: 144 }, { width: 1920, height: 1080, refreshRate: 0 }, { width: -1, height: 1080, refreshRate: 144 }, { width: 1920, height: Infinity, refreshRate: 144 }, { width: 1920, height: 1080, refreshRate: 143.5 }, { width: 99999, height: 1080, refreshRate: 144 }]) {
    assert.throws(() => validateDisplayMode(mode));
  }
});

async function nativeHarness({ singleInstance = true } = {}) {
  const handlers = new Map(), calls = [], children = [], timers = new Map(), windows = [], errors = [];
  const app = new EventEmitter();
  app.isPackaged = false;
  app.whenReady = () => Promise.resolve();
  app.getPath = () => '/tmp/tweaker-test-user-data';
  app.requestSingleInstanceLock = () => singleInstance;
  app.quit = () => { app.quitCalled = true; };
  class FakeWindow {
    constructor() {
      windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.setWindowOpenHandler = fn => { this.newWindowHandler = fn; };
      this.webContents.session = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} };
    }
    loadURL(url) { this.webContents.mainFrame.url = url; }
    static getAllWindows() { return windows; }
  }
  const spawn = (executable, args, options) => {
    const child = new EventEmitter();
    children.push(child);
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdout.setEncoding = child.stderr.setEncoding = () => {};
    child.kill = () => {};
    const emit = data => child.stdout.emit('data', JSON.stringify({ ok: true, data }) + '\n');
    child.expire = () => { emit({ event: 'reverted' }); child.emit('close', 0); };
    child.stdin.write = raw => {
      const payload = JSON.parse(raw);
      child.display = true;
      calls.push({ executable, args, options, payload });
      emit({ event: 'applied' });
    };
    child.stdin.end = raw => {
      if (child.display) {
        child.decision = raw?.trim() || 'EOF';
        emit({ event: child.decision === 'confirm' ? 'confirmed' : 'reverted' });
        child.emit('close', 0);
      } else {
        const payload = JSON.parse(raw);
        calls.push({ executable, args, options, payload });
        const data = payload.action === 'apply' ? { backupId: '0123456789abcdef0123456789abcdef', applied: payload.ids, message: 'OK' } : { message: 'OK' };
        emit(data); child.emit('close', 0);
      }
    };
    return child;
  };
  const nativeDirectory = path.join(__dirname, '../electron');
  const fakeRequire = id => {
    if (id === 'electron') return { app, BrowserWindow: FakeWindow, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, shell: { openExternal: async () => {}, openPath: async () => '' }, dialog: { showErrorBox: (title, message) => errors.push({ title, message }) } };
    if (id === 'node:child_process') return { spawn };
    if (id === './validation.cjs') return require('../electron/validation.cjs');
    return require(id);
  };
  vm.runInNewContext(fs.readFileSync(path.join(nativeDirectory, 'main.cjs'), 'utf8'), {
    require: fakeRequire, __dirname: nativeDirectory, URL, console,
    process: { platform: 'win32', argv: [], env: { SystemRoot: 'C:\\Windows' } },
    setTimeout: (fn, milliseconds) => { const id = {}; timers.set(id, { fn, milliseconds }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  await Promise.resolve();
  const window = windows[0];
  const event = window && { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  return { app, calls, children, errors, timers, window, event, invoke: (channel, ...args) => handlers.get(channel)(event, ...args), invokeAs: (channel, sender, ...args) => handlers.get(channel)(sender, ...args) };
}

test('IPC rejects subframes and remote documents before starting a native process', async () => {
  const app = await nativeHarness();
  await assert.rejects(app.invokeAs('tweaker:scan', { ...app.event, senderFrame: { url: app.event.senderFrame.url } }), /Untrusted/);
  app.event.senderFrame.url = 'https://example.com/';
  await assert.rejects(app.invoke('tweaker:scan'), /Untrusted/);
  assert.equal(app.calls.length, 0);
});

test('applying tweaks sends allowlisted JSON through stdin without a shell', async () => {
  const app = await nativeHarness();
  const result = await app.invoke('tweaker:apply', ['game-mode']);
  assert.deepEqual(Array.from(result.applied), ['game-mode']);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].options.shell, false);
  assert.deepEqual(app.calls[0].payload.ids, ['game-mode']);
  assert.ok(app.calls[0].args.includes('-NonInteractive'));
  assert.equal(app.calls[0].args.some(argument => argument.includes('game-mode')), false);
  await assert.rejects(app.invoke('tweaker:apply', ['arbitrary-command']), /unsupported/i);
  assert.equal(app.calls.length, 1);
});

test('display test delegates its mode and timeout lifetime to the native helper', async () => {
  const app = await nativeHarness();
  const mode = { width: 1920, height: 1080, refreshRate: 144 };
  await app.invoke('tweaker:display-set', mode);
  assert.deepEqual(app.calls[0].payload, { action: 'test', mode });
  assert.equal(app.calls[0].options.shell, false);
  app.children[0].expire();
  await assert.rejects(app.invoke('tweaker:display-confirm'), /expired/);
  assert.equal(app.errors.length, 0);
});

test('confirming a display test uses the same native helper and requires its acknowledgement', async () => {
  const app = await nativeHarness();
  await app.invoke('tweaker:display-set', { width: 1920, height: 1080, refreshRate: 144 });
  await app.invoke('tweaker:display-confirm');
  assert.equal(app.calls.length, 1);
  assert.equal(app.children[0].decision, 'confirm');
  await assert.rejects(app.invoke('tweaker:display-confirm'), /expired/);
});

test('a second test cancels its predecessor before changing another display mode', async () => {
  const app = await nativeHarness();
  await app.invoke('tweaker:display-set', { width: 1920, height: 1080, refreshRate: 144 });
  await app.invoke('tweaker:display-set', { width: 1440, height: 1080, refreshRate: 60 });
  assert.equal(app.children[0].decision, 'cancel');
  assert.equal(app.calls.length, 2);
  await app.invoke('tweaker:display-confirm');
});

test('renderer failure cancels an unconfirmed native display test', async () => {
  const app = await nativeHarness();
  await app.invoke('tweaker:display-set', { width: 1920, height: 1080, refreshRate: 144 });
  app.window.webContents.emit('render-process-gone');
  await Promise.resolve();
  assert.equal(app.children[0].decision, 'cancel');
  await assert.rejects(app.invoke('tweaker:display-confirm'), /expired/);
});

test('a second application instance cannot register native handlers', async () => {
  const result = await nativeHarness({ singleInstance: false });
  assert.equal(result.app.quitCalled, true);
  assert.equal(result.window, undefined);
  assert.equal(result.calls.length, 0);
});
