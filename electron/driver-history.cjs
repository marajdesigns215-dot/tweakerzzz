'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { scanDrivers } = require('./drivers.cjs');
const { identity, LIMIT } = require('./device-inventory.cjs');
const MAX_CHANGES = 2000;
const MAX_BYTES = 12 * 1024 * 1024;
const DRIVER_FIELDS = ['version', 'provider', 'driverDate', 'infName', 'signed', 'signer', 'driverReported'];
const DEVICE_FIELDS = ['name', 'category', 'manufacturer', 'service', 'status', 'present', 'problemCode'];
const fields = [...DRIVER_FIELDS, ...DEVICE_FIELDS];
const empty = () => ({ version: 1, monitorEnabled: false, baselineAt: null, lastScanAt: null, scans: 0, devices: [], components: [], componentsEstablished: false, componentsScannedAt: null, changes: [] });
const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const scalar = v => v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 1024);
const id = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function snapshotDevice(d) { return { id: d.id, instanceId: d.instanceId, ...Object.fromEntries(fields.map(k => [k, d[k]])) }; }
function validateState(s) {
  const fail = () => { throw new Error('Saved driver history is damaged or unsupported. The file has been preserved. Use Clear local history only if you want to discard it and start over.'); };
  if (!s || s.version !== 1 || typeof s.monitorEnabled !== 'boolean' || !(s.baselineAt === null || date(s.baselineAt)) || !(s.lastScanAt === null || date(s.lastScanAt)) || !Number.isInteger(s.scans) || s.scans < 0) fail();
  if (!Array.isArray(s.devices) || s.devices.length > LIMIT || !Array.isArray(s.changes) || s.changes.length > MAX_CHANGES || !Array.isArray(s.components) || s.components.length > 500 || typeof s.componentsEstablished !== 'boolean' || !(s.componentsScannedAt === null || date(s.componentsScannedAt))) fail();
  const ids = new Set();
  for (const d of s.devices) {
    if (!d || !id(d.id) || typeof d.instanceId !== 'string' || !d.instanceId || d.instanceId.length > 1024 || identity(d.instanceId) !== d.id || ids.has(d.id) || !fields.every(k => scalar(d[k])) || !['name', 'category', 'manufacturer'].every(k => typeof d[k] === 'string')) fail();
    ids.add(d.id);
  }
  for (const c of s.components) {
    if (!c || !id(c.id) || !['name', 'category'].every(k => typeof c[k] === 'string' && c[k].length <= 250) || !c.values || Array.isArray(c.values) || typeof c.values !== 'object' || Object.keys(c.values).length > 32 || !Object.entries(c.values).every(([k,v]) => k.length <= 80 && typeof v === 'string' && v.length <= 1024)) fail();
  }
  for (const c of s.changes) {
    if (!c || typeof c.id !== 'string' || !/^[a-f0-9]{24}$/.test(c.id) || !id(c.deviceId) || !date(c.observedAt) || !date(c.previousScanAt) || !['first-seen', 'not-reported', 'driver-changed', 'device-changed', 'firmware-changed', 'component-changed'].includes(c.kind) || !['name', 'category', 'instanceId'].every(k => typeof c[k] === 'string' && c[k].length <= 1024)) fail();
    if (!Array.isArray(c.fields) || c.fields.length > 32 || !c.fields.every(f => f && typeof f.field === 'string' && f.field.length <= 80 && scalar(f.before) && scalar(f.after))) fail();
  }
  return s;
}
function compareDevices(before, after, previousScanAt, observedAt) {
  const old = new Map(before.map(d => [d.id, d])), next = new Map(after.map(d => [d.id, d]));
  const changes = [];
  const add = (device, kind, changesToFields = []) => changes.push({ id: crypto.randomBytes(12).toString('hex'), deviceId: device.id, instanceId: device.instanceId, name: device.name, category: device.category, kind, observedAt, previousScanAt, fields: changesToFields });
  for (const d of after) {
    const previous = old.get(d.id);
    if (!previous) { add(d, 'first-seen'); continue; }
    const changed = fields.filter(k => d[k] !== previous[k]).map(k => ({ field: k, before: previous[k], after: d[k] }));
    if (changed.length) add(d, changed.some(f => DRIVER_FIELDS.includes(f.field)) ? 'driver-changed' : 'device-changed', changed);
  }
  for (const d of before) if (!next.has(d.id)) add(d, 'not-reported');
  return changes;
}
function compareComponents(before, after, previousScanAt, observedAt) {
  const old = new Map(before.map(c => [c.id, c]));
  const make = (c, kind, changes = []) => ({ id: crypto.randomBytes(12).toString('hex'), deviceId: c.id, instanceId: '', name: c.name, category: c.category, observedAt, previousScanAt, kind, fields: changes });
  const changes = after.flatMap(c => {
    const prior = old.get(c.id); if (!prior) return [make(c, 'first-seen')];
    const changed = [...new Set([...Object.keys(prior.values), ...Object.keys(c.values)])].filter(k => (prior.values[k] || '') !== (c.values[k] || '')).map(k => ({ field: k, before: prior.values[k] || '', after: c.values[k] || '' }));
    if (c.name !== prior.name) changed.unshift({ field: 'Component model', before: prior.name, after: c.name });
    if (!changed.length) return [];
    return [make(c, changed.some(f => /^(BIOS version|Firmware version)$/.test(f.field)) ? 'firmware-changed' : 'component-changed', changed)];
  });
  for (const c of before) if (!after.some(d => d.id === c.id)) changes.push(make(c, 'not-reported'));
  return changes;
}
function createDriverHistory({ directory, fullScan = scanDrivers, inventoryScan = fullScan, canPoll = () => true, now = () => Date.now(), intervalMs = 15 * 60 * 1000 } = {}) {
  const file = path.join(directory, 'history.json');
  let state, loading, loadError = '', lastMessage = '', queue = Promise.resolve(), busy = 0, timer = null, closed = false, lastAttempt = 0;
  const enqueue = task => { busy++; const result = queue.then(task); queue = result.catch(() => {}).finally(() => { busy--; }); return result; };
  async function load() {
    if (loading) return loading;
    if (state) return;
    loading = (async () => { state = empty(); try {
      const info = await fs.stat(file); if (info.size > MAX_BYTES) throw new Error('Saved driver history exceeds the size limit. The file has been preserved.');
      state = validateState(JSON.parse(await fs.readFile(file, 'utf8')));
    } catch (e) { if (e.code !== 'ENOENT') loadError = String(e.message).slice(0, 1500); } })();
    await loading;
  }
  async function save(next) {
    if (loadError) throw new Error(loadError);
    validateState(next);
    // Keep the newest entries within both limits so our own saved files always
    // remain readable. A single unusually large baseline must not replace it.
    let remaining = MAX_BYTES - Buffer.byteLength(JSON.stringify({ ...next, changes: [] }));
    if (remaining < 0) throw new Error('The hardware baseline exceeds the history size limit. The previous file was preserved.');
    const retained = [];
    for (const change of next.changes) {
      const bytes = Buffer.byteLength(JSON.stringify(change)) + (retained.length ? 1 : 0);
      if (bytes > remaining) break;
      retained.push(change); remaining -= bytes;
    }
    next = { ...next, changes: retained };
    await fs.mkdir(directory, { recursive: true });
    const temp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    try { await fs.writeFile(temp, JSON.stringify(next), { flag: 'wx', mode: 0o600 }); await fs.rename(temp, file); state = next; }
    finally { await fs.unlink(temp).catch(() => {}); }
  }
  const view = () => ({ monitorEnabled: state.monitorEnabled, baselineAt: state.baselineAt, lastScanAt: state.lastScanAt, scans: state.scans, deviceCount: state.devices.length, changes: state.changes, limit: MAX_CHANGES, message: loadError || lastMessage });
  async function record(inventory) {
    await load();
    if (loadError) return view();
    const complete = inventory.inventoryComplete ?? inventory.complete;
    if (!complete || !inventory.devices.length) { lastMessage = 'This scan was incomplete. The previous history baseline was kept; no missing devices or driver changes were inferred.'; return view(); }
    if (!date(inventory.scannedAt) || (state.lastScanAt && Date.parse(inventory.scannedAt) < Date.parse(state.lastScanAt))) { lastMessage = 'The scan clock precedes the saved baseline. History was not replaced.'; return view(); }
    const devices = inventory.devices.map(snapshotDevice);
    const changes = state.baselineAt ? compareDevices(state.devices, devices, state.lastScanAt, inventory.scannedAt) : [];
    const components = inventory.componentsComplete ? inventory.components.filter(c => ['Motherboard', 'BIOS / UEFI', 'Processor', 'Memory', 'Storage'].includes(c.category)).map(({ id, category, name, values }) => ({ id, category, name, values })) : state.components;
    if (inventory.componentsComplete && state.componentsEstablished) changes.push(...compareComponents(state.components, components, state.componentsScannedAt, inventory.scannedAt));
    const next = { ...state, baselineAt: state.baselineAt || inventory.scannedAt, lastScanAt: inventory.scannedAt, scans: state.scans + 1, devices, components, componentsEstablished: state.componentsEstablished || !!inventory.componentsComplete, componentsScannedAt: inventory.componentsComplete ? inventory.scannedAt : state.componentsScannedAt, changes: [...changes.reverse(), ...state.changes].slice(0, MAX_CHANGES) };
    try { await save(next); lastMessage = state.scans === 1 ? 'Baseline saved. Later complete scans will reveal changes.' : `${changes.length} change records observed since the previous complete scan.`; }
    catch (e) { lastMessage = `History could not be saved. ${String(e.message).slice(0, 1500)}`; }
    return view();
  }
  const api = {
    status: () => enqueue(async () => { await load(); return view(); }),
    scan: () => enqueue(async () => {
      if (closed) throw new Error('Driver history is closing.');
      lastAttempt = now();
      const report = await fullScan();
      const history = await record(report);
      return { ...report, history };
    }),
    refresh: () => enqueue(async () => {
      if (closed) throw new Error('Driver history is closing.');
      lastAttempt = now(); await load();
      try { return await record(await inventoryScan()); }
      catch (e) { lastMessage = `Driver check failed. The saved baseline was kept. ${String(e.message).slice(0, 1500)}`; return view(); }
    }),
    setMonitor: enabled => enqueue(async () => { if (typeof enabled !== 'boolean') throw new Error('Invalid driver monitor choice.'); await load(); await save({ ...state, monitorEnabled: enabled }); lastAttempt = 0; return view(); }),
    clear: () => enqueue(async () => { await fs.unlink(file).catch(e => { if (e.code !== 'ENOENT') throw e; }); state = empty(); loadError = ''; lastMessage = 'Local change history cleared. Background checks are off; the next complete scan starts a new baseline.'; return view(); }),
    poll: async () => {
      if (closed || busy || !canPoll()) return;
      await load();
      if (closed || busy || !canPoll() || loadError || !state.monitorEnabled || now() - lastAttempt < intervalMs) return;
      return api.refresh();
    },
    start: () => { if (!timer) { timer = setInterval(() => { api.poll().catch(e => { lastMessage = String(e.message).slice(0, 1500); }); }, 60000); timer.unref?.(); } },
    close: async () => { closed = true; if (timer) clearInterval(timer); await queue; },
    isBusy: () => busy > 0,
  };
  return api;
}
module.exports = { createDriverHistory, compareDevices, compareComponents, validateState, MAX_CHANGES };
