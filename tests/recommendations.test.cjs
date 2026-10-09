const { test } = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../scripts/windows/tweaks.json');
const hardware = { cpu: { name: 'AMD Ryzen 9 5900X', cores: 12, threads: 24 }, gpu: { name: 'NVIDIA GeForce RTX 4060', vramGB: 8, driverVersion: '32.0.15.1234' }, memory: { totalGB: 32, speedMHz: 3200 }, os: { name: 'Windows 11', build: '26200' }, storage: { totalGB: 2000, freeGB: 1200 }, scannedAt: new Date().toISOString(), peripherals: [] };
function states(after = false, extra = false) { return { checkedAt: new Date().toISOString(), tweaks: manifest.map(t => ({ id: t.id, status: after && (t.id === 'game-mode' || (extra && t.id === 'game-dvr')) ? 'enabled' : 'not-enabled', fingerprint: (after && (t.id === 'game-mode' || (extra && t.id === 'game-dvr')) ? 'b' : 'a').repeat(64), message: 'Test state' })) }; }
function run(phase, index, factor = 1.1) {
  const start = Date.UTC(2026, 9, 8, phase === 'before' ? 1 : 3, index * 3);
  return { id: phase + index, phase, processName: 'cs2.exe', context: 'Gaming', scenario: 'same demo', seconds: 120, telemetry: false, benchmark: { experiment: 'Game Mode', resolution: '1080p', graphics: 'Low / native', gameBuild: '123', fpsCap: 0, verified: true }, version: 1, status: 'completed', startedAt: new Date(start).toISOString(), endedAt: new Date(start + 120000).toISOString(), collector: 'PresentMon 2.3.0', hardware, hardwareKey: 'same-hardware', settings: states(phase === 'after'), settingsEnd: states(phase === 'after'), summary: { metricsVersion: 2, measurementBasis: 'cpu-start-interval', qualityIssues: [], frames: 12000, sampledSeconds: 120, averageFps: phase === 'after' ? 100 * factor : 100, onePercentLow: phase === 'after' ? 60 * factor : 60, p95FrameMs: phase === 'after' ? 20 / factor : 20, otherStreamFrames: 0 }, error: '' };
}
const repeated = factor => ['before', 'after'].flatMap(phase => [0,1,2].map(index => run(phase, index, factor)));

