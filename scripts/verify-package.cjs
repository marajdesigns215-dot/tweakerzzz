'use strict';
// Verify the built payload, not just the installer configuration.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const source = require('../package.json');
const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'release', 'win-unpacked', 'resources');
const archive = path.join(resources, 'app.asar');
const installerName = `Tweakerzzz-Setup-${source.version}-x64.exe`;
const installer = path.join(root, 'release', installerName);

function checkPe(file, machine) {
  const handle = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(64);
    assert.equal(fs.readSync(handle, header, 0, 64, 0), 64);
    assert.equal(header.toString('ascii', 0, 2), 'MZ', 'Missing Windows executable header');
    const pe = Buffer.alloc(6);
    fs.readSync(handle, pe, 0, 6, header.readUInt32LE(60));
    assert.equal(pe.toString('ascii', 0, 4), 'PE\0\0');
    if (machine) assert.equal(pe.readUInt16LE(4), machine, 'The app must target Windows x64');
  } finally { fs.closeSync(handle); }
}

function verify() {
  checkPe(installer);
  checkPe(path.join(root, 'release', 'win-unpacked', 'Tweakerzzz.exe'), 0x8664);
  const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(packed.version, source.version);
  assert.equal(packed.main, 'electron/main.cjs');
  assert.ok(asar.extractFile(archive, path.join('dist', 'index.html')).length > 0);
  for (const file of fs.readdirSync(path.join(root, 'electron')).filter(file => file.endsWith('.cjs'))) {
    assert.deepEqual(asar.extractFile(archive, path.join('electron', file)), fs.readFileSync(path.join(root, 'electron', file)), `Packaged native module mismatch: ${file}`);
  }
  for (const file of fs.readdirSync(path.join(root, 'scripts', 'windows'))) {
    const original = fs.readFileSync(path.join(root, 'scripts', 'windows', file));
    assert.deepEqual(fs.readFileSync(path.join(resources, 'windows', file)), original, `External Windows resource mismatch: ${file}`);
    assert.deepEqual(asar.extractFile(archive, path.join('scripts', 'windows', file)), original, `Internal Windows resource mismatch: ${file}`);
  }
  const sum = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
  fs.writeFileSync(path.join(root, 'release', 'SHA256SUMS.txt'), `${sum}  ${installerName}\n`);
  console.log(`PASS: ${installerName}, Windows x64 application, renderer, all native modules/resources, and SHA-256 checksum.`);
}
try { verify(); }
catch (error) {
  const detail = String(error.message).slice(0, 2000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.error(`::error title=Packaged application verification failed::${detail}`);
  process.exitCode = 1;
}
