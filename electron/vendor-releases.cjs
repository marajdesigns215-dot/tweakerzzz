'use strict';
// Read-only, bounded manufacturer metadata. No binaries or remote code are run.
const HOSTS = new Set(['www.nvidia.com', 'gfwsl.geforce.com', 'www.msi.com', 'rog.asus.com']);
const plain = value => String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, s => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[s])).replace(/\s+/g, ' ').trim();
const normalize = value => plain(value).replace(/[®™]/g, '').replace(/^NVIDIA\s+/i, '').toUpperCase();
function compareVersions(a, b) {
  if (!/^\d+(?:\.\d+){1,4}$/.test(a || '') || !/^\d+(?:\.\d+){1,4}$/.test(b || '')) return null;
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i=0;i<Math.max(left.length,right.length);i++) { const n=(left[i]||0)-(right[i]||0); if(n) return Math.sign(n); }
  return 0;
}
function nvidiaVersion(value) {
  const m=/^\d+\.\d+\.(\d{2})\.(\d{4})$/.exec(value || '');
  return m ? `${m[1].slice(-1)}${m[2].slice(0,2)}.${m[2].slice(2)}` : /^\d{3,4}\.\d{2}$/.test(value || '') ? value : '';
}
function officialReleaseUrl(value) {
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && !u.port && ['nvidia.com','msi.com','asus.com'].some(h=>u.hostname===h || u.hostname.endsWith('.'+h)) && !/\.(exe|zip|msi|cab)(?:$|\?)/i.test(u.pathname) ? u.href : null; } catch { return null; }
}
async function fetchMetadata(url, { signal, fetcher = fetch } = {}) {
  const u=new URL(url);
  if (u.protocol!=='https:' || !HOSTS.has(u.hostname) || u.username || u.password || u.port) throw new Error('Unrecognized manufacturer metadata endpoint.');
  const timeout = AbortSignal.timeout(25000);
  const response=await fetcher(u.href,{signal:signal ? AbortSignal.any([signal,timeout]) : timeout,redirect:'error',credentials:'omit',headers:{Accept:'application/json, text/xml, text/html'}});
  if(!response.ok) throw new Error(`Manufacturer source returned HTTP ${response.status}.`);
  const reader=response.body.getReader(), chunks=[]; let length=0;
  try { while(true) { const {done,value}=await reader.read(); if(done) break; length+=value.length; if(length>4*1024*1024) throw new Error('Manufacturer metadata exceeds the size limit.'); chunks.push(value); } }
  finally { await reader.cancel().catch(()=>{}); }
  return Buffer.concat(chunks).toString('utf8');
}
function parseLookup(xml) {
  if (!/<LookupValueSearch\b/.test(xml)) throw new Error('NVIDIA product catalog format changed.');
  return [...xml.matchAll(/<LookupValue\b([^>]*)>([\s\S]*?)<\/LookupValue>/g)].map(m => ({
    parent:m[1].match(/\bParentID="(\d+)"/)?.[1] || '', name:plain(m[2].match(/<Name>([\s\S]*?)<\/Name>/)?.[1]), id:m[2].match(/<Value>(\d+)<\/Value>/)?.[1] || '',
  })).filter(r=>r.id && r.name);
}
function pickNvidiaProduct(products, series, name, portable) {
  let matches=products.filter(p=>normalize(p.name)===normalize(name));
  if(matches.length>1 && typeof portable==='boolean') matches=matches.filter(p=>/notebook|laptop/i.test(series.find(s=>s.id===p.parent)?.name || '')===portable);
  if(matches.length!==1) throw new Error('NVIDIA did not provide a unique exact model match. Use the official model selector.');
  return matches[0];
}
function parseNvidiaDrivers(raw, branch) {
  if (!raw || !Array.isArray(raw.IDS) || !Number.isFinite(Number(raw.Success)) || Number(raw.Success)<1) throw new Error('No driver metadata was returned for this model and Windows version.');
  const rows=raw.IDS.flatMap(row=>{
    const d=row?.downloadInfo;
    if(!d || String(d.IsBeta)!=='0' || String(d.IsWHQL)!=='1' || String(d.IsFeaturePreview)!=='0' || String(d.IsActive)!=='1' || String(d.IsCRD)!==(branch==='studio'?'1':'0') || !/^\d{3,4}\.\d{2}$/.test(d.Version || '')) return [];
    const url=officialReleaseUrl(d.DetailsURL); if(!url) return [];
    let description=d.ReleaseNotes || ''; try { description=decodeURIComponent(description); } catch { /* Plain source text remains data. */ }
    return [{version:d.Version,date:String(d.ReleaseDateTime || '').slice(0,100),url,notes:plain(description).slice(0,12000),source:`NVIDIA ${branch==='studio'?'Studio':'Game Ready'} · WHQL`,kind:'manufacturer'}];
  });
  rows.sort((a,b)=>compareVersions(b.version,a.version) || 0);
  if(!rows.length) throw new Error('No stable WHQL release was returned for this model and selected branch.');
  return rows[0];
}
function msiModel(report) {
  const product=report.board.product || '';
  const family=product.match(/\(MS-([A-Z0-9]{4})\)/i)?.[1]?.toUpperCase() || '';
  const model=product.replace(/\s*\(MS-[A-Z0-9]{4}\)\s*/ig,' ').trim();
  if(!model || /^MS-/i.test(model) || !/^[A-Za-z0-9 +.-]{4,100}$/.test(model)) throw new Error('MSI retail motherboard model is not uniquely identified. An MS-number alone is not a BIOS match.');
  return {model,family,slug:model.replace(/\s+/g,'-')};
}
function parseMsiBios(raw, model, installedVersion) {
  const downloads=raw?.result?.downloads;
  if(!downloads || !Array.isArray(downloads.type_title)) throw new Error('MSI BIOS catalog format changed or this model is unsupported.');
  const installedCode=/^([A-Z0-9])\.([A-Z0-9])0$/i.exec(installedVersion || '');
  const rows=downloads.type_title.flatMap(type=>Array.isArray(downloads[type]) ? downloads[type] : []).flatMap(d=>{
    const version=plain(d.download_version), code=/^([A-Z0-9]{4})v([A-Z0-9]{2,5})$/i.exec(version);
    if(!code || /beta|preview|test version/i.test([d.download_version,d.download_title,d.download_note].join(' ')) || !/^\d{4}-\d{2}-\d{2}$/.test(d.download_release || '')) return [];
    if(model.family && code[1].toUpperCase()!==model.family) return [];
    if(installedCode && code[2][0].toUpperCase()!==installedCode[1].toUpperCase()) return [];
    return [{version,date:d.download_release,notes:plain([d.download_description,d.download_note].filter(Boolean).join('\n')).slice(0,12000),source:'MSI · stable BIOS',kind:'manufacturer',comparison:installedCode && code[2].toUpperCase()===installedCode[1].toUpperCase()+installedCode[2].toUpperCase() ? 0 : null}];
  });
  rows.sort((a,b)=>b.date.localeCompare(a.date));
  if(!rows.length) throw new Error('No stable BIOS release matched this exact model and reported BIOS branch.');
  return rows[0];
}
function createVendorLookup({read=fetchMetadata}={}) {
  return {
    async nvidia(component, report, branch, signal, cachedRead=read) {
      if(!/\bGeForce\b/i.test(component.name)) throw new Error('Automatic NVIDIA lookup currently supports GeForce models. Use the official selector for workstation/enterprise branches.');
      const [products,series,systems]=await Promise.all([3,2,4].map(async type=>parseLookup(await cachedRead(`https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=${type}`,{signal}))));
      const product=pickNvidiaProduct(products,series,component.name,report.computer.portable);
      const osName=report.hardware.os.name;
      const os=systems.filter(r=>/Windows 11/i.test(osName) ? r.name==='Windows 11' : /Windows 10/i.test(osName) ? r.name==='Windows 10 64-bit' : false);
      if(os.length!==1) throw new Error('An exact Windows x64 driver target could not be identified.');
      const url=new URL('https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php');
      url.search=new URLSearchParams({func:'DriverManualLookup',pfid:product.id,osID:os[0].id,dch:'1',numberOfResults:'100',languageCode:'1033'}).toString();
      const result=parseNvidiaDrivers(JSON.parse(await cachedRead(url.href,{signal})),branch);
      return {...result,match:`Exact NVIDIA catalog model: ${product.name} · ${os[0].name}`,installed:nvidiaVersion(component.values['Installed driver'])};
    },
    async msi(component, report, signal, cachedRead=read) {
      const model=msiModel(report), page=`https://www.msi.com/Motherboard/${encodeURIComponent(model.slug)}/support`;
      const html=await cachedRead(page,{signal});
      const title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
      const exact=s=>normalize(s).replace(/[^A-Z0-9+]/g,'');
      if(exact(title)!==exact(model.model)) throw new Error('The MSI support page did not confirm the exact motherboard model.');
      const endpoint='https://www.msi.com/api/v1/product/support/panel?'+new URLSearchParams({product:model.slug,type:'bios'});
      const result=parseMsiBios(JSON.parse(await cachedRead(endpoint,{signal})),model,component.values['BIOS version']);
      return {...result,url:page+'#bios',match:`Exact MSI model page: ${model.model}. Verify board revision and OEM requirements before any manual firmware change.`};
    },
  };
}
module.exports={fetchMetadata,parseLookup,pickNvidiaProduct,parseNvidiaDrivers,msiModel,parseMsiBios,createVendorLookup,compareVersions,nvidiaVersion,officialReleaseUrl,plain,normalize};