test('game recommendations use exact executable, hardware vendor/capacity, workload, and current state', async () => {
  const { recommend } = await import('../src/lib/recommendations.ts');
  const input = { processName: 'VALORANT-Win64-Shipping.exe', context: 'Gaming', hardware, settings: states(true) };
  const advice = recommend(input);
  assert.equal(advice.game.id, 'valorant'); assert.ok(advice.items.some(t => t.id === 'nvidia-reflex'));
  assert.ok(!advice.items.some(t => t.id === 'dlss-quality')); assert.ok(!advice.items.some(t => t.id.startsWith('obs-')));
  assert.equal(advice.items.find(t => t.id === 'game-mode').configured, true);
  assert.ok(advice.items.some(t => t.id === 'ryzen-balanced'));
  const amd = recommend({ ...input, processName: 'cyberpunk2077.exe', hardware: { ...hardware, gpu: { name: 'AMD Radeon RX 7800 XT', vramGB: 16 } }, context: 'Recording' });
  assert.ok(!amd.items.some(t => /nvidia|nvenc|dlss|vram-budget/.test(t.id)));
  assert.ok(amd.items.some(t => t.id === 'obs-headroom'));
  const streaming = recommend({ ...input, context: 'Streaming', usesWindowsCapture: false });
  assert.ok(streaming.items.some(t => t.id === 'obs-nvenc-h264')); assert.ok(streaming.items.some(t => t.id === 'game-dvr'));
  assert.ok(!recommend({ ...input, context: 'Streaming', usesWindowsCapture: true }).items.some(t => t.id === 'game-dvr'));
  const unknown = recommend({ ...input, hardware: null, processName: 'not-valorant.exe', settings: null });
  assert.equal(unknown.game.id, 'generic'); assert.equal(unknown.hardwareKnown, false); assert.ok(!unknown.items.some(t => /nvidia|dlss|vram/.test(t.id)));
  assert.ok(unknown.items.every(t => t.reason && t.tradeoff)); assert.equal(unknown.items.find(t => t.id === 'game-mode').stateKnown, false);
});
test('repeated evidence distinguishes consistent improvements and regressions without reusing baselines', async () => {
  const { analyzeBenchmarks } = await import('../src/lib/benchmark-evidence.ts');
  const improved = analyzeBenchmarks(repeated(1.1)).findings[0];
  assert.equal(improved.verdict, 'improved'); assert.equal(improved.pairs, 3); assert.deepEqual(improved.changedIds, ['game-mode']);
  assert.equal(new Set(improved.beforeIds).size, 3);
  assert.equal(analyzeBenchmarks(repeated(.9)).findings[0].verdict, 'regressed');
  assert.equal(analyzeBenchmarks([run('before',0), run('after',0), run('after',1), run('after',2)]).findings[0].pairs, 1);
  assert.equal(analyzeBenchmarks([run('before',0), run('after',0)]).findings[0].verdict, 'collect-more');
  assert.equal(analyzeBenchmarks([...repeated(1.1), ...repeated(1.1)]).findings[0].pairs, 3);
});
test('evidence excludes changed hardware/drivers/conditions, short runs, unknown settings and mid-run changes', async () => {
  const { analyzeBenchmarks, evidenceExclusion } = await import('../src/lib/benchmark-evidence.ts');
  for (const mutate of [r => r.hardwareKey = 'other', r => r.benchmark.resolution = '1440p', r => r.telemetry = true, r => r.benchmark.gameBuild = 'different', r => r.seconds = 300]) {
    const records = repeated(1.1); records.filter(r => r.phase === 'after').forEach(mutate); assert.equal(analyzeBenchmarks(records).findings.length, 0);
  }
  for (const mutate of [r => r.hardware.gpu.driverVersion = undefined, r => r.settingsEnd = undefined, r => r.summary.sampledSeconds = 15, r => r.benchmark.verified = false, r => r.settings.tweaks[0].status = 'unknown', r => r.settingsEnd.tweaks[0].fingerprint = 'c'.repeat(64), r => r.summary.otherStreamFrames = 4000]) {
    const record = structuredClone(run('before',0)); mutate(record); assert.ok(evidenceExclusion(record));
  }
  const records = repeated(1.1); records[1].summary.averageFps = 50; assert.equal(analyzeBenchmarks(records).findings[0].verdict, 'inconclusive');
});
test('all workloads get FPS-only evidence without OBS; optional OBS counters add quality tradeoffs', async () => {
  const { analyzeBenchmarks } = await import('../src/lib/benchmark-evidence.ts');
  const records = repeated(1.1);
  records.filter(r => r.phase === 'after').forEach(r => { r.settings = states(true, true); r.settingsEnd = states(true, true); });
  assert.deepEqual(analyzeBenchmarks(records).findings[0].changedIds, ['game-dvr', 'game-mode']);
  records.forEach(r => { r.context = 'Streaming'; r.telemetry = true; });
  assert.equal(analyzeBenchmarks(records).findings[0].verdict, 'improved');
  assert.equal(analyzeBenchmarks(records).findings[0].scope, 'fps-only');
  assert.match(analyzeBenchmarks(records).findings[0].reason, /quality was not assessed/);
  records.forEach(r => { r.context = 'Recording'; });
  assert.equal(analyzeBenchmarks(records).findings[0].verdict, 'improved');
  records.forEach(r => { r.context = 'Streaming'; });
  records.forEach(r => { r.telemetrySummary = { obs: { samples: 10, renderingLagPercent: 0, encodingLagPercent: 0, networkDropPercent: 0, streaming: true } }; });
  assert.equal(analyzeBenchmarks(records).findings[0].verdict, 'improved');
  assert.equal(analyzeBenchmarks(records).findings[0].scope, 'fps-and-obs');
  records[3].telemetrySummary.obs.encodingLagPercent = 5;
  assert.equal(analyzeBenchmarks(records).findings[0].verdict, 'inconclusive');
});
