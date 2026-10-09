'use strict';
const {createVendorLookup,fetchMetadata,compareVersions,nvidiaVersion,officialReleaseUrl}=require('./vendor-releases.cjs');
const CATEGORIES=['Graphics','Processor','Motherboard','BIOS / UEFI','Peripherals','Audio'];
function installed(component) {
  return component.values['Installed driver'] || component.values['BIOS version'] || '';
}
function availablePackages(component, devices, offers) {
  if(!['Graphics','Peripherals','Audio','Motherboard','Processor'].includes(component.category)) return [];
  const matches=[];
  for(const device of devices.filter(d=>component.deviceIds.includes(d.id))) {
    const ids=[device.instanceId,...device.hardwareIds,...device.compatibleIds].filter(Boolean).map(id=>id.toUpperCase());
    const candidates=(offers?.packages || []).filter(p=>p.hardwareId && ids.includes(p.hardwareId.toUpperCase()));
    // Driver versions from different providers/branches are not interchangeable.
    // WUA determines applicability; retain the publisher and Windows title.
    const groups=new Map();
    for(const p of candidates) {
      const key=[p.manufacturer,p.driverClass,p.version?.split('.')[0] || p.id].join('|');
      const previous=groups.get(key);
      if(!previous || (p.driverDate || '').localeCompare(previous.driverDate || '')>0 || p.driverDate===previous.driverDate && compareVersions(p.version,previous.version)===1) groups.set(key,p);
    }
    for(const p of groups.values()) matches.push({deviceId:device.id,name:device.name,installedVersion:device.version,latestVersion:p.version || '',title:p.title,source:'Windows Update offer',date:p.driverDate,url:p.links[0]?.url || '',offerId:p.id,notes:p.description,comparison:compareVersions(p.version,device.version)});
  }
  return matches;
}
function baseItem(component, report, offers, updateError) {
  const item={componentId:component.id,installedVersion:installed(component),installedRaw:installed(component),latestVersion:'',status:'unverified',source:'',date:'',url:'',notes:'',message:'The newest manufacturer release has not been verified for this exact model.',packages:availablePackages(component,report.devices,offers)};
  if(component.category==='Processor' || component.category==='Motherboard') return {...item,status:item.packages.length ? 'offered' : 'not-applicable',message:(component.category==='Processor' ? 'Reported Windows processor drivers are separate from CPU firmware. CPU support also comes through chipset/platform packages and the exact motherboard BIOS.' : 'Motherboard platform drivers have individual versions; there is no single board driver version. The BIOS card shows firmware separately.') + (updateError ? ` Update source unavailable: ${updateError}` : offers && !item.packages.length ? ' No exact device-matched Windows Update offers were returned; this does not establish that all platform packages are current.' : '')};
  if(/NVIDIA/i.test(component.name) && component.category==='Graphics') item.installedVersion=nvidiaVersion(item.installedRaw) || item.installedRaw;
  if(item.packages.length) {
    const unique=[...new Set(item.packages.map(p=>p.latestVersion))];
    item.latestVersion=unique.length===1 ? unique[0] : '';
    item.source='Windows Update — applicable offers';
    item.status='offered';
    item.message='Most recent dated offers for the matched devices; distinct publishers and major-version branches stay separate. Windows Update may lag manufacturer releases; firmware and control-app versions are separate.';
    if(component.category==='Graphics' && /NVIDIA/i.test(component.name) && item.latestVersion) item.latestVersion=nvidiaVersion(item.latestVersion) || item.latestVersion;
  } else if(updateError && ['Graphics','Peripherals','Audio'].includes(component.category)) item.message=`Update source unavailable. ${updateError}`;
  else if(offers && ['Graphics','Peripherals','Audio'].includes(component.category)) item.message='No exact device-matched update offer was returned. This does not establish that the newest manufacturer release is installed.';
  return item;
}
function createComponentUpdateChecker({windowsUpdates,lookup=createVendorLookup(),read=fetchMetadata,now=()=>new Date().toISOString()}={}) {
  let checking=null,latest=null,controller=null,closed=false;
  return {
    check(report,branch='game-ready') {
      if(closed) throw new Error('The update checker is closing.');
      if(checking) throw new Error('A latest-version check is already running.');
      if(!report || !report.components) throw new Error('Scan this PC before checking its latest releases.');
      if(!['game-ready','studio'].includes(branch)) throw new Error('Invalid NVIDIA release branch.');
      latest=null;controller=new AbortController();const signal=controller.signal;
      const cache=new Map();
      const cachedRead=(url,options)=>{if(!cache.has(url)) cache.set(url,read(url,options));return cache.get(url);};
      checking=(async()=>{
        const components=report.components.filter(c=>CATEGORIES.includes(c.category));
        const nativePromise=windowsUpdates.check().then(offers=>({offers})).catch(e=>({error:String(e.message || e).slice(0,1000)}));
        const vendorPromises=components.map(async c=>{
          try {
            if(c.category==='Graphics' && /NVIDIA/i.test(c.name)) return {result:await lookup.nvidia(c,report,branch,signal,cachedRead)};
            return {};
          } catch(e) {return {error:String(e.message || e).slice(0,1000)};}
        });
        const [windows,vendors]=await Promise.all([nativePromise,Promise.all(vendorPromises)]);
        if(signal.aborted) throw new Error('Latest-version check cancelled.');
        const items=components.map((c,i)=>{
          const base=baseItem(c,report,windows.offers,windows.error), vendor=vendors[i];
          if(vendor.result) {
            const v=vendor.result, current=v.installed ?? base.installedVersion;
            const comparison=v.comparison ?? (v.version===current ? 0 : compareVersions(v.version,current));
            return {...base,installedVersion:current,latestVersion:v.version,status:comparison===0?'current':comparison===1?'newer':comparison===-1?'ahead':'different',source:v.source,date:v.date,url:v.url,notes:v.notes,message:v.match};
          }
          return vendor.error ? {...base,message:`Manufacturer lookup unavailable: ${vendor.error} ${base.message}`} : base;
        });
        latest={checkedAt:now(),scannedAt:report.scannedAt,branch,items,windowsUpdateError:windows.error || ''};return latest;
      })().finally(()=>{checking=null;controller=null;});
      return checking;
    },
    status:()=>({checking:!!checking,result:latest}),
    invalidate:()=>{if(checking) throw new Error('Finish or cancel the latest-version check before rescanning.');latest=null;},
    link(id) { const item=latest?.items.find(i=>i.componentId===id);const url=officialReleaseUrl(item?.url);if(!url) throw new Error('Verified manufacturer release page is unavailable.');return url; },
    cancel:()=>{controller?.abort();windowsUpdates.cancel();},
    isBusy:()=>!!checking,
    close:async()=>{closed=true;controller?.abort();windowsUpdates.cancel();await checking?.catch(()=>{});},
  };
}
module.exports={createComponentUpdateChecker,availablePackages,baseItem,CATEGORIES};
