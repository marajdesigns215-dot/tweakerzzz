'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { identity } = require('./device-inventory.cjs');
const TAIL_BYTES = 2 * 1024 * 1024;
function parseInstallLog(text) {
  text = text.replace(/^\uFEFF/, '');
  const matches = [...text.matchAll(/^>>>\s+\[([^\r\n]{1,2000})\]\s*$/gm)];
  return matches.slice(-100).map((m, i, selected) => {
    const end = selected[i + 1]?.index ?? text.length;
    const block = text.slice(m.index, end);
    const candidate = m[1].split(' - ').at(-1).trim();
    // A section instance can be a filename or operation ID. Only claim a
    // device association for an actual three-part Windows instance path.
    const instanceId = /^[A-Z][A-Z0-9_]*\\[^\\\r\n]+\\[^\r\n]+$/i.test(candidate) ? candidate.slice(0, 1024) : '';
    const stamp = block.match(/^>>>\s+(?:Section start\s+)?(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)/m)?.[1] || '';
    const exit = block.match(/^<<<\s+\[Exit status:\s*([^\]\r\n]+)\]/m)?.[1]?.trim() || '';
    return { id: crypto.createHash('sha256').update(m[1] + stamp).digest('hex'), operation: m[1].split(' - ')[0].slice(0, 250), instanceId,
      deviceId: instanceId ? identity(instanceId) : null, localTime: stamp,
      result: exit === 'SUCCESS' ? 'success' : /^FAILURE/i.test(exit) ? 'failed' : 'unknown', detail: exit.slice(0, 250) || 'No completed exit status in the retained log section.' };
  }).reverse();
}
async function readDriverInstallLog({ file = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'INF', 'setupapi.dev.log') } = {}) {
  let handle;
  try {
    handle = await fs.open(file, 'r'); const stat = await handle.stat();
    const bom = Buffer.alloc(3); await handle.read(bom, 0, 3, 0);
    const unicode = bom[0] === 0xff && bom[1] === 0xfe;
    let start = Math.max(0, stat.size - TAIL_BYTES); if (unicode && start % 2) start++;
    const buffer = Buffer.alloc(stat.size - start); const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const entries = parseInstallLog(buffer.subarray(0, bytesRead).toString(unicode ? 'utf16le' : 'utf8'));
    return { available: true, source: 'Windows SetupAPI.dev.log', readAt: new Date().toISOString(), entries, truncated: start > 0 || entries.length === 100,
      message: 'Recent Windows installation sections, limited to the last 2 MiB and 100 entries. Times are the Windows local time written to the log. A successful operation does not prove a newer driver was installed.' };
  } catch (e) { return { available: false, source: 'Windows SetupAPI.dev.log', readAt: new Date().toISOString(), entries: [], truncated: false, message: `Windows installation log could not be read. ${String(e.code || e.message).slice(0, 500)}` }; }
  finally { await handle?.close(); }
}
module.exports = { parseInstallLog, readDriverInstallLog };
