'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { normalizeInventory, identity, createDeviceScanner } = require('../electron/device-inventory.cjs');
const { createDriverHistory, validateState } = require('../electron/driver-history.cjs');
const { hardwareComponents } = require('../electron/hardware-components.cjs');
const { parseInstallLog, readDriverInstallLog } = require('../electron/driver-install-log.cjs');
const { createDriverUpdateChecker, parseOffers, officialUrl } = require('../electron/driver-updates.cjs');
const stamp = n => `2026-10-09T${String(n).padStart(2, '0')}:00:00.000Z`;
const raw = () => ({ pnpOk: true, driversOk: true, warnings: [], pnp: [{ DeviceID: 'PCI\\VEN_1234\\GPU', Name: 'Test graphics card', PNPClass: 'Display', Manufacturer: 'Example', Present: true, ConfigManagerErrorCode: 0, HardwareID: ['PCI\\VEN_1234&DEV_0001'] }, { DeviceID: 'USB\\VID_1234\\CAMERA', Name: 'Test camera', PNPClass: 'Camera' }, { DeviceID: 'USB\\VID_4321\\PRINTER', Name: 'Test printer', PNPClass: 'Printer' }], drivers: [{ DeviceID: 'pci\\ven_1234\\gpu', DeviceName: 'Test graphics card', DriverProviderName: 'Actual driver publisher', Manufacturer: 'Different hardware manufacturer', DriverVersion: '1.2.3.4', DriverDate: '2026-01-01', InfName: 'oem42.inf', IsSigned: true, Signer: 'Test publisher' }] });
const inventory = n => ({ ...normalizeInventory(raw(), stamp(n)), componentsComplete: true, components: [{ id: identity('bios'), category: 'BIOS / UEFI', name: 'Test motherboard', values: { 'BIOS version': 'A1' }, deviceIds: [] }] });

