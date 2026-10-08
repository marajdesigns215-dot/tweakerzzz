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
  console.log(`PASS: live motherboard/system/BIOS/driver queries, ${drivers.recommendations.length} support recommendations.`);
  console.log(`PASS: Windows CPU/RAM inventory, peripheral query, and ${status.tweaks.length} read-only tweak checks. Inventory warnings: ${report.warnings?.length ?? 0}.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
