'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {nvidiaVersion,compareVersions,parseLookup,pickNvidiaProduct,parseNvidiaDrivers,fetchMetadata,createVendorLookup}=require('../electron/vendor-releases.cjs');
const {titleVersion}=require('../electron/driver-updates.cjs');
const {createComponentUpdateChecker,availablePackages}=require('../electron/component-updates.cjs');
const gpu={id:'gpu',category:'Graphics',name:'NVIDIA GeForce RTX 4060',values:{'Installed driver':'32.0.16.1742'},deviceIds:['gpu-device']};
const device={id:'gpu-device',name:gpu.name,version:'32.0.16.1742',instanceId:'PCI\\VEN_10DE&DEV_2882\\INSTANCE',hardwareIds:['PCI\\VEN_10DE&DEV_2882'],compatibleIds:[]};
const report=()=>({scannedAt:'2026-10-09T12:00:00Z',components:[gpu,{id:'cpu',category:'Processor',name:'Example CPU',values:{},deviceIds:[]},{id:'misc',category:'Network',values:{},deviceIds:[]}],devices:[device],computer:{architecture:'x64',portable:false},hardware:{os:{name:'Microsoft Windows 11 Pro'}}});
const driver=(version,override={})=>({downloadInfo:{Version:version,IsBeta:'0',IsWHQL:'1',IsFeaturePreview:'0',IsActive:'1',IsCRD:'0',DetailsURL:'https://www.nvidia.com/en-us/drivers/details/123/',ReleaseDateTime:'2026-10-08',ReleaseNotes:encodeURIComponent('<b>Fixed frame pacing</b><br/>Source notes.'),...override}});
test('driver versions remain in their correct numbering system and incomplete title versions are not invented',()=>{
  assert.equal(nvidiaVersion('32.0.16.1742'),'617.42');assert.equal(nvidiaVersion('31.0.15.5222'),'552.22');assert.equal(nvidiaVersion('unknown'),'');
  assert.equal(compareVersions('32.0.16.1742','32.0.16.1000'),1);assert.equal(compareVersions('617.42','617.42'),0);assert.equal(compareVersions('2.L0','7C95v2N'),null);
  assert.equal(titleVersion('NVIDIA - Display - 32.0.16.1742'),'32.0.16.1742');assert.equal(titleVersion('BIOS 2026-10-08'),'');assert.equal(titleVersion('Example - 1.2.3.4 beta'),'');
});
test('NVIDIA catalog matches exact product and separates ambiguous notebook/desktop names',()=>{
  const xml='<LookupValueSearch><LookupValues><LookupValue ParentID="1"><Name>GeForce RTX 4060</Name><Value>995</Value></LookupValue><LookupValue ParentID="2"><Name>GeForce RTX 4060</Name><Value>996</Value></LookupValue></LookupValues></LookupValueSearch>';
  const products=parseLookup(xml),series=[{id:'1',name:'GeForce RTX 40 Series'},{id:'2',name:'GeForce RTX 40 Series (Notebooks)'}];
  assert.equal(pickNvidiaProduct(products,series,gpu.name,false).id,'995');assert.equal(pickNvidiaProduct(products,series,gpu.name,true).id,'996');
  assert.throws(()=>pickNvidiaProduct(products,series,gpu.name,null),/unique exact/);assert.throws(()=>pickNvidiaProduct(products,series,'NVIDIA GeForce RTX 4060 Ti',false),/unique exact/);assert.throws(()=>parseLookup('<html>blocked</html>'),/format changed/);
});
test('latest NVIDIA release is stable WHQL in the selected branch with a validated official details page',()=>{
  const raw={Success:'5',IDS:[driver('617.42'),driver('619.00',{IsBeta:'1'}),driver('618.01',{IsWHQL:'0'}),driver('618.02',{IsCRD:'1',IsWHQL:'0'}),driver('999.99',{DetailsURL:'https://nvidia.com.evil.invalid/release'})]};
  const gaming=parseNvidiaDrivers(raw,'game-ready');assert.equal(gaming.version,'617.42');assert.equal(gaming.notes,'Fixed frame pacing Source notes.');assert.equal(parseNvidiaDrivers(raw,'studio').version,'618.02');assert.match(parseNvidiaDrivers(raw,'studio').source,/WHQL not reported/);
  assert.throws(()=>parseNvidiaDrivers({Success:1,IDS:[driver('617.42',{DetailsURL:'https://www.nvidia.com/installer.exe'})]},'game-ready'),/No supported non-beta/);
});
test('manufacturer requests are bounded HTTPS metadata reads with no cookies, arbitrary hosts or redirects',async()=>{
  let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');return new Response('metadata');};
  assert.equal(await fetchMetadata('https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=3',{fetcher}),'metadata');
  await assert.rejects(fetchMetadata('https://localhost/private',{fetcher}),/Unrecognized/);assert.equal(calls,1);
  await assert.rejects(fetchMetadata('https://www.nvidia.com/x',{fetcher:async()=>new Response('x'.repeat(4*1024*1024+1))}),/size limit/);
});
test('NVIDIA lookup derives product and OS identifiers from official catalogs instead of a reference build',async()=>{
  const calls=[];
  const read=async url=>{calls.push(url);const u=new URL(url);const type=u.searchParams.get('TypeID');if(type==='3') return '<LookupValueSearch><LookupValue ParentID="127"><Name>GeForce RTX 4060</Name><Value>995</Value></LookupValue></LookupValueSearch>';if(type==='2') return '<LookupValueSearch><LookupValue><Name>GeForce RTX 40 Series</Name><Value>127</Value></LookupValue></LookupValueSearch>';if(type==='4') return '<LookupValueSearch><LookupValue><Name>Windows 11</Name><Value>135</Value></LookupValue></LookupValueSearch>';assert.equal(u.searchParams.get('pfid'),'995');assert.equal(u.searchParams.get('osID'),'135');return JSON.stringify({Success:1,IDS:[driver('617.42')]});};
  const result=await createVendorLookup({read}).nvidia(gpu,report(),'game-ready');assert.equal(result.installed,'617.42');assert.equal(calls.length,4);
  const arm=report();arm.computer.architecture='arm64';await assert.rejects(createVendorLookup({read}).nvidia(gpu,arm,'game-ready'),/x64 system/);
  const unknown=report();unknown.hardware.os.name='Unknown Windows';await assert.rejects(createVendorLookup({read}).nvidia(gpu,unknown,'game-ready'),/Windows x64/);
});
test('Windows offer matching is exact and preserves distinct providers/version branches',()=>{
  const offer=(id,version,manufacturer='NVIDIA',date='2026-10-08')=>({id,version,manufacturer,driverClass:'Display',hardwareId:device.hardwareIds[0],driverDate:date,links:[],title:version,description:''});
  const offers={packages:[offer('old','32.0.16.1000'),offer('new','32.0.16.1742'),offer('branch','31.0.15.5522','NVIDIA'),{...offer('wrong','99.0.0.0'),hardwareId:'PCI\\VEN_10DE&DEV_9999'},offer('provider','32.0.1.1','OEM')]};
  const matches=availablePackages(gpu,[device],offers);assert.equal(matches.length,3);assert.ok(matches.some(p=>p.offerId==='new'));assert.ok(!matches.some(p=>['old','wrong'].includes(p.offerId)));
});
test('per-component results retain manufacturer success across Windows Update failure and clear stale data on a failed recheck',async()=>{
  let fail=false;
  const lookup={nvidia:async()=>{if(fail)throw Error('Source unavailable');return {version:'617.42',installed:'617.42',source:'NVIDIA Game Ready · WHQL',url:'https://www.nvidia.com/en-us/drivers/details/123/',notes:'Fix',date:'2026-10-08',match:'Exact model'};}};
  const windowsUpdates={check:async()=>{throw Error('Update service unavailable');},cancel(){}};
  const m=createComponentUpdateChecker({lookup,windowsUpdates});const first=await m.check(report());assert.equal(first.items.length,2);assert.equal(first.items[0].status,'current');assert.equal(first.items[1].status,'not-applicable');assert.match(first.windowsUpdateError,/unavailable/);
  assert.match(m.link('gpu'),/nvidia/);assert.throws(()=>m.link('https://evil.invalid'));
  fail=true;const second=await m.check(report());assert.equal(second.items[0].latestVersion,'');assert.equal(second.items[0].status,'unverified');assert.throws(()=>m.link('gpu'));
  m.invalidate();assert.equal(m.status().result,null);await m.close();
});
test('latest-version checks reject invalid branches, cancel without committing stale results, and block rescan while running',async()=>{
  let finish;const windowsUpdates={check:async()=>({packages:[]}),cancel(){}};
  const lookup={nvidia:async()=>new Promise(resolve=>{finish=resolve;})};const m=createComponentUpdateChecker({lookup,windowsUpdates});
  assert.throws(()=>m.check(null),/Scan/);assert.throws(()=>m.check(report(),'beta'),/Invalid/);
  const running=m.check(report());assert.equal(m.isBusy(),true);assert.throws(()=>m.invalidate(),/cancel/);assert.throws(()=>m.check(report()),/already running/);
  m.cancel();finish({version:'617.42'});await assert.rejects(running,/cancelled/);assert.equal(m.status().result,null);assert.equal(m.isBusy(),false);await m.close();
});
test('AMD, Intel, unknown vendors, mixed GPUs and platform drivers use this PC’s exact device IDs',async()=>{
  for(const name of ['AMD Radeon RX 6950 XT','Intel Arc B580','Intel UHD Graphics','Unknown graphics adapter']) {
    const r=report();r.components=[{...gpu,id:'local-gpu',name,values:{'Installed driver':'1.2.3.4'},deviceIds:['local-device']},{id:'board',category:'Motherboard',name:'Different board',values:{},deviceIds:['chipset']}];
    r.devices=[{...device,id:'local-device',name,version:'1.2.3.4',instanceId:'PCI\\LOCAL',hardwareIds:['PCI\\LOCAL'],compatibleIds:[]},{...device,id:'chipset',name:'Platform controller',version:'2.3.4.5',instanceId:'PCI\\PLATFORM',hardwareIds:['PCI\\PLATFORM'],compatibleIds:[]}];
    const offer=(id,hardwareId,version)=>({id,hardwareId,version,title:id,manufacturer:'Local provider',driverClass:'System',driverDate:'2026-10-08',links:[],description:'Local update description'});
    const windowsUpdates={check:async()=>({packages:[offer('local','pci\\local','1.2.4.0'),offer('platform','PCI\\PLATFORM','2.4.0.0'),offer('reference',device.hardwareIds[0],'32.0.16.1742')]}),cancel(){}};
    const m=createComponentUpdateChecker({windowsUpdates,lookup:{nvidia:async()=>{throw Error('A non-NVIDIA adapter must never use NVIDIA lookup');}}});
    const result=await m.check(r);assert.equal(result.items[0].installedVersion,'1.2.3.4');assert.equal(result.items[0].latestVersion,'1.2.4.0');assert.equal(result.items[0].status,'offered');assert.equal(result.items[1].packages[0].latestVersion,'2.4.0.0');assert.ok(!JSON.stringify(result).includes('617.42'));await m.close();
  }
  const r=report();r.components.push({...gpu,id:'intel',name:'Intel integrated graphics',values:{'Installed driver':'31.0.1.2'},deviceIds:['intel']});r.devices.push({...device,id:'intel',instanceId:'PCI\\INTEL',hardwareIds:['PCI\\INTEL'],version:'31.0.1.2'});
  let calls=0;const m=createComponentUpdateChecker({windowsUpdates:{check:async()=>({packages:[]}),cancel(){}},lookup:{nvidia:async c=>{calls++;assert.equal(c.id,'gpu');return {version:'617.42',source:'NVIDIA',match:'Exact model'};}}});
  const mixed=await m.check(r);assert.equal(calls,1);assert.equal(mixed.items.find(i=>i.componentId==='intel').status,'unverified');assert.equal(mixed.items.find(i=>i.componentId==='intel').installedVersion,'31.0.1.2');await m.close();
});
test('component scan includes different platform/peripheral vendors without showing miscellaneous cards',()=>{
  const {hardwareComponents}=require('../electron/hardware-components.cjs');
  for(const vendor of ['AMD','Intel','Other platform vendor']) {
    const d=(id,category,name)=>({...device,id,category,name,instanceId:'PCI\\'+id,present:true,version:'1.2.3.4',provider:vendor});
    const devices=[d('chip','SYSTEM',vendor+' SMBus controller'),d('misc','SYSTEM','Microsoft software bus'),d('net','NET','Network card'),d('audio','MEDIA','USB Audio'),d('cpu','PROCESSOR','Example processor'),{...d('mouse','MOUSE','USB mouse'),instanceId:'HID\\VID_ABCD&PID_1234',hardwareIds:['HID\\VID_ABCD&PID_1234']}];
    const r={devices,recommendations:[],board:{manufacturer:vendor,product:'Different board',version:'2'},computer:{manufacturer:vendor,model:'Different system'},bios:{version:'F25'},hardware:{peripherals:[{name:'Different mouse',type:'Mouse',usbId:'ABCD:1234'}]}};
    const cards=hardwareComponents(r,{processors:[{Name:'Example processor'}]});
    assert.deepEqual(cards.find(c=>c.category==='Motherboard').deviceIds,['chip']);assert.deepEqual(cards.find(c=>c.category==='Processor').deviceIds,['cpu']);assert.deepEqual(cards.find(c=>c.category==='Peripherals').deviceIds,['mouse']);assert.equal(cards.find(c=>c.category==='BIOS / UEFI').values['BIOS version'],'F25');assert.ok(!cards.some(c=>c.name==='Microsoft software bus'||c.category==='Network'));
  }
});

