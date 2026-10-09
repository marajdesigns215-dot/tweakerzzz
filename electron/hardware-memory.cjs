'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execute } = require('./scanner.cjs');
const MAX_BYTES = 8 * 1024 * 1024;
const empty = () => ({ system: null, drivers: null, peripherals: null });
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const date = x => typeof x === 'string' && !!x && Number.isFinite(Date.parse(x));
const text = x => typeof x === 'string';
const texts = (x, keys) => object(x) && keys.every(k => text(x[k]));
const number = x => x === null || typeof x === 'number' && Number.isFinite(x) && x >= 0;
const list = (x, max, check) => Array.isArray(x) && x.length <= max && x.every(check);
const warnings = x => x === undefined || list(x, 100, w => texts(w, ['component', 'message']));
function bounded(value, depth = 0, budget = { left: 200000 }) {
  if (--budget.left < 0 || depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (text(value)) return value.length <= 4000;
  if (Array.isArray(value)) return value.length <= 3000 && value.every(v => bounded(v, depth + 1, budget));
  return object(value) && Object.keys(value).length <= 80 && Object.entries(value).every(([k,v]) => k.length <= 100 && !['__proto__','constructor','prototype'].includes(k) && bounded(v, depth + 1, budget));
}
function peripherals(r) {
  return object(r) && date(r.scannedAt) && warnings(r.warnings) && list(r.peripherals, 200, p => texts(p, ['name','type','connection']) && ['Mouse','Keyboard','Audio','Controller','Camera','Other'].includes(p.type) && (p.interfaces === undefined || list(p.interfaces, 30, text)));
}
function system(r) {
  return peripherals(r) && texts(r.cpu, ['name']) && ['cores','threads'].every(k => number(r.cpu[k])) && texts(r.gpu, ['name']) && number(r.gpu.vramGB) && (r.gpu.driverVersion === undefined || text(r.gpu.driverVersion)) && object(r.memory) && ['totalGB','speedMHz'].every(k => number(r.memory[k])) && texts(r.os, ['name','build']) && object(r.storage) && ['totalGB','freeGB'].every(k => number(r.storage[k]));
}
function drivers(r) {
  return object(r) && date(r.scannedAt) && system(r.hardware) && warnings(r.warnings) && texts(r.board, ['manufacturer','product','version']) && texts(r.computer, ['manufacturer','model']) && texts(r.bios, ['manufacturer','version']) && typeof r.componentsComplete === 'boolean' && list(r.disks, 500, d => texts(d, ['model','firmware'])) &&
    list(r.devices, 3000, d => texts(d, ['id','instanceId','name','category','version','provider']) && list(d.hardwareIds,16,text) && list(d.compatibleIds,16,text)) &&
    list(r.components, 500, c => texts(c, ['id','name','category','sourceName','note']) && (c.source === null || text(c.source)) && object(c.values) && Object.values(c.values).every(text) && list(c.deviceIds,3000,text)) &&
    list(r.recommendations, 500, c => texts(c, ['id','category','title','device','sourceName','reason','note','confidence']) && (c.source === null || text(c.source)));
}
function validate(data) {
  if (!object(data) || !bounded(data) || !['system','drivers','peripherals'].every(k => data[k] === null || ({system,drivers,peripherals})[k](data[k]))) throw new Error('Saved hardware scan is damaged or uses an unsupported format. Run a fresh scan to replace it.');
  return data;
}
async function machineKey({ run = execute, environment = process.env } = {}) {
  const executable = path.win32.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  const result = await run(executable, ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'], { timeoutMs: 5000, maxBufferBytes: 8192 });
  const guid = result.match(/\bMachineGuid\s+REG_SZ\s+([a-f0-9-]{36})\b/i)?.[1];
  if (!guid || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(guid)) throw new Error('This Windows installation could not be identified for saved scans.');
  return crypto.createHash('sha256').update(guid.toLowerCase()).digest('hex');
}
function createHardwareMemory({ directory, identify = machineKey, io = fs } = {}) {
  const file = path.join(directory, 'current.json');
  let state = empty(), loading, identity, warning = '', preserve = false, closed = false, active = 0, queue = Promise.resolve();
  const generations = { system:0, drivers:0, peripherals:0 };
  const key = () => identity ||= Promise.resolve().then(identify).catch(e => { identity = null; throw e; });
  const enqueue = task => { const result = queue.then(task); queue = result.catch(() => {}); return result; };
  async function load() {
    if (!loading) loading = (async () => {
      try {
        const stat = await io.stat(file); if (stat.size > MAX_BYTES) throw new Error('Saved hardware scan exceeds the size limit.');
        const saved = JSON.parse(await io.readFile(file, 'utf8'));
        if (saved.version !== 1 || !/^[a-f0-9]{64}$/.test(saved.machineKey || '')) throw new Error('Saved hardware scan format is unsupported.');
        if (saved.machineKey !== await key()) throw new Error('Saved hardware belongs to a different Windows installation. Scan this PC first.');
        state = validate(saved.data);
      } catch(e) { if (e.code !== 'ENOENT') { warning = String(e.message).slice(0,1500); preserve = true; } }
    })();
    await loading;
    return { ...structuredClone(state), warning };
  }
  async function save(next) {
    const contents = JSON.stringify({ version:1, machineKey:await key(), data:validate(next) });
    if (Buffer.byteLength(contents) > MAX_BYTES) throw new Error('Hardware scan is too large to remember.');
    await io.mkdir(directory, {recursive:true});
    const temporary = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    try {
      await io.writeFile(temporary, contents, {flag:'wx',mode:0o600});
      if (preserve) { await io.rename(file, file + '.preserved-' + crypto.randomBytes(8).toString('hex')).catch(e => { if(e.code!=='ENOENT') throw e; }); preserve=false; }
      await io.rename(temporary,file); state=structuredClone(next); warning='';
    } finally { await io.unlink(temporary).catch(() => {}); }
  }
  return {
    load,
    async scan(kind, task) {
      if (!['system','drivers','peripherals'].includes(kind)) throw new Error('Unknown hardware scan type.');
      if (closed) throw new Error('Hardware memory is closing.');
      const affected = kind === 'peripherals' ? ['peripherals'] : ['system','drivers','peripherals'];
      const token = Object.fromEntries(affected.map(k => [k, ++generations[k]])); active++;
      try {
        const report = await task();
        try {
          await enqueue(async () => {
            await load();
            if (closed || generations[kind] !== token[kind]) return;
            const next = { ...state };
            if (kind === 'drivers') {
              const {history, ...inventory} = report; // History has its own bounded store.
              next.drivers=inventory; next.system=report.hardware;
            } else if (kind === 'system') { next.system=report; next.drivers=null; }
            if (token.peripherals === generations.peripherals) {
              const base = kind === 'drivers' ? report.hardware : report;
              next.peripherals=base.warnings?.some(w=>w.component==='peripherals') ? null : {peripherals:base.peripherals,scannedAt:base.scannedAt,warnings:base.warnings || []};
            }
            await save(next);
          });
        } catch(e) { warning=`Scan completed, but could not be remembered: ${String(e.message).slice(0,1200)}`; return {...report,warnings:[...(report.warnings || []),{component:'Saved scan',message:warning}]}; }
        return report;
      } finally { active--; }
    },
    clear() {
      Object.keys(generations).forEach(k => generations[k]++);
      return enqueue(async () => {
        await load();
        const names=await io.readdir(directory).catch(e => {if(e.code==='ENOENT')return [];throw e;});
        for(const name of names.filter(n => n==='current.json' || /^current\.json(?:\.preserved-[a-f0-9]{16}|\.[a-f0-9]{16}\.tmp)$/.test(n))) await io.unlink(path.join(directory,name)).catch(e => {if(e.code!=='ENOENT')throw e;});
        state=empty();warning='';preserve=false;return {...state,warning};
      });
    },
    isBusy: () => active > 0,
    close: async () => { closed=true; Object.keys(generations).forEach(k => generations[k]++); await queue; },
  };
}
module.exports = { createHardwareMemory, machineKey, validate, MAX_BYTES };
