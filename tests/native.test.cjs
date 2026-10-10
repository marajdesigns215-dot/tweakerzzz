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
  const manifest = require('../scripts/windows/tweaks.json');
  assert.deepEqual(manifest.map(t => t.id).sort(), [...TWEAK_IDS].sort());
  for (const item of manifest) { for (const value of item.registry) { assert.ok(['String', 'DWord'].includes(value.kind)); assert.ok(!value.path.startsWith('HKLM')); } }
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

async function nativeHarness({ singleInstance = true, updaterEngine = null } = {}) {
  const handlers = new Map(), calls = [], children = [], timers = new Map(), windows = [], errors = [];
  const app = new EventEmitter();
  app.isPackaged = false;
  app.getVersion = () => '0.6.0';
  app.whenReady = () => Promise.resolve();
  app.getPath = () => '/tmp/tweaker-test-user-data';
  app.requestSingleInstanceLock = () => singleInstance;
  app.quit = () => { app.quitCalled = true; };
  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.setWindowOpenHandler = fn => { this.newWindowHandler = fn; };
      this.webContents.session = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} };
    }
    isDestroyed() { return false; }
    isVisible() { return !this.hidden; }
    isMinimized() { return false; }
    hide() { this.hidden = true; }
    show() { this.hidden = false; }
    focus() {}
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
  const capture = { active: false, isActive() { return this.active; }, async start(input) { require('../electron/capture.cjs').validateCapture(input); this.active = true; return { active: true }; }, async stop() { this.active = false; }, status() { return { active: this.active }; } };
  class FakeTray extends EventEmitter { setToolTip() {} setContextMenu() {} }
  const colors = { active: false, recovery: false, isActive() { return this.active; }, hasRecoveryPending() { return this.recovery; }, close: async () => {} };
  const drivers = { busy: false, isBusy() { return this.busy; }, start() {}, close: async () => {}, scan: async () => ({ recommendations: [] }), status: async () => ({ changes: [] }) };
  const driverUpdates = { busy: false, isBusy() { return this.busy; }, check: async () => ({ packages: [] }), status: () => ({ checking: false, result: null }), cancel() {}, close: async () => {} };
  const componentUpdates = { busy:false,isBusy(){return this.busy;},invalidate(){},status:()=>({checking:false,result:null}),close:async()=>{},check:async()=>({items:[]}) };
  const fakeRequire = id => {
    if (id === './updates.cjs') return { ...require('../electron/updates.cjs'), createUpdateManager: options => require('../electron/updates.cjs').createUpdateManager({ ...options, engine: updaterEngine }) };
    if (id === './snapshots.cjs') return { saveSnapshot: async (_directory, ids) => ({ backupId: 'a'.repeat(32), applied: ids }) };
    if (id === './drivers.cjs') return { scanDrivers: async () => ({ recommendations: [] }), driverSource: require('../electron/drivers.cjs').driverSource };
    if (id === './hardware-memory.cjs') return { createHardwareMemory: () => ({ load:async()=>({system:null,drivers:null,peripherals:null,warning:''}),scan:async(_kind,task)=>task(),clear:async()=>({}),isBusy:()=>false,close:async()=>{} }) };
    if (id === './driver-history.cjs') return { createDriverHistory: () => drivers };
    if (id === './driver-install-log.cjs') return { readDriverInstallLog: async () => ({ available: true, entries: [] }) };
    if (id === './component-updates.cjs') return { createComponentUpdateChecker: () => componentUpdates };
    if (id === './vendor-releases.cjs') return require('../electron/vendor-releases.cjs');
    if (id === './driver-updates.cjs') return { createDriverUpdateChecker: () => driverUpdates };
    if (id === './colors.cjs') return { createColorManager: () => colors };
    if (id === './obs.cjs') return { createObsClient: () => ({ status: () => ({ connected: false }) }) };
    if (id === './capture.cjs') return { createCaptureManager: () => capture, listPrograms: async () => [] };
    if (id === './presentmon.json') return require('../electron/presentmon.json');
    if (id === 'electron') return { app, BrowserWindow: FakeWindow, Tray: FakeTray, Menu: { buildFromTemplate: data => data }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, shell: { openExternal: async () => {}, openPath: async () => '' }, dialog: { showErrorBox: (title, message) => errors.push({ title, message }) } };
    if (id === 'node:child_process') return { spawn };
    if (id === './validation.cjs') return require('../electron/validation.cjs');
    if (id === './native-errors.cjs') return require('../electron/native-errors.cjs');
    if (id === './scanner.cjs') return { scanSystem: async () => ({ source: 'scanner' }), scanPeripherals: async () => ({ peripherals: [] }) };
    if (id === './tweak-status.cjs') return { getTweakStatus: async () => ({ tweaks: [], checkedAt: new Date().toISOString() }) };
    if (id === './backups.cjs') return { listBackups: async () => [] };
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
  return { app, calls, children, errors, timers, window, event, capture, colors, drivers, driverUpdates, componentUpdates, invoke: (channel, ...args) => handlers.get(channel)(event, ...args), invokeAs: (channel, sender, ...args) => handlers.get(channel)(sender, ...args) };
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


test('read-only scanning and status requests do not launch downloaded PowerShell scripts', async () => {
  const app = await nativeHarness();
  assert.equal((await app.invoke('tweaker:scan')).source, 'scanner');
  assert.equal((await app.invoke('tweaker:peripherals')).peripherals.length, 0);
  const statuses = await Promise.all([app.invoke('tweaker:status'), app.invoke('tweaker:status')]);
  assert.equal(statuses.length, 2);
  assert.equal(app.calls.length, 0);
});


test('FPS recording keeps a closed window in the tray and blocks configuration changes', async () => {
  const app = await nativeHarness();
  await app.invoke('tweaker:capture-start', { processName: 'game.exe', phase: 'before', context: 'Gaming', seconds: 30, scenario: 'Same scene' });
  let prevented = false;
  app.window.emit('close', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(app.window.hidden, true);
  await assert.rejects(app.invoke('tweaker:apply', ['game-mode']), /Stop the FPS recording/);
  await assert.rejects(app.invoke('tweaker:preferences', 'defaults', ['game-mode']), /Stop the FPS recording/);
  await assert.rejects(app.invoke('tweaker:display-set', { width: 1920, height: 1080, refreshRate: 60 }), /Stop the FPS recording/);
  await assert.rejects(app.invoke('tweaker:driver-update-check'), /Stop the FPS recording/);
  await assert.rejects(app.invoke('tweaker:component-update-check','game-ready'), /Stop the FPS recording/);
  await assert.rejects(app.invoke('tweaker:drivers'), /Stop the FPS recording/);
  await app.invoke('tweaker:capture-stop');
  await app.invoke('tweaker:preferences', 'disable', ['game-mode']);
  assert.equal(app.calls[0].payload.action, 'disable');
  await assert.rejects(app.invoke('tweaker:preferences', 'factory-reset-pc', ['game-mode']), /Unsupported/);
  app.app.emit('second-instance'); assert.equal(app.window.hidden, false);
});

test('pending hardware and driver offer checks cannot overlap a new FPS capture', async () => {
  const h = await nativeHarness(), input = { processName: 'game.exe', phase: 'before', context: 'Gaming', seconds: 30, scenario: 'Same scene' };
  h.drivers.busy = true; await assert.rejects(h.invoke('tweaker:capture-start', input), /hardware or driver update check/);
  h.drivers.busy = false; h.driverUpdates.busy = true; await assert.rejects(h.invoke('tweaker:capture-start', input), /hardware or driver update check/);
  h.driverUpdates.busy = false; h.componentUpdates.busy = true; await assert.rejects(h.invoke('tweaker:capture-start', input), /hardware or driver update check/);
  h.componentUpdates.busy = false; await h.invoke('tweaker:capture-start', input); assert.equal(h.capture.active, true);
});

test('update installation is blocked during FPS recording, color recovery, and display tests', async () => {
  const { FakeUpdater, deferred } = require('./helpers/updater.cjs');
  const engine = new FakeUpdater();
  const h = await nativeHarness({ updaterEngine: engine });
  await assert.rejects(h.invokeAs('tweaker:update-check', { sender: {}, senderFrame: {} }), /Untrusted/);
  assert.equal(engine.checks, 0);
  await h.invoke('tweaker:update-check'); await h.invoke('tweaker:update-download');
  h.capture.active = true;
  assert.match((await h.invoke('tweaker:update-install')).error, /Stop the FPS recording/);
  h.capture.active = false;
  const applying = h.invoke('tweaker:apply', ['game-mode']);
  assert.match((await h.invoke('tweaker:update-install')).error, /current Windows operation/);
  await applying;
  h.colors.active = true;
  assert.match((await h.invoke('tweaker:update-install')).error, /Stop color profiles/);
  h.colors.active = false; h.colors.recovery = true;
  assert.match((await h.invoke('tweaker:update-install')).error, /restore the display/);
  h.colors.recovery = false;
  await h.invoke('tweaker:display-set', { width: 1920, height: 1080, refreshRate: 144 });
  assert.match((await h.invoke('tweaker:update-install')).error, /resolution test/);
  h.children.at(-1).expire(); await Promise.resolve();
  assert.equal(engine.installs, 0);
  const close = deferred(); h.colors.close = () => close.promise;
  const install = h.invoke('tweaker:update-install');
  await assert.rejects(h.invoke('tweaker:apply', ['game-mode']), /update is being installed/);
  assert.equal((await h.invoke('tweaker:update-status')).phase, 'installing');
  close.resolve(); await install; assert.equal(engine.installs, 1);
});

test('component-scoped update IPC forwards selected IDs with the native scan, never a renderer-supplied report',async()=>{
  const h=await nativeHarness();const report=await h.invoke('tweaker:drivers');let received;
  h.componentUpdates.check=async(...args)=>{received=args;return {items:[]};};
  await h.invoke('tweaker:component-update-check','studio',['selected-audio']);
  assert.deepEqual(received,[report,'studio',['selected-audio']]);
  received=null;await assert.rejects(h.invokeAs('tweaker:component-update-check',{sender:{},senderFrame:{}},'game-ready',['selected-audio']),/Untrusted/);assert.equal(received,null);
});
