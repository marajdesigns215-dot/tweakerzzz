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

class FrameMetrics {
  constructor(processName, limit = 2000000) {
    this.processName = processName.toLowerCase(); this.limit = limit;
    this.buffer = ''; this.header = null; this.streams = new Map();
    this.frames = 0; this.invalid = 0; this.omitted = 0; this.limited = false;
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
      if (names.some(name => !fields.includes(name))) throw new Error('Unsupported PresentMon CSV columns.');
      this.header = Object.fromEntries(names.map(name => [name, fields.indexOf(name)])); return;
    }
    if (!this.header || !line) return;
    const h = this.header;
    if (fields[h.Application]?.toLowerCase() !== this.processName) return;
    const ms = Number(fields[h.FrameTime]);
    const pid = fields[h.ProcessID], chain = fields[h.SwapChainAddress];
    if (!Number.isFinite(ms) || ms <= 0 || !/^\d+$/.test(pid ?? '') || !/^0x[\da-f]+$/i.test(chain ?? '')) { this.invalid++; return; }
    if (this.frames >= this.limit) { this.limited = true; return; }
    const key = `${pid}:${chain}`;
    if (!this.streams.has(key)) {
      if (this.streams.size >= 32) { this.omitted++; return; }
      this.streams.set(key, { pid: Number(pid), swapChain: chain, values: [] });
    }
    this.streams.get(key).values.push(ms); this.frames++;
  }
  summary() {
    // Combining independent swap chains inflates FPS. Report the single most
    // sampled stream and disclose other frames, including restarted processes.
    const stream = [...this.streams.values()].sort((a, b) => b.values.length - a.values.length)[0];
    if (!stream) return null;
    const values = [...stream.values].sort((a, b) => a - b), n = values.length;
    const total = values.reduce((sum, value) => sum + value, 0);
    const slowCount = Math.ceil(n / 100);
    const slowMean = values.slice(n - slowCount).reduce((sum, value) => sum + value, 0) / slowCount;
    return { frames: n, sampledSeconds: total / 1000, averageFps: n * 1000 / total,
      onePercentLow: n >= 100 ? 1000 / slowMean : null,
      p95FrameMs: values[Math.ceil(n * .95) - 1], processId: stream.pid,
      swapChain: stream.swapChain, otherStreamFrames: this.frames - n + this.omitted,
      invalidFrames: this.invalid, streamCount: this.streams.size };
  }
}
module.exports = { csvFields, FrameMetrics };
