'use strict';

// PresentMon FrameTime measures application presentation cadence. It is not
// monitor refresh, an OBS output counter, or a guarantee of displayed frames.
function csvFields(line) {
  const fields = []; let field = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { fields.push(field); field = ''; }
    else field += ch;
  }
  if (quoted) return null;
  fields.push(field); return fields;
}

// Complete consecutive blocks of at least one second, rather than the
// reciprocal of a single tiny interval. The last partial block is excluded.
function windows(values, minimum = 1000) {
  const result = []; let time = 0, total = 0, count = 0;
  for (const ms of values) {
    total += ms; count++;
    if (total >= minimum) {
      result.push({ startSecond: time / 1000, endSecond: (time + total) / 1000, frames: count, averageFps: count * 1000 / total });
      time += total; total = 0; count = 0;
    }
  }
  return result;
}
function distribution(input) {
  if (!input.length) return null;
  const values = [...input].sort((a, b) => a - b), n = values.length;
  const total = values.reduce((sum, value) => sum + value, 0), mean = total / n;
  const percentile = p => values[Math.ceil(n * p) - 1];
  const low = fraction => { const count = Math.ceil(n * fraction); return 1000 / (values.slice(n - count).reduce((a, b) => a + b, 0) / count); };
  const periods = windows(input), rates = periods.map(p => p.averageFps);
  const median = n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
  const spikeThresholdMs = Math.max(33.333333, median * 3);
  // At most 120 points keeps metadata and rendering bounded for long runs.
  const timeline = windows(input, Math.max(1000, total / 120));
  return { frames: n, sampledSeconds: total / 1000, averageFps: n * 1000 / total,
    onePercentLow: n >= 100 ? low(.01) : null, pointOnePercentLow: n >= 1000 ? low(.001) : null,
    highestFps: rates.length ? rates.reduce((a, b) => Math.max(a, b), 0) : null, lowestFps: rates.length ? rates.reduce((a, b) => Math.min(a, b), Infinity) : null,
    medianFps: 1000 / median, meanFrameMs: mean, p95FrameMs: percentile(.95), p99FrameMs: percentile(.99),
    worstFrameMs: values[n - 1], frameTimeStdDevMs: Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n),
    slowFrames50ms: values.filter(v => v > 50).length, slowFrames100ms: values.filter(v => v > 100).length,
    spikeThresholdMs, spikeFrames: values.filter(v => v > spikeThresholdMs).length, timeline };
}
const timestampedHeader = header => header.CPUStartTime !== undefined;
const numeric = value => value != null && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
class FrameMetrics {
  constructor(processName, limit = 2000000) {
    this.processName = processName.toLowerCase(); this.limit = limit;
    this.buffer = ''; this.header = null; this.streams = new Map();
    this.frames = 0; this.rows = 0; this.invalid = 0; this.omitted = 0; this.limited = false;
  }
  push(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 1024 * 1024) throw new Error('PresentMon returned an oversized CSV line.');
    let end;
    while ((end = this.buffer.indexOf('\n')) !== -1) {
      this.line(this.buffer.slice(0, end).replace(/\r$/, '').replace(/^\uFEFF/, ''));
      this.buffer = this.buffer.slice(end + 1);
    }
  }
  end() { if (this.buffer) this.line(this.buffer.trim()); this.buffer = ''; }
  line(line) {
    const fields = csvFields(line);
    if (!fields) { this.invalid++; return; }
    if (fields[0] === 'Application') {
      const names = ['Application', 'ProcessID', 'SwapChainAddress', 'FrameTime'];
      if (names.some(name => !fields.includes(name)) || new Set(fields).size !== fields.length) throw new Error('Unsupported PresentMon CSV columns.');
      const next = Object.fromEntries(fields.map((name, i) => [name, i]));
      if (this.header && JSON.stringify(next) !== JSON.stringify(this.header)) throw new Error('PresentMon CSV columns changed during recording.');
      this.header = next; return;
    }
    if (!this.header || !line) return;
    const h = this.header;
    if (fields[h.Application]?.toLowerCase() !== this.processName) return;
    const ms = numeric(fields[h.FrameTime]), pid = fields[h.ProcessID], chain = fields[h.SwapChainAddress];
    if (ms == null || !/^\d+$/.test(pid ?? '') || !/^0x[\da-f]+$/i.test(chain ?? '')) { this.invalid++; return; }
    if (this.rows >= this.limit) { this.limited = true; return; }
    this.rows++;
    const key = `${pid}:${chain.toLowerCase()}`;
    if (!this.streams.has(key)) {
      if (this.streams.size >= 32) { this.omitted++; return; }
      this.streams.set(key, { pid: Number(pid), swapChain: chain, values: [], displayed: [], lastStart: null,
        duplicates: 0, outOfOrder: 0, missingTimestamps: 0, zeroRows: 0, dropped: 0, displayUnknown: 0,
        lastDisplayKey: null, pendingDisplayed: false, pendingDisplayKnown: false, generated: 0, runtimes: new Set(), modes: new Set() });
    }
    const stream = this.streams.get(key);
    if (fields[h.PresentRuntime]) stream.runtimes.add(fields[h.PresentRuntime].slice(0, 100));
    if (fields[h.PresentMode]) stream.modes.add(fields[h.PresentMode].slice(0, 100));
    const start = numeric(fields[h.CPUStartTime]);
    // DisplayedTime is a separate clock/metric. Never add these rows to app
    // FPS. FrameType support is provider-dependent (not universal FG detection).
    if (h.DisplayedTime !== undefined) {
      const display = numeric(fields[h.DisplayedTime]);
      const latency = numeric(fields[h.DisplayLatency]);
      const displayKey = start != null && latency != null ? `${start}:${latency}` : null;
      if (display > 0 && (displayKey == null || displayKey !== stream.lastDisplayKey)) {
        stream.displayed.push(display); stream.lastDisplayKey = displayKey;
      } else if (display == null && fields[h.DisplayedTime] !== 'NA') stream.displayUnknown++;
    }
    const type = fields[h.FrameType];
    if (['Intel XeSS-FG', 'AMD AFMF'].includes(type)) { stream.generated++; return; }
    if (ms <= 0) { stream.zeroRows++; return; }
    if (h.CPUStartTime !== undefined) {
      if (start == null) { stream.missingTimestamps++; this.invalid++; return; }
      if (stream.lastStart !== null) {
        if (start === stream.lastStart) { stream.duplicates++; stream.pendingDisplayed ||= numeric(fields[h.DisplayedTime]) > 0; stream.pendingDisplayKnown ||= fields[h.DisplayedTime] === 'NA' || numeric(fields[h.DisplayedTime]) > 0; return; }
        if (start < stream.lastStart) { stream.outOfOrder++; return; }
        // One interval between DISTINCT CPU frame starts. The supplied CSV
        // repeats starts with short CPUWait-only rows, so counting CSV rows or
        // trusting the first FrameTime at a start overstates FPS.
        stream.values.push(start - stream.lastStart); this.frames++;
        if (stream.pendingDisplayKnown && !stream.pendingDisplayed) stream.dropped++;
      }
      stream.lastStart = start;
      stream.pendingDisplayed = numeric(fields[h.DisplayedTime]) > 0;
      stream.pendingDisplayKnown = fields[h.DisplayedTime] === 'NA' || stream.pendingDisplayed;
    } else {
      stream.values.push(ms); this.frames++;
    }
    if (!timestampedHeader(this.header) && fields[h.DisplayedTime] === 'NA') stream.dropped++;
  }
  summary() {
    const stream = [...this.streams.values()].sort((a, b) => b.values.length - a.values.length)[0];
    if (!stream?.values.length) return null;
    const result = distribution(stream.values), timestamped = this.header.CPUStartTime !== undefined;
    const qualityIssues = [];
    if (!timestamped) qualityIssues.push('Frame-start timestamps are unavailable; this is the older FrameTime calculation.');
    if (stream.outOfOrder) qualityIssues.push(`${stream.outOfOrder} out-of-order frame starts were excluded. Capture timing needs review.`);
    if (stream.missingTimestamps) qualityIssues.push(`${stream.missingTimestamps} rows had no usable frame-start timestamp.`);
    if (this.invalid > Math.max(1, this.rows * .01)) qualityIssues.push('More than 1% of rows were invalid. Inspect the original CSV before comparing performance.');
    if (this.limited) qualityIssues.push('The frame-row limit was reached; this report covers only the retained samples.');
    return { ...result, metricsVersion: 2, measurementBasis: timestamped ? 'cpu-start-interval' : 'legacy-frame-time',
      processId: stream.pid, swapChain: stream.swapChain, otherStreamFrames: this.frames - result.frames + this.omitted,
      invalidFrames: this.invalid, streamCount: this.streams.size, duplicateRows: stream.duplicates,
      zeroFrameRows: stream.zeroRows, generatedFrameRows: stream.generated, qualityIssues,
      displayTracking: this.header.DisplayedTime !== undefined, displayed: distribution(stream.displayed),
      notDisplayedFrames: this.header.DisplayedTime !== undefined ? stream.dropped : null,
      displayUnknownRows: stream.displayUnknown, runtimes: [...stream.runtimes].slice(0, 10), presentModes: [...stream.modes].slice(0, 10),
      streams: [...this.streams.values()].map(s => ({ processId: s.pid, swapChain: s.swapChain, frames: s.values.length,
        duplicateRows: s.duplicates, sampledSeconds: s.values.reduce((a, b) => a + b, 0) / 1000 })) };
  }
}
module.exports = { csvFields, FrameMetrics, distribution };
