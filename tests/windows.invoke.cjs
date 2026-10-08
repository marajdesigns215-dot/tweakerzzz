'use strict';
// Feed JSON through a real redirected stdin pipe, as Electron does. Windows
// PowerShell's object-to-native pipeline is not a byte-preserving transport.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
if (process.platform !== 'win32') throw new Error('This test helper requires Windows.');
const input = Buffer.from(process.argv[2] || '', 'base64').toString('utf8');
JSON.parse(input);
const result = spawnSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', path.join(__dirname, '..', 'scripts', 'windows', 'tweaks.ps1')],
  { input, encoding: 'utf8', windowsHide: true, shell: false, timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) process.stderr.write(result.error.message);
process.exitCode = result.status ?? 1;
