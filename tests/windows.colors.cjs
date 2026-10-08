'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createColorManager } = require('../electron/colors.cjs');
(async () => {
  const executable = path.resolve('build/color/Tweakerzzz.Color.exe');
  console.log(execFileSync(executable, ['--self-test'], { encoding: 'utf8', windowsHide: true }));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tz-native-color-'));
  const manager = createColorManager({ directory, executable });
  try {
    const status = await manager.status(); assert.equal(status.active, false); assert.equal(typeof status.supported, 'boolean');
    assert.equal(status.recoveryPending, false); assert.equal((await fs.readdir(directory)).length, 0);
    console.log('PASS: native color helper startup/IPC, live support detection, and clean shutdown. Display writes require physical NVIDIA tester validation.');
  } finally { await manager.close(); await fs.rm(directory, { recursive: true, force: true }); }
})().catch(e => { console.error(`::error title=Native color validation failed::${String(e.stack || e).replace(/\n/g, '%0A')}`); process.exitCode = 1; });
