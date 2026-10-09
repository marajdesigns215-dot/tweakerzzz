// Real, read-only Windows checks. Invoked explicitly by Windows CI, not by
// the portable unit-test glob. No registry, power, or display writes.
const assert = require('node:assert/strict');
const { scanSystem, scanPeripherals } = require('../electron/scanner.cjs');
const { getTweakStatus } = require('../electron/tweak-status.cjs');
const { TWEAK_IDS } = require('../electron/validation.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { saveSnapshot } = require('../electron/snapshots.cjs');
const { scanDrivers } = require('../electron/drivers.cjs');
const { createHardwareMemory } = require('../electron/hardware-memory.cjs');
const { createDriverHistory } = require('../electron/driver-history.cjs');
const { readDriverInstallLog } = require('../electron/driver-install-log.cjs');
const { createDriverUpdateChecker } = require('../electron/driver-updates.cjs');
(async () => {
  assert.equal(process.platform, 'win32', 'Use a Windows runner for live inventory validation.');
  const { parseHardwareReport, parsePeripheralReport } = await import('../src/lib/reports.ts');
  const { parseTweakStatus } = await import('../src/lib/tweak-status.ts');
  const report = parseHardwareReport(await scanSystem());
  assert.ok(report.cpu.threads > 0);
  assert.ok(report.memory.totalGB > 0);
  parsePeripheralReport(await scanPeripherals());
  const status = parseTweakStatus(await getTweakStatus(), [...TWEAK_IDS]);
  assert.equal(status.tweaks.length, 22);
  assert.ok(status.tweaks.some(t => t.status !== 'unknown'), 'The runner could not read any supported settings.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tz-read-snapshot-'));
  const zone = path.resolve('scripts/windows/tweaks.ps1') + ':Zone.Identifier';
  try {
    // Reproduce the downloaded ZIP trust marker from the user's report.
    // Snapshot saving must work without executing or unblocking this file.
    await fs.writeFile(zone, '[ZoneTransfer]\r\nZoneId=3\r\n');
    const result = await saveSnapshot(directory, [...TWEAK_IDS]);
    const saved = JSON.parse(await fs.readFile(path.join(directory, result.backupId + '.json')));
    assert.equal(saved.ids.length, 22); assert.equal(saved.action, 'snapshot');
    const after = await getTweakStatus();
    assert.deepEqual(after.tweaks.map(s => [s.id, s.fingerprint]), status.tweaks.map(s => [s.id, s.fingerprint]));
    assert.match(await fs.readFile(zone, 'utf8'), /ZoneId=3/);
    console.log('PASS: all 22 settings saved without changing registry/power state or unblocking the downloaded script.');
  } finally { await fs.unlink(zone).catch(() => {}); await fs.rm(directory, { recursive: true, force: true }); }
  const drivers = await scanDrivers(); assert.ok(drivers.computer); assert.ok(Array.isArray(drivers.devices));
  assert.equal(drivers.inventoryComplete, true, JSON.stringify(drivers.warnings));
  assert.equal(drivers.componentsComplete, true, JSON.stringify(drivers.warnings));
  assert.ok(drivers.devices.length > 0);
  assert.ok(drivers.devices.some(d => d.driverReported && d.provider && d.version), 'A real provider/version pair must be reported.');
  for (const category of ['Processor', 'Graphics', 'Motherboard', 'BIOS / UEFI']) assert.ok(drivers.components.some(c => c.category === category), category + ' detection');
  const memoryDirectory = await fs.mkdtemp(path.join(os.tmpdir(),'tz-hardware-memory-'));
  let memory = createHardwareMemory({directory:memoryDirectory});
  try {
    const remembered = await memory.scan('drivers',async()=>drivers);
    assert.ok(!remembered.warnings.some(w=>w.component==='Saved scan'),JSON.stringify(remembered.warnings));
    await memory.close(); memory=createHardwareMemory({directory:memoryDirectory});
    const loaded=await memory.load(); assert.equal(loaded.warning,'');
    assert.deepEqual(loaded.system,drivers.hardware);assert.deepEqual(loaded.drivers.components,drivers.components);
    assert.deepEqual(loaded.peripherals.peripherals,drivers.hardware.peripherals);
    console.log('PASS: real Windows installation binding and native inventory survive reopening without another scan.');
    await memory.clear();assert.equal((await memory.load()).system,null);
  } finally {await memory.close();await fs.rm(memoryDirectory,{recursive:true,force:true});}
  const historyDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tz-driver-history-'));
  let manager = createDriverHistory({ directory: historyDirectory, fullScan: async () => drivers });
  try {
    const first = await manager.scan(); assert.equal(first.history.scans, 1); assert.equal(first.history.changes.length, 0);
    await manager.close();
    manager = createDriverHistory({ directory: historyDirectory });
    const restored = await manager.status(); assert.equal(restored.baselineAt, first.history.baselineAt);
    const second = await manager.scan(); assert.equal(second.history.scans, 2);
    assert.equal(second.history.deviceCount, second.devices.length);
    assert.ok(second.history.changes.every(c => c.previousScanAt === first.history.lastScanAt));
    console.log(`PASS: real hardware baseline survives reopening; second live scan retained ${second.history.changes.length} observed changes.`);
  } finally { await manager.close(); await fs.rm(historyDirectory, { recursive: true, force: true }); }
  const installationLog = await readDriverInstallLog();
  assert.equal(typeof installationLog.available, 'boolean'); assert.ok(installationLog.message); assert.ok(installationLog.entries.length <= 100);
  const checker = createDriverUpdateChecker();
  let updateEvidence;
  try {
    const offers = await checker.check(); assert.ok(Array.isArray(offers.packages)); assert.ok(offers.message);
    updateEvidence = { complete: offers.complete, count: offers.packages.length, message: offers.message };
    console.log('PASS: real read-only Windows Update search:', JSON.stringify(updateEvidence));
    console.log(`::notice title=Driver availability check::Real Windows Update search completed; complete=${offers.complete}; offers=${offers.packages.length}. No driver packages were installed.`);
  } catch (error) {
    // A managed runner may disable its update source. Keep that limitation in the
    // QA artifact; failures must never be presented as a successful latest check.
    assert.match(String(error), /0x(?:8024|80072|80070422|80070005)|did not respond within/i, 'Unexpected driver update query failure');
    assert.equal(checker.status().result, null);
    updateEvidence = { available: false, error: String(error) };
    console.log('Windows Update availability could not be verified on this runner:', String(error));
    console.log('::warning title=Driver availability unverified::The configured update source was unavailable on this Windows runner. See windows-hardware-updates.json for details.');
  } finally { await checker.close(); }
  await fs.mkdir('release/qa', { recursive: true });
  await fs.writeFile('release/qa/windows-hardware-updates.json', JSON.stringify({ deviceCount: drivers.devices.length, components: drivers.components.map(c => ({ category: c.category, name: c.name })), inventoryComplete: drivers.inventoryComplete, componentsComplete: drivers.componentsComplete, updateEvidence, installationLog: { available: installationLog.available, entries: installationLog.entries.length, message: installationLog.message } }, null, 2));
  console.log(`PASS: live motherboard/system/BIOS/driver queries, ${drivers.recommendations.length} support recommendations.`);
  console.log(`PASS: Windows CPU/RAM inventory, peripheral query, and ${status.tweaks.length} read-only tweak checks. Inventory warnings: ${report.warnings?.length ?? 0}.`);
})().catch(error => {
  console.error(error);
  if (process.env.GITHUB_ACTIONS === 'true') console.log('::error title=Windows hardware validation failed::' + String(error.stack || error).slice(0, 5000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'));
  process.exitCode = 1;
});