test('ambiguous generic peripheral names do not associate another physical device’s driver',()=>{
  const {hardwareComponents}=require('../electron/hardware-components.cjs');
  const base={...device,name:'HID-compliant mouse',category:'MOUSE',present:true};
  const r={devices:[{...base,id:'one'},{...base,id:'two'}],recommendations:[],board:{},computer:{},bios:{},hardware:{peripherals:[{name:'HID-compliant mouse',type:'Mouse'}]}};
  const card=hardwareComponents(r,{}).find(c=>c.category==='Peripherals');assert.deepEqual(card.deviceIds,[]);assert.equal(card.values['Installed driver'],'');
});
test('history keeps removed platform/peripheral records visible while hiding unrelated Windows devices',()=>{
  const {visibleChange}=require('../src/lib/driver-visibility.ts');
  const change=(category,name,instanceId)=>({category,name,instanceId,deviceId:'no-longer-in-current-scan'});
  assert.equal(visibleChange(change('SYSTEM','Intel SMBus controller','PCI\\OLD'),null),true);
  assert.equal(visibleChange(change('HIDCLASS','USB mouse','HID\\OLD'),null),true);
  assert.equal(visibleChange(change('SYSTEM','Microsoft software bus','ROOT\\OLD'),null),false);
  assert.equal(visibleChange(change('NET','Virtual network adapter','ROOT\\OLD'),null),false);
});
