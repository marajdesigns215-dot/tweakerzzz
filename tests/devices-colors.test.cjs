const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { validateColorConfig, createColorManager } = require('../electron/colors.cjs');
const { recommendDrivers, driverSource, createDriverScanner } = require('../electron/drivers.cjs');
const { createSnapshotSaver } = require('../electron/snapshots.cjs');
const manifest = require('../scripts/windows/tweaks.json');
const config = { displayId: '\\\\.\\DISPLAY1', desktop: 50, sdrConfirmed: true, profiles: [{ processName: 'game.exe', vibrance: 70 }] };

test('color profiles accept exact executable names and reject paths, duplicates, commands and unbounded values', () => {
  assert.deepEqual(validateColorConfig({ ...config, command: 'ignored' }), config);
  for (const changed of [{ displayId: 'any display' }, { desktop: 101 }, { desktop: '50' }, { sdrConfirmed: 'true' }, { profiles: [{ processName: 'C:\\game.exe', vibrance: 70 }] }, { profiles: [{ processName: 'game.exe', vibrance: NaN }] }, { profiles: [config.profiles[0], { processName: 'GAME.exe', vibrance: 80 }] }]) assert.throws(() => validateColorConfig({ ...config, ...changed }));
});

test('color manager saves without applying, starts only reviewed profiles, stops/restores, and persists profiles across sessions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tz-colors-')); const calls = [];
  let alive;
  const factory = () => createColorManager({ directory, executable: 'trusted-helper.exe', spawnProcess: (file, args, options) => {
    assert.equal(file, 'trusted-helper.exe'); assert.equal(options.shell, false); assert.equal(args.length, 1);
    const child = new EventEmitter(); alive = child;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.stdout.setEncoding = child.stderr.setEncoding = () => {};
    let state = { active: false, supported: true, recoveryPending: false, activeProgram: 'Desktop', error: '', displays: [{ id: config.displayId, label: 'Test monitor', vibrance: 50 }] };
    const emit = (id = null) => child.stdout.emit('data', JSON.stringify({ ok: true, requestId: id, data: state }) + '\n');
    child.stdin.write = raw => { const msg = JSON.parse(raw); calls.push(msg); state = { ...state, active: msg.action === 'start' }; emit(msg.requestId); };
    child.stdin.end = () => child.emit('close', 0);
    queueMicrotask(() => emit()); return child;
  } });
  try {
    const manager = factory(); assert.equal((await manager.status()).supported, true);
    await manager.save({ ...config, sdrConfirmed: false }); await assert.rejects(manager.start(), /Confirm SDR/); assert.equal(calls.length, 0);
    await manager.save(config); assert.equal(calls.length, 0); await manager.start(); assert.equal(manager.isActive(), true);
    assert.deepEqual(calls[0].config, config); await assert.rejects(manager.save(config), /Stop/);
    await manager.stop(); assert.equal(manager.isActive(), false); assert.equal(calls[1].action, 'stop'); await manager.close();
    const next = factory(); assert.deepEqual((await next.status()).config, config); await next.start();
    alive.emit('close', 1); assert.equal(next.isActive(), false); await next.close();
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

const report = { hardware: { cpu: { name: 'AMD Ryzen 9 5900X' }, gpu: { name: 'NVIDIA RTX 4060', driverVersion: '32.0.15.0000' }, peripherals: [{ name: 'Logitech G102/G203 LIGHTSYNC Gaming Mouse', identification: 'usb-id', usbId: '046D:C092' }, { name: 'EPOMAKER EP-84', identification: 'reported' }, { name: '1080p webcam', identification: 'generic' }] }, board: { manufacturer: 'Micro-Star International', product: 'MS-7C95', version: '1.0' }, computer: { manufacturer: 'System manufacturer', model: '' }, bios: {}, disks: [], devices: [{ name: 'Realtek audio', category: 'MEDIA' }, { name: 'CORSAIR Commander Pro', category: 'USB' }] };
test('driver recommendations distinguish detected products, unknown webcam models, onboard fans, and OEM packages', () => {
  const cards = recommendDrivers(report);
  assert.ok(cards.some(c => c.source === 'msi' && c.category === 'Motherboard'));
  assert.ok(cards.some(c => c.source === 'logitech' && /G203/.test(c.device)));
  assert.ok(cards.some(c => c.source === 'epomaker'));
  assert.ok(cards.some(c => c.source === null && c.device === '1080p webcam'));
  assert.ok(cards.some(c => c.category === 'Cooling' && c.source === 'corsair'));
  assert.ok(cards.some(c => c.category === 'CPU / chipset' && c.source === 'amd'));
  const oem = recommendDrivers({ ...report, computer: { manufacturer: 'Dell', model: 'Test model' } });
  assert.equal(oem.find(c => c.category === 'Graphics').source, 'dell');
  const unknown = recommendDrivers({ ...report, board: { manufacturer: '', product: '', version: '' }, hardware: { ...report.hardware, peripherals: [{ name: 'HID Keyboard Device', identification: 'generic', usbId: '258A:0001' }] } });
  assert.ok(!unknown.some(c => c.source === 'epomaker')); assert.equal(unknown.find(c => c.category === 'Motherboard').source, null);
  for (const id of ['__proto__', 'constructor', 'https://evil.test', 'file:///C:/x.exe', null]) assert.throws(() => driverSource(id));
  assert.equal(new URL(driverSource('nvidia')).hostname, 'www.nvidia.com');
});

test('driver scan preserves partial failures and excludes serials/instance paths from component inventory', async () => {
  const scanner = createDriverScanner({ readHardware: async () => report.hardware, run: async (_file, args) => {
    assert.ok(args.includes('-Command')); assert.ok(!args.includes('-File'));
    const q = args.at(-1); if (q.includes('Win32_BIOS')) throw new Error('Provider unavailable');
    if (q.includes('Win32_BaseBoard')) return JSON.stringify([{ Manufacturer: 'ASUSTeK', Product: 'TEST BOARD', Version: '1', SerialNumber: 'private' }]);
    return '[]';
  } });
  const scan = await scanner(); assert.equal(scan.board.product, 'TEST BOARD'); assert.equal(scan.warnings[0].component, 'bios'); assert.ok(!JSON.stringify(scan).includes('private'));
});

test('read-only snapshots preserve arbitrary original kinds, list in history, and never execute downloaded scripts', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tz-snapshot-'));
  const registry = manifest.flatMap(t => t.registry).map(s => ({ path: s.path, name: s.name, existed: true, keyExisted: true, kind: 'DWord', value: '-1' }));
  registry[0] = { ...registry[0], kind: 'MultiString', value: ['hello', 'world'] };
  const powerScheme = '381b4222-f694-41f0-9685-ff5bb260df2e';
  const save = createSnapshotSaver({ run: async (_file, args) => {
    assert.ok(args.includes('-Command')); assert.ok(!args.includes('-File')); assert.ok(!args.includes('-ExecutionPolicy'));
    assert.doesNotMatch(args.at(-1), /SetValue|CreateSubKey|setactive|Set-ItemProperty|DeleteValue/);
    return JSON.stringify({ registry, powerScheme });
  } });
  try {
    const result = await save(directory, manifest.map(t => t.id));
    const backup = JSON.parse(await fs.readFile(path.join(directory, result.backupId + '.json')));
    assert.deepEqual(backup.registry, registry); assert.equal(backup.powerScheme, powerScheme); assert.equal(backup.status, 'applied');
    assert.equal((await require('../electron/backups.cjs').listBackups(directory))[0].action, 'snapshot');
    const bad = createSnapshotSaver({ run: async () => JSON.stringify({ registry: [], powerScheme }) });
    await assert.rejects(bad(directory, ['game-mode']), /missing/); assert.equal((await fs.readdir(directory)).length, 1);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
