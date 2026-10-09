'use strict';
// Read-only live provider checks with explicit hardware fixtures. This verifies
// public metadata contracts, not hardware ownership or firmware compatibility.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {createVendorLookup,fetchMetadata}=require('../electron/vendor-releases.cjs');
const evidence=[];
const sourceBodies=new Map();
const read=async(url,options)=>{const body=await fetchMetadata(url,options);if(url.includes('msi.com/api/')) sourceBodies.set(url,body);return body;};
const lookup=createVendorLookup({read});
const esc=s=>s.replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D');
(async()=>{
  assert.equal(process.platform,'win32');
  const report={hardware:{os:{name:'Microsoft Windows 11 Pro'}},computer:{portable:false},board:{manufacturer:'Micro-Star International Co., Ltd.',product:'B550M PRO-VDH WIFI (MS-7C95)',version:'1.0'}};
  const graphics=await lookup.nvidia({name:'NVIDIA GeForce RTX 4060',values:{'Installed driver':'32.0.16.1742'}},report,'game-ready');
  assert.match(graphics.version,/^\d{3,4}\.\d{2}$/);assert.equal(graphics.installed,'617.42');assert.match(graphics.match,/GeForce RTX 4060/);
  evidence.push({provider:'NVIDIA',...graphics});
  console.log('::notice title=NVIDIA live contract::'+esc(JSON.stringify({version:graphics.version,installed:graphics.installed,source:graphics.source,match:graphics.match,url:graphics.url})));
  const bios=await lookup.msi({values:{'BIOS version':'2.L0'}},report);
  assert.match(bios.version,/^7C95v2/i);assert.match(bios.url,/B550M-PRO-VDH-WIFI\/support#bios$/);
  evidence.push({provider:'MSI',...bios});
  console.log('::notice title=MSI live contract::'+esc(JSON.stringify(bios)));
  await fs.mkdir('release/qa',{recursive:true});await fs.writeFile('release/qa/vendor-metadata.json',JSON.stringify(evidence,null,2));
  console.log('PASS: official NVIDIA exact-model/Windows driver lookup and MSI exact-model stable BIOS lookup. No packages downloaded or installed.');
})().catch(e=>{
  console.error(e);console.log('::error title=Manufacturer contract validation failed::'+esc(String(e.stack || e)));
  for(const [url,body] of sourceBodies) console.log('::notice title=MSI response schema::'+esc(JSON.stringify({url,sample:body.slice(0,3000)})));
  process.exitCode=1;
});