test('inventory joins case-insensitive hardware IDs and includes all classes without confusing manufacturer and provider', async () => {
  const d = inventory(1); assert.equal(d.complete, true); assert.equal(d.devices.length, 3);
  const gpu = d.devices.find(x => x.category === 'DISPLAY'); assert.equal(gpu.provider, 'Actual driver publisher'); assert.equal(gpu.manufacturer, 'Example'); assert.equal(gpu.driverDate, '2026-01-01'); assert.equal(gpu.signed, true);
  assert.equal(d.devices.find(x => x.category === 'CAMERA').signed, null);
  assert.equal(d.devices.find(x => x.category === 'PRINTER').driverReported, false);
  const scan = createDeviceScanner({ run: async (_file, args, options) => { assert.ok(args.includes('-Command')); assert.ok(!args.includes('-File')); assert.ok(options.maxBufferBytes > 2 * 1024 ** 2); assert.doesNotMatch(args.at(-1), /Where-Object|Set-ExecutionPolicy|Install-WindowsUpdate/); return JSON.stringify(raw()); }, now: () => stamp(1) });
  assert.deepEqual(await scan(), normalizeInventory(raw(), stamp(1)));
});
test('partial, duplicate, missing-identity and oversized inventories cannot imply removals', () => {
  for (const change of [r => {r.pnpOk = false;}, r => r.pnp.push({...r.pnp[0]}), r => r.pnp.push({Name:'No identity'}), r => {r.pnp=Array.from({length:3001},(_,i)=>({...r.pnp[0],DeviceID:'ROOT\\TEST\\'+i}));}]) {
    const r=raw(); change(r); const result=normalizeInventory(r,stamp(1)); assert.equal(result.complete,false); assert.ok(result.warnings.length);
  }
  assert.throws(()=>normalizeInventory([],stamp(1)),/invalid/);
});
test('hardware cards include every reported GPU, CPU, BIOS revision and RAM part without reference specs', () => {
  const report={board:{manufacturer:'Unknown Vendor',product:'Board X',version:'Rev 2'},computer:{manufacturer:'',model:''},bios:{version:'F2',manufacturer:'UEFI Vendor'},devices:inventory(1).devices,recommendations:[]};
  const cards=hardwareComponents(report,{bios:[{ReleaseDate:'2026-05-01'}],processors:[{DeviceID:'CPU0',Name:'Test CPU',NumberOfCores:8,NumberOfLogicalProcessors:16}],graphics:[{Name:'AMD Test GPU',PNPDeviceID:'PCI\\VEN_1234\\GPU',DriverVersion:'1.2.3.4'},{Name:'Intel Test iGPU',PNPDeviceID:'PCI\\SECOND\\GPU',DriverVersion:'5.6.7.8'}],memoryModules:[{Manufacturer:'Memory Co',PartNumber:'PART-A',DeviceLocator:'DIMM0',Capacity:17179869184,ConfiguredClockSpeed:5600}],disks:[{DeviceID:'DISK0',Model:'Test SSD',FirmwareRevision:'X1'}]});
  assert.equal(cards.filter(c=>c.category==='Graphics').length,2);
  assert.equal(cards.find(c=>c.category==='BIOS / UEFI').values['BIOS version'],'F2'); assert.equal(cards.find(c=>c.category==='BIOS / UEFI').source,null);
  assert.equal(cards.find(c=>c.category==='Memory').values['Part number'],'PART-A'); assert.equal(cards.find(c=>c.category==='Memory').values['Capacity (GB)'],'16');
  assert.match(cards.find(c=>c.category==='Processor').note,/do not have a separate/);
});
test('persistent scan history separates driver and BIOS changes, keeps partial baselines, and reloads', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tz-driver-history-')); let current=inventory(1);
  const manager=createDriverHistory({directory,fullScan:async()=>current});
  try {
    const first=await manager.scan(); assert.equal(first.history.changes.length,0); assert.equal(first.history.scans,1);
    current=inventory(2); current.devices.find(d=>d.category==='DISPLAY').version='2.0.0.0'; current.components[0].values['BIOS version']='A2';
    const second=await manager.scan(); assert.equal(second.history.changes.length,2);
    assert.ok(second.history.changes.some(c=>c.kind==='firmware-changed'&&c.fields[0].before==='A1'));
    assert.ok(second.history.changes.some(c=>c.kind==='driver-changed'&&c.fields.some(f=>f.field==='version'&&f.after==='2.0.0.0')));
    current={...inventory(3),devices:[],complete:false}; const partial=await manager.scan(); assert.equal(partial.history.scans,2); assert.match(partial.history.message,/incomplete/);
    current=inventory(4); current.devices.find(d=>d.category==='DISPLAY').version='2.0.0.0'; current.components[0].values['BIOS version']='A2';
    assert.equal((await manager.scan()).history.changes.length,2);
    await manager.close(); const reloaded=createDriverHistory({directory}); assert.equal((await reloaded.status()).changes.length,2);
    validateState(JSON.parse(await fs.readFile(path.join(directory,'history.json'),'utf8')));
    await reloaded.clear(); assert.equal((await reloaded.status()).baselineAt,null); await reloaded.close();
  } finally { await manager.close(); await fs.rm(directory,{recursive:true,force:true}); }
});
test('component history uses the last successful firmware observation across a partial component scan', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tz-firmware-history-'));let current=inventory(1);
  const m=createDriverHistory({directory,fullScan:async()=>current});
  try { await m.scan();current={...inventory(2),componentsComplete:false,components:[]};await m.scan();current=inventory(3);current.components[0].values['BIOS version']='A3';const result=await m.scan();assert.equal(result.history.changes[0].previousScanAt,stamp(1)); }
  finally {await m.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('damaged history stays untouched until explicit clear and background monitoring is opt-in and deferrable', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tz-driver-damaged-'));const file=path.join(directory,'history.json');let scans=0,allowed=false;
  await fs.writeFile(file,'{broken');const m=createDriverHistory({directory,fullScan:async()=>{scans++;return inventory(1);},canPoll:()=>allowed,now:()=>1000000,intervalMs:100});
  try {
    await m.scan();assert.equal(await fs.readFile(file,'utf8'),'{broken');await assert.rejects(m.setMonitor(true));
    await m.clear();const count=scans;allowed=true;await m.poll();assert.equal(scans,count);
    await m.setMonitor(true);allowed=false;await m.poll();assert.equal(scans,count);
    allowed=true;await m.poll();assert.equal(scans,count+1);await m.poll();assert.equal(scans,count+1);
    await m.close();await m.poll();assert.equal(scans,count+1);
  } finally {await m.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('SetupAPI summaries preserve real results and local dates without calling them release notes or driver versions', async () => {
  const log='>>>  [Device Install - PCI\\VEN_1234\\GPU]\r\n>>>  Section start 2026/10/09 12:00:00.001\r\n<<<  [Exit status: SUCCESS]\r\n>>>  [Device Install - USB\\CAM\\1]\r\n>>>  2026/10/09 12:10:00.002: Section start\r\n<<<  [Exit status: FAILURE(0x123)]\r\n>>>  [Driver package import - C:\\Users\\private\\driver.inf]\r\n';
  const result=parseInstallLog(log);assert.equal(result.length,3);assert.equal(result[0].deviceId,null);assert.equal(result[0].result,'unknown');assert.equal(result[1].result,'failed');assert.equal(result[2].localTime,'2026/10/09 12:00:00.001');assert.equal(result[2].deviceId,identity('PCI\\VEN_1234\\GPU'));assert.ok(!JSON.stringify(result).includes('private'));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tz-driver-log-'));try {const file=path.join(directory,'setupapi.dev.log');await fs.writeFile(file,Buffer.from('\ufeff'+log,'utf16le'));assert.equal((await readDriverInstallLog({file})).entries.length,3);assert.equal((await readDriverInstallLog({file:file+'.missing'})).available,false);}finally {await fs.rm(directory,{recursive:true,force:true});}
});
test('update offers retain publisher information, reject unsafe links and never equate no offers with latest vendor release', () => {
  const packet={updateId:'11111111-2222-3333-4444-555555555555',revision:2,title:'Example - Display - 2.0.0.0',description:'Publisher package description',hardwareId:'PCI\\VEN_1234&DEV_0001',urls:['https://www.nvidia.com/en-us/drivers/','javascript:alert(1)','https://nvidia.com.evil.test/a','file:///C:/bad.exe']};
  const r=parseOffers({resultCode:2,total:1,packages:[packet]},stamp(1));assert.equal(r.complete,true);assert.equal(r.packages[0].links.length,1);assert.equal(r.packages[0].description,packet.description);assert.equal(r.packages[0].driverDate,'');
  assert.match(parseOffers({resultCode:2,total:0,packages:[]},stamp(1)).message,/does not verify/);
  assert.equal(parseOffers({resultCode:3,total:0,packages:[]},stamp(1)).complete,false);
  for (const url of ['https://localhost/a','https://nvidia.com.evil.test/','https://user:pass@nvidia.com/','file:///C:/x']) assert.equal(officialUrl(url),null);
});
test('online driver search is read-only, coalesced, cancellable, and never accepts arbitrary release URLs from IPC', async () => {
  let calls=0,finish;
  const m=createDriverUpdateChecker({run:async(_file,args,{signal})=>{calls++;assert.match(args.at(-1),/IsInstalled=0 and IsHidden=0 and Type='Driver'/);assert.doesNotMatch(args.at(-1),/CreateUpdateInstaller|CreateUpdateDownloader|\.Install\(|\.Download\(|ServerSelection=/);return new Promise((resolve,reject)=>{finish=resolve;signal.addEventListener('abort',()=>reject(new Error('Cancelled')));});}});
  const p=m.check();assert.equal(m.check(),p);assert.equal(calls,1);assert.throws(()=>m.link('https://evil.test',0));
  finish(JSON.stringify({resultCode:2,total:0,packages:[]}));await p;assert.equal(m.status().result.complete,true);
  const cancelled=m.check();assert.equal(m.status().result,null);m.cancel();await assert.rejects(cancelled,/Cancelled/);assert.equal(m.isBusy(),false);await m.close();
});
