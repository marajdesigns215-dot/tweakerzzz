'use strict';
// Read-only live provider contract. Hardware fixtures are inputs, not detected PCs.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createVendorLookup, fetchMetadata } = require('../electron/vendor-releases.cjs');
const esc = s => s.replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D');
(async () => {
  assert.equal(process.platform, 'win32');
  const lookup = createVendorLookup({read:async(url,options)=>{const body=await fetchMetadata(url,options);if(url.includes('AjaxDriverService')){const raw=JSON.parse(body);console.log('::notice title=NVIDIA branch response::'+esc(JSON.stringify({branch:new URL(url).searchParams.get('upCRD'),drivers:raw.IDS?.slice(0,3).map(r=>{const d=r.downloadInfo;return {version:d.Version,crd:d.IsCRD,whql:d.IsWHQL,active:d.IsActive,beta:d.IsBeta,preview:d.IsFeaturePreview};})})));}return body;}});
  const evidence = [];
  for (const fixture of [
    {name:'NVIDIA GeForce RTX 4060', version:'32.0.16.1742', portable:false, branch:'game-ready'},
    {name:'NVIDIA GeForce RTX 3060 Laptop GPU', version:'31.0.15.5222', portable:true, branch:'studio'},
  ]) {
    const report = {hardware:{os:{name:'Microsoft Windows 11 Pro'}},computer:{architecture:'x64',portable:fixture.portable}};
    const graphics = await lookup.nvidia({name:fixture.name,values:{'Installed driver':fixture.version}},report,fixture.branch);
    assert.match(graphics.version,/^\d{3,4}\.\d{2}$/);
    assert.ok(graphics.match.includes(fixture.name));
    evidence.push({fixture,...graphics});
    console.log('::notice title=NVIDIA live contract::'+esc(JSON.stringify({fixture,version:graphics.version,source:graphics.source,match:graphics.match,url:graphics.url})));
  }
  await fs.mkdir('release/qa',{recursive:true});
  await fs.writeFile('release/qa/vendor-metadata.json',JSON.stringify(evidence,null,2));
  console.log('PASS: official desktop/Game Ready and laptop/Studio NVIDIA metadata. No packages downloaded or installed.');
})().catch(e => { console.error(e); console.log('::error title=Manufacturer contract validation failed::'+esc(String(e.stack || e))); process.exitCode=1; });
