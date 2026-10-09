'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FrameMetrics, distribution } = require('../electron/fps-metrics.cjs');
const header = 'Application,ProcessID,SwapChainAddress,CPUStartTime,FrameTime,CPUBusy,CPUWait\n';
const row = (time, duration = 5, busy = 4.7, chain = '0xABC') => `game.exe,42,${chain},${time},${duration},${busy},0.3\n`;
function recorded(summary, extra = {}) { return { id: 'a', status: 'completed', processName: 'game.exe', context: 'Gaming', scenario: 'same test scene', startedAt: '2026-10-09T12:00:00Z', endedAt: '2026-10-09T12:01:00Z', summary, ...extra }; }
test('duplicate CPUWait-only rows never double-count starts or choose their short FrameTime', () => {
  const metrics = new FrameMetrics('game.exe');
  // Mirrors the shape of the reported bug, not the uploaded private CSV.
  let data = header + row(0);
  for (let i = 1; i <= 400; i++) data += row(i * 5, .3, 0) + row(i * 5, 5, 4.7, '0xabc');
  for (let i = 0; i < data.length; i += 13) metrics.push(data.slice(i, i + 13));
  metrics.end(); const s = metrics.summary();
  assert.equal(s.frames, 400); assert.equal(s.duplicateRows, 400); assert.equal(s.sampledSeconds, 2);
  assert.equal(s.averageFps, 200); assert.equal(s.onePercentLow, 200); assert.equal(s.highestFps, 200);
  assert.equal(s.streamCount, 1); assert.deepEqual(s.qualityIssues, []);
  assert.equal(s.measurementBasis, 'cpu-start-interval');
});
test('highest uses sustained windows and slow frames remain in means, percentiles, lows and hitch counts', () => {
  const s = distribution([...Array(1000).fill(10), 1000]);
  assert.equal(s.averageFps, 1001 * 1000 / 11000);
  assert.equal(s.highestFps, 100); assert.equal(s.lowestFps, 1);
  assert.equal(s.onePercentLow, 10); assert.equal(s.pointOnePercentLow, 1000 / 505);
  assert.equal(s.p99FrameMs, 10); assert.equal(s.worstFrameMs, 1000);
  assert.equal(s.slowFrames50ms, 1); assert.equal(s.slowFrames100ms, 1);
  assert.equal(distribution([.001]).highestFps, null);
  assert.equal(distribution(Array(999).fill(1)).pointOnePercentLow, null);
  assert.ok(distribution(Array(100000).fill(4)).timeline.length <= 120);
});
test('application and displayed cadence stay separate, including known generated and dropped rows', () => {
  const m = new FrameMetrics('game.exe');
  m.push('Application,ProcessID,SwapChainAddress,CPUStartTime,FrameTime,FrameType,DisplayedTime,DisplayLatency\n');
  m.push('game.exe,42,0x1,0,10,Application,5,1\n');
  m.push('game.exe,42,0x1,0,0,Intel XeSS-FG,5,6\n');
  m.push('game.exe,42,0x1,10,10,Application,5,1\n');
  m.push('game.exe,42,0x1,10,0,Intel XeSS-FG,5,6\n');
  m.push('game.exe,42,0x1,20,10,Application,NA,NA\n');
  m.push('game.exe,42,0x1,30,10,Application,10,1\n');
  const s = m.summary();
  assert.equal(s.frames, 3); assert.equal(s.averageFps, 100);
  assert.equal(s.displayed.frames, 5); assert.equal(s.displayed.averageFps, 5000 / 30);
  assert.equal(s.generatedFrameRows, 2); assert.equal(s.notDisplayedFrames, 1);
  assert.equal(s.displayTracking, true);
});
test('duplicate app rows merge display evidence instead of counting a false dropped frame', () => {
  const m = new FrameMetrics('game.exe');
  m.push('Application,ProcessID,SwapChainAddress,CPUStartTime,FrameTime,DisplayedTime,DisplayLatency\n');
  m.push('game.exe,42,0x1,0,.3,NA,NA\ngame.exe,42,0x1,0,5,5,1\ngame.exe,42,0x1,5,5,5,1\n');
  assert.equal(m.summary().notDisplayedFrames, 0); assert.equal(m.summary().frames, 1);
});
test('missing and reordered timestamps are disclosed without becoming artificial FPS spikes', () => {
  const m = new FrameMetrics('game.exe'); m.push(header + row(0) + row(10) + row(8) + row('NA') + row(20));
  const s = m.summary(); assert.equal(s.averageFps, 100); assert.equal(s.frames, 2);
  assert.equal(s.qualityIssues.length, 2);
});
test('diagnostics do not infer a CPU bottleneck, overheating or specific shader stalls from aggregate readings', async () => {
  const { performanceDiagnostics } = await import('../src/lib/performance-diagnostics.ts');
  const summary = { ...distribution(Array(1000).fill(5)), metricsVersion: 2, measurementBasis: 'cpu-start-interval', qualityIssues: [], otherStreamFrames: 0 };
  const telemetrySummary = { enabled: true, cpu: { samples: 12, averagePercent: 41.6 }, gpu: { samples: 12, averagePercent: 84.7, peakTemperatureC: 72 }, memory: { samples: 12, peakPercent: 73.7 }, obs: {} };
  const d = performanceDiagnostics(recorded(summary, { telemetrySummary }));
  assert.deepEqual(d.map(d => d.id), ['limits']);
  telemetrySummary.gpu.averagePercent = 98;
  assert.ok(performanceDiagnostics(recorded(summary, { telemetrySummary })).some(d => d.id === 'gpu'));
  telemetrySummary.gpu.samples = 1;
  assert.ok(!performanceDiagnostics(recorded(summary, { telemetrySummary })).some(d => d.id === 'gpu'));
});
test('old or suspect calculations cannot drive recommendations or be compared against corrected captures', async () => {
  const { captureQualityIssues } = await import('../src/lib/capture-quality.ts');
  const { evidenceExclusion } = await import('../src/lib/benchmark-evidence.ts');
  const { compareCaptures } = await import('../src/lib/capture-comparison.ts');
  const summary = distribution(Array(12000).fill(5));
  const old = recorded(summary, { phase: 'before' });
  assert.ok(captureQualityIssues(old)[0].includes('Recalculate'));
  assert.match(evidenceExclusion(old), /recalculation/);
  const fresh = { ...old, id: 'b', phase: 'after', summary: { ...summary, metricsVersion: 2, measurementBasis: 'cpu-start-interval', qualityIssues: [] } };
  assert.equal(compareCaptures(old, fresh), null);
  assert.ok(captureQualityIssues({ ...fresh, summary: { ...fresh.summary, sampledSeconds: 80 } }).some(s => s.includes('exceeds')));
});
