'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { FrameMetrics } = require('./fps-metrics.cjs');
const spec = require('./presentmon.json');
const { createTelemetry } = require('./telemetry.cjs');

function validateCapture(input) {
  if (!input || typeof input !== 'object') throw new Error('Choose a game and recording settings.');
  if (typeof input.processName !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} ._()\-]{0,110}\.exe$/u.test(input.processName)) throw new Error('Enter an executable name such as game.exe, without a folder path.');
  if (!['before', 'after'].includes(input.phase) || !['Gaming', 'Streaming', 'Recording'].includes(input.context)) throw new Error('Choose a before/after phase and workload.');
  if (!Number.isInteger(input.seconds) || input.seconds < 30 || input.seconds > 3600) throw new Error('Choose a recording length between 30 seconds and 60 minutes.');
  if (typeof input.scenario !== 'string' || !input.scenario.trim() || input.scenario.length > 160 || /[\x00-\x1f]/.test(input.scenario)) throw new Error('Name the repeatable scene and graphics settings (up to 160 characters).');
  const extra = {};
  if (input.telemetry !== undefined) { if (typeof input.telemetry !== 'boolean') throw new Error('Invalid telemetry choice.'); extra.telemetry = input.telemetry; }
  if (input.benchmark !== undefined) {
    const b = input.benchmark;
    if (!b || typeof b !== 'object' || ['experiment', 'resolution', 'graphics', 'gameBuild'].some(key => typeof b[key] !== 'string' || !b[key].trim() || b[key].length > 120 || /[\x00-\x1f]/.test(b[key])) || !Number.isInteger(b.fpsCap) || b.fpsCap < 0 || b.fpsCap > 2000 || typeof b.verified !== 'boolean') throw new Error('Complete the benchmark conditions and use a whole-number FPS cap (0 means uncapped).');
    extra.benchmark = { experiment: b.experiment.trim(), resolution: b.resolution.trim(), graphics: b.graphics.trim(), gameBuild: b.gameBuild.trim(), fpsCap: b.fpsCap, verified: b.verified };
  }
  return { ...extra, processName: input.processName, phase: input.phase, context: input.context, seconds: input.seconds, scenario: input.scenario.trim() };
}
function validateSessionId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid recording ID.');
  return id;
}
function runFile(file, args) {
  return new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, shell: false, timeout: 7000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error((stderr || error.message).slice(0, 2000))) : resolve(stdout)));
}
async function listPrograms() {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // Fixed read-only command: no executable names or user input are evaluated.
  const command = "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); $names = @(Get-Process | Select-Object -ExpandProperty ProcessName -Unique | Sort-Object); [Console]::Out.WriteLine((ConvertTo-Json -InputObject $names -Compress))";
  const raw = await runFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command]);
  const names = JSON.parse(raw.replace(/^\uFEFF/, '').trim());
  if (!Array.isArray(names)) throw new Error('Windows returned an unreadable program list. Enter the executable name manually.');
  return names.filter(name => typeof name === 'string').slice(0, 1000).map(name => name + '.exe');
}

async function verifyCollector(executable) {
    let bytes;
    try { bytes = await fsp.readFile(executable); } catch { throw new Error('The bundled FPS collector is missing. Reinstall Tweakerzzz from the tester release.'); }
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== spec.sha256) throw new Error('The bundled FPS collector failed its integrity check. Reinstall Tweakerzzz.');
}

