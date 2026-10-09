'use strict';
// Read-only provider contract investigation on the supported Windows platform.
// No drivers, firmware or installers are downloaded; website text is never executed.
const fs = require('node:fs/promises');
const pages = {
  nvidiaProducts: 'https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=3',
  nvidiaSeries: 'https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=2',
  nvidiaOs: 'https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=4',
  nvidiaDriver: 'https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&pfid=995&osID=135&dch=1&numberOfResults=10&languageCode=1033',
  msiBoard: 'https://www.msi.com/Motherboard/B550M-PRO-VDH-WIFI/support',
  asusBios: 'https://rog.asus.com/support/webapi/product/GetPDBIOS?website=global&model=PRIME%20B550M-A&cpu=PRIME%20B550M-A',
  msiApiDefinition: 'https://storage-asset.msi.com/frontend/js/components/product/support/api.js?ver=20220727',
  msiBiosDefinition: 'https://storage-asset.msi.com/frontend/js/components/product/support/BIOSPanel.js?ver=2025090503',
};
async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'Tweakerzzz/0.7 metadata validation' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.text(); if (data.length > 4 * 1024 * 1024) throw new Error('Metadata exceeds limit');
  return data;
}
(async () => {
  const evidence = {};
  await Promise.allSettled(Object.entries(pages).map(async ([key,url]) => {
    try {
      const data = await read(url); evidence[key] = { bytes: data.length, sample: data.slice(0, key.endsWith('Definition') ? 10000 : key === 'nvidiaDriver' || key === 'asusBios' ? 7000 : 1500) };
      if (key === 'msiBoard') {
        const inline = [...data.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>/support|bios|product/i.test(s)).join('\n').slice(-20000);
        for (let i=0;i<inline.length;i+=3000) console.log(`::notice title=MSI support contract ${i/3000}::${inline.slice(i,i+3000).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D')}`);
        const scripts = [...data.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => new URL(m[1],url)).filter(u => /(^|\.)msi\.com$/.test(u.hostname));
        evidence[key].scripts = scripts.map(u=>u.href);
        evidence[key].markers = [...data.matchAll(/.{0,120}(?:getBIOS|getBios|get_bios|Get_Bios|support_ajax|api\/v1|7C95v|product_id).{0,180}/gi)].slice(0,20).map(m=>m[0]);
        evidence[key].supportScripts = [];
        for (const script of scripts.filter(u=>/support|product|bundle|main/i.test(u.pathname)).slice(0,8)) {
          try { const content=await read(script.href); evidence[key].supportScripts.push({url:script.href,markers:[...content.matchAll(/.{0,100}(?:getBIOS|getBios|get_bios|Get_Bios|support_ajax|api\/v1|bios|BIOS).{0,160}/g)].slice(0,25).map(m=>m[0])}); } catch(e) { evidence[key].supportScripts.push({url:script.href,error:String(e)}); }
        }
      }
    } catch(e) { evidence[key] = {error:String(e)}; }
  }));
  await fs.mkdir('release/qa',{recursive:true}); await fs.writeFile('release/qa/vendor-metadata.json',JSON.stringify(evidence,null,2));
  for (const [name,result] of Object.entries(evidence)) console.log(`::notice title=Provider ${name}::${JSON.stringify(result).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D')}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
