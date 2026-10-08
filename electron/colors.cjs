'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
function validateColorConfig(input) {
  if (!input || typeof input !== 'object' || !/^\\\\\.\\DISPLAY\d{1,2}$/.test(input.displayId) || !Array.isArray(input.profiles) || input.profiles.length > 50 || typeof input.sdrConfirmed !== 'boolean') throw new Error('Choose a detected display and at most 50 program profiles.');
  const percent = n => { if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error('Vibrance must be a whole number from 0 to 100.'); return n; };
  const seen = new Set();
  return { displayId: input.displayId, desktop: percent(input.desktop), sdrConfirmed: input.sdrConfirmed, profiles: input.profiles.map(row => {
    if (!row || typeof row.processName !== 'string' || row.processName.length > 128 || !/^[^<>:"/\\|?*\x00-\x1f]+\.exe$/i.test(row.processName) || row.processName !== row.processName.trim() || seen.has(row.processName.toLowerCase())) throw new Error('Use unique executable names such as game.exe, without paths.');
    seen.add(row.processName.toLowerCase()); return { processName: row.processName, vibrance: percent(row.vibrance) };
  }) };
}
function createColorManager({ directory, executable, spawnProcess = spawn, onChange = () => {} }) {
  let child, ready, sequence = 0;
  let current = { active: false, activeProgram: 'Desktop', supported: false, recoveryPending: false, displays: [], error: '' };
  const pending = new Map();
  const defaults = () => ({ displayId: '', desktop: 50, profiles: [], sdrConfirmed: false });
  let config = defaults();
  async function load() {
    try { config = validateColorConfig(JSON.parse(await fs.readFile(path.join(directory, 'profiles.json'), 'utf8'))); }
    catch (e) { if (e.code !== 'ENOENT') current.error = 'Saved display profiles could not be read. Create a new profile after reviewing the existing file.'; }
  }
  async function ensure() {
    if (ready) return ready;
    ready = (async () => {
      await fs.mkdir(directory, { recursive: true }); await load();
      return new Promise((resolve, reject) => {
        const process = spawnProcess(executable, [path.join(directory, 'recovery.json')], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }); child = process;
        let buffer = '', stderr = '', initialized = false;
        const timeout = setTimeout(() => { process.stdin.end(); reject(new Error('The display helper did not respond.')); }, 20000);
        process.stdout.setEncoding('utf8'); process.stderr.setEncoding('utf8');
        process.stdout.on('data', part => {
          buffer += part;
          if (buffer.length > 256 * 1024) { process.stdin.end(); return; }
          let index;
          while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index).replace(/^\uFEFF/, ''); buffer = buffer.slice(index + 1);
            try {
              const message = JSON.parse(line);
              if (message.ok && message.data) {
                current = message.data; onChange(current);
                if (!initialized) { initialized = true; clearTimeout(timeout); resolve(); }
              }
              const rpc = pending.get(message.requestId);
              if (rpc) { pending.delete(message.requestId); clearTimeout(rpc.timeout); message.ok ? rpc.resolve(current) : rpc.reject(new Error(message.error || 'Color operation failed.')); }
            } catch { current.error = 'The display helper returned an unreadable response.'; }
          }
        });
        process.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(0, 2000); });
        process.stdin.on('error', () => {}); // close handler reports error and journal recovery
        process.on('error', e => { clearTimeout(timeout); reject(new Error(`Could not start the color helper. Install the Windows tester build. ${e.message}`)); });
        process.on('close', code => {
          clearTimeout(timeout); child = null; ready = initialized && !current.supported && code === 0 ? Promise.resolve() : null;
          if (!initialized) reject(new Error(`The display helper closed before initialization. ${stderr}`));
          if (current.active || code !== 0) current = { ...current, active: false, recoveryPending: true, error: 'The display helper stopped. Review color recovery before resuming.' };
          for (const rpc of pending.values()) { clearTimeout(rpc.timeout); rpc.reject(new Error(current.error || 'The display helper closed.')); } pending.clear(); onChange(current);
        });
      });
    })().catch(e => { ready = null; throw e; });
    return ready;
  }
  async function request(action, data = {}) {
    await ensure();
    if (!current.supported || !child) throw new Error(current.error || 'NVIDIA vibrance is not supported on this display.');
    const requestId = ++sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(requestId); child?.stdin.end(); reject(new Error('The color operation timed out. The helper was asked to restore the original level. Check color recovery before retrying.')); }, 10000);
      pending.set(requestId, { resolve, reject, timeout });
      child.stdin.write(JSON.stringify({ requestId, action, ...data }) + '\n');
    });
  }
  return {
    isActive: () => current.active,
    async status() { await ensure(); return { ...current, config }; },
    async save(input) {
      const approved = validateColorConfig(input);
      await ensure();
      if (current.active) throw new Error('Stop the color observer before editing profiles.');
      if (!current.displays.some(d => d.id === approved.displayId)) throw new Error('Choose a detected NVIDIA display.');
      const file = path.join(directory, 'profiles.json');
      await fs.writeFile(file + '.tmp', JSON.stringify(approved, null, 2), { mode: 0o600 }); await fs.rename(file + '.tmp', file); config = approved;
      return { ...current, config };
    },
    async start() { await ensure(); if (!config.sdrConfirmed) throw new Error('Confirm SDR mode before enabling automatic vibrance.'); await request('start', { config }); return { ...current, config }; },
    async stop() { await request('stop'); return { ...current, config }; },
    async close() {
      if (!child) return;
      if (current.active || current.recoveryPending) { try { await request('stop'); } catch { /* The helper also attempts restoration on EOF. Recovery stays on disk if it cannot restore. */ } }
      child?.stdin.end();
    },
  };
}
module.exports = { createColorManager, validateColorConfig };