function createCaptureManager({ directory, executable, snapshot, readHardware = async () => null, obs, onChange = () => {}, launch = spawn, run = runFile, verify = () => verifyCollector(executable) }) {
  let current = null, initializing = null;
  const metadataPath = id => path.join(directory, validateSessionId(id) + '.json');
  const csvPath = id => path.join(directory, validateSessionId(id) + '.csv');
  async function save(record) {
    const target = metadataPath(record.id), temp = target + '.tmp';
    await fsp.writeFile(temp, JSON.stringify(record, null, 2), 'utf8');
    await fsp.rename(temp, target);
  }
  async function records() {
    await fsp.mkdir(directory, { recursive: true });
    const files = (await fsp.readdir(directory)).filter(name => /^[a-f0-9]{32}\.json$/.test(name));
    const result = [];
    for (const file of files) {
      const bytes = await fsp.readFile(path.join(directory, file), 'utf8');
      if (bytes.length > 100000) throw new Error('An FPS history file is too large. Check the local recordings folder.');
      const record = JSON.parse(bytes);
      if (record.version !== 1 || record.id + '.json' !== file) throw new Error('An FPS history file is invalid.');
      result.push(record);
    }
    return result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  function initialize() {
    if (!initializing) initializing = (async () => {
      // A crash may leave the ETW session alive. Only stop sessions named with
      // IDs from our own interrupted records, never another PresentMon client.
      for (const record of await records()) {
        if (record.status !== 'recording') continue;
        await verify();
        await run(executable, ['--session_name', 'Tweakerzzz-' + record.id, '--terminate_existing_session']);
        record.status = 'interrupted'; record.error = 'The app closed unexpectedly. This partial recording is excluded from comparisons.';
        record.endedAt = new Date().toISOString(); record.summary = null;
        await save(record);
      }
    })().catch(error => { initializing = null; throw error; });
    return initializing;
  }
  function status() {
    return current ? { active: true, ...current.record, frames: current.metrics.frames, stopping: current.stopping } : { active: false };
  }
  async function start(input) {
    const options = validateCapture(input);
    if (current) throw new Error('A recording is already running. Stop it first.');
    // Reserve before the first await, including integrity and snapshot checks.
    const reservation = { preparing: true, record: {}, metrics: { frames: 0 } };
    current = reservation;
    try {
      await initialize(); await verify();
      const history = await records();
      if (history.length >= 100) throw new Error('Your 100-recording library is full. Export and delete an old recording before starting another.');
      const [settings, hardwareResult] = await Promise.all([snapshot(), Promise.resolve().then(readHardware).catch(() => null)]);
      const hardware = hardwareResult ? { cpu: hardwareResult.cpu, gpu: hardwareResult.gpu, memory: hardwareResult.memory, os: hardwareResult.os, storage: hardwareResult.storage, scannedAt: hardwareResult.scannedAt, warnings: hardwareResult.warnings || [], peripherals: [] } : null;
      const hardwareKey = hardware ? crypto.createHash('sha256').update(JSON.stringify([hardware.cpu, hardware.gpu, hardware.memory, hardware.os])).digest('hex') : null;
      const id = crypto.randomBytes(16).toString('hex');
      const record = { version: 1, id, ...options, startedAt: new Date().toISOString(), status: 'recording', collector: 'PresentMon ' + spec.version, settings, hardware, hardwareKey, summary: null, error: '' };
      await save(record);
      const metrics = new FrameMetrics(options.processName);
      const output = fs.createWriteStream(csvPath(id), { flags: 'wx' });
      const child = launch(executable, ['--process_name', options.processName, '--output_stdout', '--no_console_stats', '--no_track_gpu', '--no_track_input', '--no_track_display', '--session_name', 'Tweakerzzz-' + id, '--timed', String(options.seconds), '--terminate_after_timed'], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let resolveDone;
      const done = new Promise(resolve => { resolveDone = resolve; });
      const active = { record, metrics, child, output, done, stopping: false, error: '', stderr: '', bytes: 0 };
      current = active;
      const telemetry = options.telemetry ? createTelemetry({ hardware, obs }) : null;
      const watchdog = setTimeout(() => { active.error = 'Recording exceeded its time limit; partial data may be incomplete.'; void stop(); }, (options.seconds + 15) * 1000);
      let finished = false;
      const finish = async code => {
        if (finished) return; finished = true; clearTimeout(watchdog); clearTimeout(active.killTimer);
        try {
          // A malformed final CSV row must not skip stream/telemetry cleanup.
          try { metrics.end(); } catch (error) { active.error ||= error.message; }
          // Wait for buffered CSV writes before exposing export/delete actions.
          await new Promise(resolve => { if (output.destroyed) resolve(); else output.end(resolve); });
          record.endedAt = new Date().toISOString(); record.summary = metrics.summary();
          record.telemetrySummary = telemetry ? await telemetry.stop() : null;
          try { record.settingsEnd = await snapshot(); } catch { record.settingsEnd = null; }
          record.status = code === 0 && !active.error && record.summary ? 'completed' : 'failed';
          record.error = active.error || (code !== 0 ? (/access denied|privilege|Performance Log Users/i.test(active.stderr) ? 'Windows denied FPS tracing. Close Tweakerzzz, right-click its shortcut, choose Run as administrator for the same Windows account, and try again.' : 'PresentMon exited unexpectedly. ' + active.stderr.trim().slice(0, 1200)) : !record.summary ? 'No frames were captured. Start the game, check its actual .exe name, and keep it rendering during the recording. Some graphics APIs or protected games may not report frames.' : '');
          record.collectorWarnings = active.stderr.trim().slice(0, 2000);
          record.stopReason = active.reason || 'Time limit reached';
          await save(record);
        } catch (error) { record.status = 'failed'; record.error = 'Could not save recording: ' + error.message; }
        finally { if (current === active) current = null; onChange(record); resolveDone(record); }
      };
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        if (finished) return;
        try {
          active.bytes += Buffer.byteLength(chunk);
          if (active.bytes > 64 * 1024 * 1024) { active.reason = '64 MB recording limit reached'; void stop(); return; }
          metrics.push(chunk);
          if (!output.write(chunk)) { child.stdout.pause(); output.once('drain', () => child.stdout.resume()); }
          if (metrics.limited) { active.reason = 'Two million frame limit reached'; void stop(); }
        } catch (error) { active.error = error.message; void stop(); }
      });
      child.stderr.on('data', chunk => { active.stderr = (active.stderr + chunk).slice(0, 12000); });
      output.on('error', error => { active.error = 'Could not write the FPS log: ' + error.message; child.stdout.resume(); void stop(); });
      child.on('error', error => { active.error = error.message; void finish(-1); });
      child.on('close', code => { void finish(code); });
      onChange();
      return status();
    } catch (error) { if (current === reservation) current = null; throw error; }
  }
  async function stop() {
    const active = current;
    if (!active) return null;
    if (active.preparing) throw new Error('The recording is still preparing. Please wait.');
    if (!active.stopping) {
      active.stopping = true; active.reason ||= 'Stopped by you'; onChange();
      active.killTimer = setTimeout(() => { active.error ||= 'The collector did not finish cleanly. This partial run is excluded from comparisons.'; active.child.kill(); }, 9000);
      try { await run(executable, ['--session_name', 'Tweakerzzz-' + active.record.id, '--terminate_existing_session']); }
      catch (error) { active.error ||= 'Could not stop the trace cleanly: ' + error.message; active.child.kill(); }
    }
    return active.done;
  }
  return { start, stop, status, isActive: () => !!current,
    list: async () => { await initialize(); return (await records()).filter(record => record.id !== current?.record.id); },
    csvPath: async id => { validateSessionId(id); if (id === current?.record.id) throw new Error('Stop recording before exporting.'); const record = (await records()).find(item => item.id === id); if (!record) throw new Error('Recording not found.'); return csvPath(id); },
    remove: async id => { validateSessionId(id); if (id === current?.record.id) throw new Error('Stop recording before deleting it.'); await fsp.rm(csvPath(id), { force: true }); await fsp.unlink(metadataPath(id)); },
  };
}
module.exports = { createCaptureManager, validateCapture, validateSessionId, listPrograms, verifyCollector };
