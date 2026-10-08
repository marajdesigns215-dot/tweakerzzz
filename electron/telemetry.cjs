'use strict';
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
function cpuTimes(host) {
  return host.cpus().reduce((result, cpu) => { result.idle += cpu.times.idle; result.total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0); return result; }, { idle: 0, total: 0 });
}
function parseGpu(raw, name) {
  const rows = raw.trim().split(/\r?\n/).map(line => line.split(',').map(part => part.trim()));
  const row = rows.find(parts => parts[0] === name);
  if (!row) return null;
  const numeric = (value, max) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max ? Number(value) : null;
  return { name: row[0], utilization: numeric(row[1], 100), temperature: numeric(row[2], 150), memoryUsedMB: numeric(row[3], 1000000), memoryTotalMB: numeric(row[4], 1000000) };
}
function obsDelta(first, last, invalid = false) {
  const percent = (skipped, total) => {
    if (invalid || !first || !last || [first[skipped], first[total], last[skipped], last[total]].some(value => value == null)) return null;
    const count = last[total] - first[total], missed = last[skipped] - first[skipped];
    return count > 0 && missed >= 0 && missed <= count ? missed / count * 100 : null;
  };
  return { renderingLagPercent: percent('renderSkipped', 'renderTotal'), encodingLagPercent: percent('encodeSkipped', 'encodeTotal'), networkDropPercent: percent('streamSkipped', 'streamTotal'), streaming: last?.streaming ?? false, recording: last?.recording ?? false };
}
function parseCpuTemperature(raw) {
  const sensors = JSON.parse(raw.trim().replace(/^\uFEFF/, ''));
  const sensor = (Array.isArray(sensors) ? sensors : [sensors]).find(item => item && /^\/(intelcpu|amdcpu)\/\d+\/temperature\//.test(item.Identifier) && ['CPU Package', 'CPU (Tctl/Tdie)', 'CPU (Tdie)'].includes(item.Name) && typeof item.Value === 'number' && Number.isFinite(item.Value) && item.Value > 0 && item.Value <= 150);
  return sensor ? { value: sensor.Value, name: sensor.Name } : null;
}
function createTelemetry({ hardware, obs, host = os, environment = process.env, exists = fs.existsSync, execute = (file, args) => new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, shell: false, timeout: 3000, maxBuffer: 64000 }, (error, stdout) => error ? reject(new Error('GPU telemetry unavailable.')) : resolve(stdout))) }) {
  let previous = cpuTimes(host), running = true, inFlight = null, timer;
  const obsEnabled = !!obs?.status().connected;
  const samples = [], gpuSamples = [], temperaturesCpu = [], warnings = new Set(); let firstObs, lastObs, obsInvalid = false, obsSamples = 0, cpuProviderAvailable = true, cpuSensor = null;
  const gpuName = hardware?.gpu.name;
  const smi = gpuName && /NVIDIA|GeForce/i.test(gpuName) ? [path.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe'), path.join(environment.ProgramFiles || 'C:\\Program Files', 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe')].find(exists) : null;
  const powershell = path.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // Optional, existing Libre Hardware Monitor WMI provider. ACPI thermal zones
  // are deliberately not used as CPU temperatures. No driver is installed.
  const cpuQuery = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); try { $s=@(Get-CimInstance -Namespace root\\LibreHardwareMonitor -ClassName Sensor -Filter \"SensorType='Temperature'\" -OperationTimeoutSec 2 -ErrorAction Stop | Where-Object { $_.Identifier -match '^/(intelcpu|amdcpu)/[0-9]+/temperature/' } | Select-Object Name,Identifier,Value); [Console]::Out.WriteLine((ConvertTo-Json -InputObject $s -Compress)) } catch { [Console]::Out.WriteLine('[]') }";
  if (!smi) warnings.add('GPU utilization and temperature are unavailable: a matching NVIDIA telemetry provider was not found.');
  async function sample() {
    if (!running || inFlight) return;
    inFlight = (async () => {
      const next = cpuTimes(host), elapsed = next.total - previous.total;
      const cpu = elapsed > 0 ? Math.max(0, Math.min(100, (1 - (next.idle - previous.idle) / elapsed) * 100)) : null;
      previous = next;
      const total = host.totalmem(); samples.push({ cpu, memory: total > 0 ? (1 - host.freemem() / total) * 100 : null });
      const results = await Promise.allSettled([
        smi ? execute(smi, ['--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total', '--format=csv,noheader,nounits']).then(raw => parseGpu(raw, gpuName)) : Promise.resolve(null),
        obsEnabled ? (obs?.status().connected ? obs.sample() : Promise.reject(new Error('OBS disconnected during this run.'))) : Promise.resolve(null),
        cpuProviderAvailable ? execute(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', cpuQuery]).then(parseCpuTemperature) : Promise.resolve(null),
      ]);
      if (results[0].status === 'fulfilled' && results[0].value) gpuSamples.push(results[0].value);
      else if (smi) warnings.add('A GPU telemetry sample was unavailable.');
      if (results[2].status === 'fulfilled' && results[2].value) { temperaturesCpu.push(results[2].value.value); cpuSensor = results[2].value.name; }
      else { cpuProviderAvailable = false; warnings.add('CPU package temperature unavailable. Optional: run Libre Hardware Monitor with its WMI provider before the recording. No sensor value is estimated.'); }
      if (obsEnabled && results[1].status === 'fulfilled') {
        const value = results[1].value;
        if (value.recordingPaused || value.streamReconnecting) obsInvalid = true;
        if (lastObs && (value.streaming !== lastObs.streaming || value.recording !== lastObs.recording || ['renderSkipped','renderTotal','encodeSkipped','encodeTotal','streamSkipped','streamTotal'].some(key => value[key] != null && lastObs[key] != null && value[key] < lastObs[key]))) obsInvalid = true;
        firstObs ||= value; lastObs = value; obsSamples++;
      } else if (obsEnabled) { warnings.add('OBS statistics were unavailable for one or more samples.'); obsInvalid = true; }
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  const stats = values => { const known = values.filter(value => typeof value === 'number' && Number.isFinite(value)); return { samples: known.length, averagePercent: known.length ? known.reduce((a, b) => a + b, 0) / known.length : null, peakPercent: known.length ? Math.max(...known) : null }; };
  void sample(); timer = setInterval(sample, 5000);
  return { stop: async () => {
    clearInterval(timer); if (inFlight) await inFlight;
    await sample(); running = false;
    if (obsInvalid) warnings.add('OBS counters reset, its output mode changed/paused, its stream reconnected, or its connection was interrupted. Lag percentages are unavailable for this run.');
    const temperatures = gpuSamples.map(value => value.temperature).filter(value => value != null);
    const gpu = { ...stats(gpuSamples.map(value => value.utilization)), name: gpuName ?? 'Unknown GPU', peakTemperatureC: temperatures.length ? Math.max(...temperatures) : null };
    return { enabled: true, intervalSeconds: 5, cpu: stats(samples.map(value => value.cpu)), memory: stats(samples.map(value => value.memory)), gpu, cpuTemperatureC: temperaturesCpu.length ? Math.max(...temperaturesCpu) : null, cpuTemperatureSensor: cpuSensor, obs: { ...obsDelta(firstObs, lastObs, obsInvalid), enabled: obsEnabled, samples: obsSamples }, warnings: [...warnings] };
  } };
}
module.exports = { cpuTimes, parseGpu, parseCpuTemperature, obsDelta, createTelemetry };
