'use strict';
// Read-only, bounded manufacturer metadata. No binaries or remote code are run.
const HOSTS = new Set(['www.nvidia.com', 'gfwsl.geforce.com']);
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
  let response;
  try { response=await fetcher(u.href,{signal:signal ? AbortSignal.any([signal,timeout]) : timeout,redirect:'error',credentials:'omit',headers:{Accept:'application/json, text/xml, text/html','User-Agent':'Tweakerzzz release metadata check'}}); }
  catch(error) { if(signal?.aborted) throw error; throw new Error(`${u.hostname}${u.pathname}: ${timeout.aborted ? 'metadata request timed out' : error.message}`,{cause:error}); }
  if(!response.ok) throw new Error(`${u.hostname}: manufacturer source returned HTTP ${response.status}.`);
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
    if(!d || String(d.IsBeta)!=='0' || branch!=='studio' && String(d.IsWHQL)!=='1' || String(d.IsFeaturePreview)!=='0' || String(d.IsActive)!=='1' || String(d.IsCRD)!==(branch==='studio'?'1':'0') || !/^\d{3,4}\.\d{2}$/.test(d.Version || '')) return [];
    const url=officialReleaseUrl(d.DetailsURL); if(!url) return [];
    let description=d.ReleaseNotes || ''; try { description=decodeURIComponent(description); } catch { /* Plain source text remains data. */ }
    return [{version:d.Version,date:String(d.ReleaseDateTime || '').slice(0,100),url,notes:plain(description).slice(0,12000),source:`NVIDIA ${branch==='studio'?'Studio · non-beta':'Game Ready'} · ${String(d.IsWHQL)==='1'?'WHQL':'WHQL not reported'}`,kind:'manufacturer'}];
  });
  rows.sort((a,b)=>compareVersions(b.version,a.version) || 0);
  if(!rows.length) throw new Error('No supported non-beta release was returned for this model and selected branch.');
  return rows[0];
}
function createVendorLookup({read=fetchMetadata}={}) {
  return {
    async nvidia(component, report, branch, signal, cachedRead=read) {
      if(!/\bGeForce\b/i.test(component.name)) throw new Error('Automatic NVIDIA lookup currently supports GeForce models. Use the official selector for workstation/enterprise branches.');
      if(report.computer.architecture !== 'x64') throw new Error('The x64 system architecture required by this driver source was not confirmed.');
      const [products,series,systems]=await Promise.all([3,2,4].map(async type=>parseLookup(await cachedRead(`https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=${type}`,{signal}))));
      const product=pickNvidiaProduct(products,series,component.name,report.computer.portable);
      const osName=report.hardware.os.name;
      const os=systems.filter(r=>/Windows 11/i.test(osName) ? r.name==='Windows 11' : /Windows 10/i.test(osName) ? r.name==='Windows 10 64-bit' : false);
      if(os.length!==1) throw new Error('An exact Windows x64 driver target could not be identified.');
      const url=new URL('https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php');
      url.search=new URLSearchParams({func:'DriverManualLookup',pfid:product.id,osID:os[0].id,dch:'1',upCRD:branch==='studio'?'1':'0',numberOfResults:'10',languageCode:'1033'}).toString();
      const result=parseNvidiaDrivers(JSON.parse(await cachedRead(url.href,{signal})),branch);
      return {...result,match:`Exact NVIDIA catalog model: ${product.name} · ${os[0].name}${component.source && component.source !== 'nvidia' ? ' · Check OEM validation and laptop prerequisites before choosing this generic NVIDIA release.' : ''}`,installed:nvidiaVersion(component.values['Installed driver'])};
    },

  };
}
module.exports={fetchMetadata,parseLookup,pickNvidiaProduct,parseNvidiaDrivers,createVendorLookup,compareVersions,nvidiaVersion,officialReleaseUrl,plain,normalize};
