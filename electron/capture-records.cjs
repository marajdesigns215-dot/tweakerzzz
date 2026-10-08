'use strict';

// Disk files are not trusted renderer objects. Preserve damaged files for
// recovery, but never send a partial object that can crash the recording UI.
function validateRecord(record, file, validateOptions) {
  const fail = () => { throw new Error('Invalid recording metadata'); };
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const text = (v, max = 2000) => typeof v === 'string' && v.length <= max;
  const date = v => text(v, 80) && Number.isFinite(Date.parse(v));
  const number = (v, max = Number.MAX_SAFE_INTEGER) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
  const nullable = (v, max) => v === null || number(v, max);
  const stats = v => object(v) && Number.isInteger(v.samples) && v.samples >= 0 && nullable(v.averagePercent, 100) && nullable(v.peakPercent, 100);
  const settings = v => object(v) && date(v.checkedAt) && Array.isArray(v.tweaks) && v.tweaks.length <= 200 && v.tweaks.every(t => object(t) && text(t.id, 100) && ['enabled', 'not-enabled', 'not-configured', 'unknown'].includes(t.status) && text(t.message) && (t.fingerprint === undefined || /^[a-f0-9]{64}$/.test(t.fingerprint)));
  if (!object(record) || record.version !== 1 || typeof record.id !== 'string' || !/^[a-f0-9]{32}$/.test(record.id) || record.id + '.json' !== file) fail();
  validateOptions(record);
  if (!['recording', 'completed', 'failed', 'interrupted'].includes(record.status) || !date(record.startedAt) || !text(record.collector, 100) || !text(record.error, 16000) || !settings(record.settings)) fail();
  if (record.endedAt != null && !date(record.endedAt)) fail();
  if (record.settingsEnd != null && !settings(record.settingsEnd)) fail();
  if (record.hardwareKey != null && !/^[a-f0-9]{64}$/.test(record.hardwareKey)) fail();
  for (const key of ['stopReason', 'collectorWarnings']) if (record[key] != null && !text(record[key], 16000)) fail();
  if (record.status === 'completed' && !record.summary) fail();
  if (record.summary != null) {
    const s = record.summary;
    if (!object(s) || !['frames', 'sampledSeconds', 'averageFps', 'p95FrameMs', 'processId', 'otherStreamFrames', 'invalidFrames', 'streamCount'].every(k => number(s[k])) || !nullable(s.onePercentLow) || !text(s.swapChain, 200)) fail();
  }
  if (record.hardware != null) {
    const h = record.hardware;
    if (!object(h) || !['cpu', 'gpu', 'memory', 'os', 'storage'].every(k => object(h[k])) || !text(h.cpu.name, 250) || !text(h.gpu.name, 250) || !text(h.os.name, 250) || !text(h.os.build, 100)) fail();
    if (![h.cpu.cores, h.cpu.threads, h.gpu.vramGB, h.memory.totalGB, h.memory.speedMHz, h.storage.totalGB, h.storage.freeGB].every(v => nullable(v))) fail();
    if (h.gpu.driverVersion != null && !text(h.gpu.driverVersion, 100)) fail();
  }
  if (record.telemetrySummary != null) {
    const t = record.telemetrySummary;
    if (!object(t) || typeof t.enabled !== 'boolean' || !number(t.intervalSeconds) || !stats(t.cpu) || !stats(t.memory) || !stats(t.gpu) || !text(t.gpu.name, 250) || !nullable(t.gpu.peakTemperatureC, 200) || !nullable(t.cpuTemperatureC, 200)) fail();
    if (t.cpuTemperatureSensor != null && !text(t.cpuTemperatureSensor, 250)) fail();
    const o = t.obs;
    if (!object(o) || !number(o.samples) || !['renderingLagPercent', 'encodingLagPercent', 'networkDropPercent'].every(k => nullable(o[k], 100)) || typeof o.streaming !== 'boolean' || typeof o.recording !== 'boolean' || (o.enabled !== undefined && typeof o.enabled !== 'boolean')) fail();
    if (!Array.isArray(t.warnings) || t.warnings.length > 100 || !t.warnings.every(w => text(w))) fail();
  }
  return record;
}
module.exports = { validateRecord };
