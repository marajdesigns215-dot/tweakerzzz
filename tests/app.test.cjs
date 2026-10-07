const test = require('node:test');
const assert = require('node:assert/strict');

const validReport = () => ({ cpu: { name: 'AMD Ryzen 9 5900X', cores: 12, threads: 24 }, gpu: { name: 'RTX 4060', vramGB: 8 }, memory: { totalGB: 32, speedMHz: 3200 }, os: { name: 'Windows 11 Pro', build: '26200' }, storage: { totalGB: 2740, freeGB: 1550 }, peripherals: [{ name: 'HID mouse', type: 'Mouse', connection: 'USB' }], scannedAt: '2026-10-07T00:00:00.000Z' });

test('hardware report normalizes direct and exported reports, including unknown VRAM', async () => {
  const { parseHardwareReport } = await import('../src/lib/reports.ts');
  assert.deepEqual(parseHardwareReport(validReport()), validReport());
  const input = validReport(); input.gpu.vramGB = null;
  assert.equal(parseHardwareReport({ source: 'report', system: input }).gpu.vramGB, null);
});
test('hardware report rejects incomplete, excessive, and malformed data before rendering', async () => {
  const { parseHardwareReport } = await import('../src/lib/reports.ts');
  const changes = [r => delete r.memory.speedMHz, r => r.peripherals = [null], r => r.cpu.name = {}, r => r.storage.freeGB = 9999, r => r.scannedAt = 'not-a-date', r => r.gpu.vramGB = -1, r => r.peripherals[0].type = 'Execute', r => r.cpu.name = 'x'.repeat(251)];
  for (const mutate of changes) { const report = validReport(); mutate(report); assert.throws(() => parseHardwareReport(report)); }
  for (const input of [null, [], 'data', {}]) assert.throws(() => parseHardwareReport(input));
});
test('catalog contains 50+ distinct settings and automatic IDs match the native allowlist', async () => {
  const { tweaks, categories } = await import('../src/data/tweaks.ts');
  const { TWEAK_IDS } = require('../electron/validation.cjs');
  assert.ok(tweaks.length >= 50);
  assert.equal(new Set(tweaks.map(t => t.id)).size, tweaks.length);
  assert.deepEqual(tweaks.filter(t => t.mode === 'automatic').map(t => t.id).sort(), [...TWEAK_IDS].sort());
  for (const t of tweaks) { assert.ok(categories.includes(t.category)); assert.ok(t.details.length > 40); if (t.mode === 'guided') assert.ok(t.steps?.length > 0); }
});
