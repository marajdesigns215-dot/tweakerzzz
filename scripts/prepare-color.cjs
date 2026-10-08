'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (process.platform !== 'win32') { console.error('Build the native color helper on Windows using .NET Framework 4.8.'); process.exitCode = 1; }
else {
  const framework = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  fs.mkdirSync(path.join(root, 'build', 'color'), { recursive: true });
  execFileSync(path.join(framework, 'csc.exe'), ['/nologo', '/target:exe', '/platform:x64', '/optimize+', '/reference:' + path.join(framework, 'System.Web.Extensions.dll'), '/out:' + path.join(root, 'build', 'color', 'Tweakerzzz.Color.exe'), path.join(root, 'native', 'color', 'ColorAgent.cs')], { stdio: 'inherit', windowsHide: true });
}
