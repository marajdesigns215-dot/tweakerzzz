// Real, read-only Windows checks. Invoked explicitly by Windows CI, not by
// the portable unit-test glob. No registry, power, or display writes.
const assert = require('node:assert/strict');
const { scanSystem, scanPeripherals } = require('../electron/scanner.cjs');
const { getTweakStatus } = require('../electron/tweak-status.cjs');
const { TWEAK_IDS } = require('../electron/validation.cjs');
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
  console.log(`PASS: Windows CPU/RAM inventory, peripheral query, and ${status.tweaks.length} read-only tweak checks. Inventory warnings: ${report.warnings?.length ?? 0}.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
