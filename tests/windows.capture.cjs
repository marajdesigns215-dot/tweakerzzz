'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const { createCaptureManager, listPrograms } = require('../electron/capture.cjs');
const { scanSystem } = require('../electron/scanner.cjs');
const { getTweakStatus } = require('../electron/tweak-status.cjs');
const spec = require('../electron/presentmon.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  assert.equal(process.platform, 'win32');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'TweakerzzzFrames-'));
  let renderer, capture;
  const probeTimes = []; let probeBuffer = '';
  try {
    const probe = path.join(directory, 'TweakerzzzFrameProbe.exe');
    const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    execFileSync(compiler, ['/nologo', '/target:exe', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/out:' + probe, path.join(__dirname, 'windows.frameprobe.cs')], { windowsHide: true, timeout: 30000, stdio: 'pipe' });
    renderer = spawn(probe, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    renderer.stdout.on('data', chunk => {
      probeBuffer += chunk; let newline;
      while ((newline = probeBuffer.indexOf('\n')) !== -1) { const line = probeBuffer.slice(0, newline).trim(); probeBuffer = probeBuffer.slice(newline + 1); if (line.startsWith('PRESENT,')) probeTimes.push(Number(line.slice(8))); }
    });
    await new Promise((resolve, reject) => {
      let output = '', errors = '';
      const timeout = setTimeout(() => reject(new Error('D3D11 probe did not initialize. ' + errors)), 15000);
      renderer.stdout.on('data', chunk => { output += chunk; if (output.includes('READY')) { clearTimeout(timeout); resolve(); } });
      renderer.stderr.on('data', chunk => { errors += chunk; });
      renderer.once('error', error => { clearTimeout(timeout); reject(error); });
      renderer.once('exit', code => { if (!output.includes('READY')) { clearTimeout(timeout); reject(new Error('D3D11 probe exited: ' + code + ' ' + errors)); } });
    });
    const programs = await listPrograms(); assert.ok(programs.includes('TweakerzzzFrameProbe.exe'), 'Live program list must find the rendering process: ' + JSON.stringify(programs));
    capture = createCaptureManager({ directory, executable: path.join(__dirname, '..', 'vendor', 'presentmon', spec.file), snapshot: getTweakStatus, readHardware: scanSystem });
    await assert.rejects(capture.start({ processName: 'TweakerzzzMissingProcessForTest.exe', seconds: 30, phase: 'before', context: 'Gaming', scenario: 'Missing target preflight' }), /not in the running program list/);
    assert.equal(capture.isActive(), false);
    await capture.start({ processName: 'TweakerzzzFrameProbe.exe', seconds: 30, phase: 'before', context: 'Gaming', scenario: 'CI D3D11 WARP frame probe', telemetry: true });
    for (let i = 0; i < 30 && capture.isActive() && capture.status().frames < 120; i++) await delay(500);
    const record = capture.isActive() ? await capture.stop() : (await capture.list())[0];
    if (record.status !== 'completed') {
      const raw = await fs.readFile(await capture.csvPath(record.id), 'utf8');
      const { FrameMetrics } = require('../electron/fps-metrics.cjs');
      const diagnostic = new FrameMetrics('TweakerzzzFrameProbe.exe'); diagnostic.push(raw); diagnostic.end();
      throw new Error(JSON.stringify({ error: record.error, collectorWarnings: record.collectorWarnings, independentPresents: probeTimes.length,
        csvBytes: Buffer.byteLength(raw), firstRows: raw.split(/\r?\n/).slice(0, 5), parsedRows: diagnostic.rows, invalidRows: diagnostic.invalid,
        streams: [...diagnostic.streams.values()].map(s => ({ intervals: s.values.length, zeroRows: s.zeroRows, generated: s.generated, missingTimestamps: s.missingTimestamps })) }));
    }
    assert.equal(record.status, 'completed', record.error || JSON.stringify(record));
    assert.ok(Number.isFinite(Date.parse(record.targetCheckedAt)), 'Running target was verified before the trace started');
    assert.ok(record.summary.frames >= 30, 'Real Direct3D frame samples are required.');
    assert.ok(record.summary.averageFps > 0 && Number.isFinite(record.summary.averageFps));
    assert.equal(record.settings.tweaks.length, 22);
    assert.equal(record.settingsEnd.tweaks.length, 22);
    for (const item of record.settings.tweaks.filter(t => t.status !== 'unknown')) assert.match(item.fingerprint, /^[a-f0-9]{64}$/);
    assert.ok(record.hardware.cpu.name); assert.match(record.hardwareKey, /^[a-f0-9]{64}$/);
    assert.equal(record.telemetrySummary.enabled, true); assert.ok(record.telemetrySummary.cpu.samples >= 1);
    assert.equal(record.telemetrySummary.obs.renderingLagPercent, null, 'Disconnected OBS must not fabricate lag');
    assert.equal(record.telemetrySummary.obs.enabled, false);
    assert.ok(!record.telemetrySummary.warnings.some(w => w.includes('OBS')), 'OBS is optional, not a capture error.');
    const csv = await fs.readFile(await capture.csvPath(record.id), 'utf8');
    assert.ok(csv.includes('FrameTime') && csv.includes('TweakerzzzFrameProbe.exe'));
    assert.equal(record.summary.metricsVersion, 2);
    assert.equal(record.summary.measurementBasis, 'cpu-start-interval');
    assert.equal(record.summary.displayTracking, true);
    assert.deepEqual(record.summary.qualityIssues, []);
    assert.ok(csv.includes('DisplayedTime') && csv.includes('CPUStartTime'));
    assert.ok(record.summary.highestFps > 0 && record.summary.highestFps >= record.summary.lowestFps);
    assert.ok(probeTimes.length > 100);
    const probeFps = (probeTimes.length - 1) * 1000 / (probeTimes.at(-1) - probeTimes[0]);
    // An independent renderer Stopwatch counts successful Present calls. A
    // broad tolerance allows different startup/capture windows on shared CI,
    // while rejecting the observed near-double counting regression.
    assert.ok(Math.abs(record.summary.averageFps / probeFps - 1) < .25, `Collector ${record.summary.averageFps} vs independent renderer ${probeFps}`);
    const recalculated = await capture.reanalyze(record.id);
    assert.deepEqual(recalculated.summary, record.summary, 'Live and saved CSV analyses must agree');
    assert.equal(capture.isActive(), false);
    console.log(`PASS: real D3D11 presentation capture (${record.summary.frames} frames), CSV export, tweak snapshot, and trace stop.`);
  } finally {
    if (capture?.isActive()) await capture.stop();
    if (renderer && renderer.exitCode === null) {
      const closed = new Promise(resolve => renderer.once('close', resolve)); renderer.kill(); await closed;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => {
  const detail = String(error.stack || error).slice(0, 3000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.error(`::error title=Windows FPS capture validation failed::${detail}`);
  process.exitCode = 1;
});
