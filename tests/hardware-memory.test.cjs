'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHardwareMemory, machineKey, MAX_BYTES } = require('../electron/hardware-memory.cjs');
const hardware = (name='Local GPU') => ({cpu:{name:'Local CPU',cores:8,threads:16},gpu:{name,vramGB:null},memory:{totalGB:32,speedMHz:5600},os:{name:'Windows 11',build:'26200'},storage:{totalGB:1000,freeGB:400},peripherals:[{name:'Local keyboard',type:'Keyboard',connection:'USB'}],scannedAt:'2026-10-09T12:00:00Z',warnings:[]});
const drivers = () => ({hardware:hardware(),scannedAt:'2026-10-09T12:00:01Z',board:{manufacturer:'Local board',product:'Model',version:'1'},computer:{manufacturer:'Local OEM',model:'PC'},bios:{manufacturer:'OEM',version:'F1'},devices:[],components:[],componentsComplete:true,disks:[],recommendations:[],warnings:[],history:{sensitiveHistory:'This has its own store'}});
const setup = async () => {const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tz-memory-'));return {directory,identify:async()=> 'a'.repeat(64)};};
test('native hardware, drivers and peripherals survive reopening without rescanning or storing history twice',async()=>{
 const options=await setup();const m=createHardwareMemory(options);
 try {assert.equal((await m.load()).system,null);await m.scan('drivers',async()=>drivers());await m.scan('peripherals',async()=>({peripherals:[],scannedAt:'2026-10-09T13:00:00Z',warnings:[]}));await m.close();
  const reopened=createHardwareMemory(options),saved=await reopened.load();assert.equal(saved.system.gpu.name,'Local GPU');assert.equal(saved.drivers.bios.version,'F1');assert.equal(saved.drivers.history,undefined);assert.deepEqual(saved.peripherals.peripherals,[]);assert.equal(saved.peripherals.scannedAt,'2026-10-09T13:00:00Z');
  saved.system.gpu.name='Mutated renderer copy';assert.equal((await reopened.load()).system.gpu.name,'Local GPU');await reopened.close();
 }finally{await m.close();await fs.rm(options.directory,{recursive:true,force:true});}
});
test('copied app data cannot load another Windows installation’s hardware',async()=>{
 const options=await setup();const m=createHardwareMemory(options);
 try {await m.scan('system',async()=>hardware());await m.close();const other=createHardwareMemory({...options,identify:async()=> 'b'.repeat(64)});assert.equal((await other.load()).system,null);assert.match((await other.load()).warning,/different Windows installation/);await other.scan('system',async()=>hardware('Different PC GPU'));assert.equal((await other.load()).system.gpu.name,'Different PC GPU');assert.equal((await other.load()).warning,'');await other.close();}
 finally{await m.close();await fs.rm(options.directory,{recursive:true,force:true});}
});
test('corrupt, incompatible, oversized and structurally invalid caches fail closed and preserve evidence on replacement',async()=>{
 for(const content of ['{broken',JSON.stringify({version:99}),JSON.stringify({version:1,machineKey:'a'.repeat(64),data:{system:{},drivers:null,peripherals:null}}),' '.repeat(MAX_BYTES+1)]) {
  const options=await setup(),file=path.join(options.directory,'current.json');await fs.writeFile(file,content);const m=createHardwareMemory(options);
  try {assert.equal((await m.load()).system,null);assert.ok((await m.load()).warning);await m.scan('system',async()=>hardware());assert.equal((await m.load()).warning,'');assert.equal((await m.load()).system.gpu.name,'Local GPU');const backup=(await fs.readdir(options.directory)).find(n=>n.includes('.preserved-'));assert.equal(await fs.readFile(path.join(options.directory,backup),'utf8'),content);}
  finally{await m.close();await fs.rm(options.directory,{recursive:true,force:true});}
 }
});
test('failed rescans and failed atomic writes keep the last successful saved scan',async()=>{
 const options=await setup();let fail=false;const m=createHardwareMemory({...options,io:{...fs,rename:async(...args)=>{if(fail)throw Error('Disk unavailable');return fs.rename(...args);}}});
 try{await m.scan('system',async()=>hardware('Old GPU'));const before=await fs.readFile(path.join(options.directory,'current.json'),'utf8');await assert.rejects(m.scan('system',async()=>{throw Error('Scan failed');}),/Scan failed/);fail=true;const result=await m.scan('system',async()=>hardware('New GPU'));assert.match(result.warnings.at(-1).message,/could not be remembered/);assert.equal(result.gpu.name,'New GPU');assert.equal(await fs.readFile(path.join(options.directory,'current.json'),'utf8'),before);assert.equal((await m.load()).system.gpu.name,'Old GPU');assert.deepEqual(await fs.readdir(options.directory),['current.json']);}
 finally{await m.close();await fs.rm(options.directory,{recursive:true,force:true});}
});
test('slow scan completions cannot replace newer scans or recreate a forgotten scan',async()=>{
 const options=await setup(),m=createHardwareMemory(options);let finish;
 try{const slow=m.scan('system',()=>new Promise(resolve=>finish=resolve));await m.scan('drivers',async()=>drivers());finish(hardware('Obsolete GPU'));await slow;assert.equal((await m.load()).system.gpu.name,'Local GPU');
  const pending=m.scan('system',()=>new Promise(resolve=>finish=resolve));await m.clear();finish(hardware());await pending;assert.equal((await m.load()).system,null);assert.equal((await m.load()).drivers,null);assert.deepEqual(await fs.readdir(options.directory),[]);
 }finally{await m.close();await fs.rm(options.directory,{recursive:true,force:true});}
});
test('the PC binding uses one fixed read-only Windows query and never stores the raw identifier',async()=>{
 let calls=0;const guid='12345678-1234-4321-ABCD-123456789ABC';const key=await machineKey({run:async(file,args,options)=>{calls++;assert.match(file,/reg\.exe$/);assert.deepEqual(args,['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid','/reg:64']);assert.equal(options.timeoutMs,5000);return `MachineGuid    REG_SZ    ${guid}`;}});assert.equal(calls,1);assert.match(key,/^[a-f0-9]{64}$/);assert.ok(!key.includes(guid.toLowerCase()));await assert.rejects(machineKey({run:async()=> 'Invalid registry response'}),/could not be identified/);
});
test('forget removes only remembered-scan files and leaves other app data alone',async()=>{
 const options=await setup(),m=createHardwareMemory(options);
 try{await m.scan('system',async()=>hardware());for(const name of ['current.json.preserved-0123456789abcdef','current.json.0123456789abcdef.tmp','user-notes.txt'])await fs.writeFile(path.join(options.directory,name),'Keep unrelated notes');await m.clear();assert.deepEqual(await fs.readdir(options.directory),['user-notes.txt']);}
 finally{await m.close();await fs.rm(options.directory,{recursive:true,force:true});}
});
