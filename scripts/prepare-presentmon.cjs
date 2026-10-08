'use strict';
// Only a pinned official release is packaged. No runtime downloads or arbitrary
// executable selection are exposed to the renderer.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const spec = require('../electron/presentmon.json');
const directory = path.join(__dirname, '..', 'vendor', 'presentmon');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function prepare() {
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, spec.file);
  try { if (hash(await fs.readFile(target)) === spec.sha256) { console.log('Verified cached PresentMon ' + spec.version); return; } }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(spec.url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`PresentMon download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== spec.sha256) throw new Error('PresentMon checksum mismatch. The download will not be used.');
  await fs.writeFile(target, bytes);
  console.log('Downloaded and verified official PresentMon ' + spec.version);
}
prepare().catch(error => { console.error(error); process.exitCode = 1; });
