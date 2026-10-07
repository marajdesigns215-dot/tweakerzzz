const test = require('node:test');
const assert = require('node:assert/strict');
const { createScanner } = require('../electron/scanner.cjs');
const { createStatusReader } = require('../electron/tweak-status.cjs');
const { nativeError } = require('../electron/native-errors.cjs');
const manifest = require('../scripts/windows/tweaks.json');

const host = { platform: () => 'win32', cpus: () => Array.from({ length: 24 }, () => ({ model: 'AMD Ryzen 9 5900X' })), totalmem: () => 32 * 1024 ** 3, version: () => 'Windows 11 Pro', release: () => '10.0.26200' };
const rows = {
  Win32_Processor: [{ Name: 'AMD Ryzen 9 5900X', NumberOfCores: 12, NumberOfLogicalProcessors: 24 }],
  Win32_PhysicalMemory: [{ Capacity: 32 * 1024 ** 3, ConfiguredClockSpeed: 3200 }],
  Win32_OperatingSystem: [{ Caption: 'Windows 11 Pro', BuildNumber: '26200' }],
  Win32_VideoController: [{ Name: 'NVIDIA GeForce RTX 4060', PNPDeviceID: 'PCI\\VEN_10DE' }],
  Win32_LogicalDisk: [{ Size: 2 * 1024 ** 4, FreeSpace: 1024 ** 4 }],
  Win32_PnPEntity: [{ FriendlyName: 'Test mouse', Class: 'Mouse', InstanceId: 'USB\\private-device-id', Status: 'OK' }, { FriendlyName: 'Test keyboard', Class: 'Keyboard', InstanceId: 'HID\\private-serial', Status: 'OK' }],
};
const fixtureRun = async (_file, args) => {
  const name = Object.keys(rows).find(key => args.at(-1).includes(key));
  assert.ok(name, 'Only fixed inventory queries are allowed');
  assert.ok(args.includes('-Command'));
  assert.ok(!args.includes('-File'));
  assert.ok(!args.includes('-ExecutionPolicy'));
  return JSON.stringify({ ok: true, data: rows[name] });
};

test('hardware scan collects real provider data without executing a downloaded script', async () => {
  const scanner = createScanner({ host, run: fixtureRun, exists: () => false });
  const report = await scanner.scanSystem();
  assert.equal(report.cpu.cores, 12);
  assert.equal(report.memory.speedMHz, 3200);
  assert.equal(report.storage.totalGB, 2048);
  assert.equal(report.gpu.vramGB, null);
  assert.equal(report.peripherals.length, 2);
  assert.deepEqual(report.warnings, []);
  assert.ok(!JSON.stringify(report).includes('private-'));
});

test('all optional providers can fail while native CPU, RAM, and Windows details remain usable', async () => {
  const scanner = createScanner({ host, run: async () => { throw new Error('Provider unavailable'); }, exists: () => false });
  const report = await scanner.scanSystem();
  assert.equal(report.cpu.name, 'AMD Ryzen 9 5900X');
  assert.equal(report.cpu.cores, null);
  assert.equal(report.cpu.threads, 24);
  assert.equal(report.memory.totalGB, 32);
  assert.equal(report.memory.speedMHz, null);
  assert.equal(report.storage.totalGB, null);
  assert.equal(report.warnings.length, 6);
  assert.deepEqual(report.peripherals, []);
});

test('peripheral scan queries only peripherals and reports collection failures instead of an empty success', async () => {
  let count = 0;
  const scanner = createScanner({ host, run: async (file, args) => { count++; assert.match(args.at(-1), /Get-PnpDevice/); return fixtureRun(file, args); } });
  assert.equal((await scanner.scanPeripherals()).peripherals.length, 2);
  assert.equal(count, 1);
  const failed = createScanner({ host, run: async () => { throw new Error('Access denied'); } });
  await assert.rejects(failed.scanPeripherals(), /Peripheral scan failed.*Access denied/);
});

test('a GPU driver utility failure cannot fail the PC or peripheral scan', async () => {
  const scanner = createScanner({ host, exists: () => true, run: async (file, args) => { if (file.endsWith('nvidia-smi.exe')) throw new Error('Driver restarting'); return fixtureRun(file, args); } });
  const result = await scanner.scanSystem();
  assert.equal(result.gpu.name, 'NVIDIA GeForce RTX 4060');
  assert.equal(result.gpu.vramGB, null);
  assert.ok(result.warnings.some(w => w.component === 'gpu-memory'));
  assert.equal(result.peripherals.length, 2);
});

test('peripheral enumeration omits disconnected devices and handles WMI fallback fields', async () => {
  const result = await createScanner({ host, run: async () => JSON.stringify({ ok: true, data: [
    { Name: 'Offline mouse', PNPClass: 'Mouse', Status: 'Error', PNPDeviceID: 'USB\\old' },
    { Name: 'Wireless keyboard', PNPClass: 'Keyboard', Status: 'OK', PNPDeviceID: 'BTHENUM\\private', ConfigManagerErrorCode: 0 },
  ] }) }).scanPeripherals();
  assert.deepEqual(result.peripherals, [{ name: 'Wireless keyboard', type: 'Keyboard', connection: 'Bluetooth' }]);
});

test('status reader uses a read-only command and returns each allowlisted setting', async () => {
  const report = { checkedAt: new Date().toISOString(), tweaks: manifest.map(t => ({ id: t.id, status: 'unknown', message: 'Unavailable' })) };
  const read = createStatusReader({ run: async (_file, args) => {
    assert.ok(args.includes('-Command'));
    assert.ok(!args.includes('-File'));
    assert.ok(!args.includes('-ExecutionPolicy'));
    assert.match(args.at(-1), /OpenSubKey\(\$spec.path, \$false\)/);
    assert.doesNotMatch(args.at(-1), /SetValue|CreateSubKey|setactive|Set-ItemProperty|DeleteValue/);
    return '\uFEFF' + JSON.stringify(report);
  } });
  assert.deepEqual(await read(), report);
});

test('blocked downloaded-script errors explain ZIP trust without recommending a weaker execution policy', () => {
  const error = nativeError('PSSecurityException: scan.ps1 is not digitally signed');
  assert.match(error.message, /ZIP > Properties > Unblock/);
  assert.match(error.message, /No execution policy was changed/);
  assert.doesNotMatch(error.message, /Bypass|Unrestricted/);
});
