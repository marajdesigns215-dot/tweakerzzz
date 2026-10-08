'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execute } = require('./scanner.cjs');
const { validateTweakIds } = require('./validation.cjs');
const manifest = require('../scripts/windows/tweaks.json');

// Fixed read-only command from bundled metadata. Downloaded .ps1 files and
// execution-policy changes are not needed to save a settings snapshot.
const command = `$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$manifest = '${JSON.stringify(manifest).replace(/'/g, "''")}' | ConvertFrom-Json
$records = @(); $seen = @{}
foreach ($entry in $manifest) { foreach ($spec in $entry.registry) {
  $identity = $spec.path + '|' + $spec.name
  if ($seen.ContainsKey($identity)) { continue }; $seen[$identity] = $true
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($spec.path, $false)
  $record = [ordered]@{ path = $spec.path; name = $spec.name; keyExisted = ($null -ne $key); existed = $false; kind = $null; value = $null }
  if ($null -ne $key) { try {
    if ($key.GetValueNames() -contains $spec.name) {
      $record.existed = $true; $record.kind = $key.GetValueKind($spec.name).ToString()
      $value = $key.GetValue($spec.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      switch ($record.kind) {
        'Binary' { $record.value = [Convert]::ToBase64String([byte[]]$value) }
        'None' { $record.value = [Convert]::ToBase64String([byte[]]$value) }
        'DWord' { $record.value = ([int]$value).ToString([Globalization.CultureInfo]::InvariantCulture) }
        'QWord' { $record.value = ([long]$value).ToString([Globalization.CultureInfo]::InvariantCulture) }
        'MultiString' { $record.value = @([string[]]$value) }
        default { $record.value = [string]$value }
      }
    }
  } finally { $key.Dispose() } }
  $records += $record
} }
$power = (& "$env:SystemRoot\\System32\\powercfg.exe" /getactivescheme 2>&1) -join ' '
if ($LASTEXITCODE -ne 0 -or $power -notmatch '[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}') { throw 'Could not read the current power plan. No snapshot was saved.' }
[Console]::Out.WriteLine((@{ registry = $records; powerScheme = $Matches[0] } | ConvertTo-Json -Depth 8 -Compress))`;

function createSnapshotSaver({ run = execute, environment = process.env } = {}) {
  return async function saveSnapshot(directory, input) {
    const ids = validateTweakIds(input);
    const executable = path.win32.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const raw = await run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { timeoutMs: 20000 });
    const data = JSON.parse(raw.replace(/^\uFEFF/, '').trim());
    const specs = manifest.filter(t => ids.includes(t.id)).flatMap(t => t.registry);
    if (!Array.isArray(data.registry) || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(data.powerScheme)) throw new Error('Incomplete snapshot response. No snapshot was saved.');
    const records = specs.map(spec => {
      const matches = data.registry.filter(r => r.path === spec.path && r.name === spec.name);
      if (matches.length !== 1) throw new Error('A supported setting is missing from the snapshot. No snapshot was saved.');
      const r = matches[0];
      if (typeof r.existed !== 'boolean' || typeof r.keyExisted !== 'boolean' || (r.existed && (!['String', 'ExpandString', 'DWord', 'QWord', 'MultiString', 'Binary', 'None'].includes(r.kind) || (r.kind === 'MultiString' ? !Array.isArray(r.value) || !r.value.every(v => typeof v === 'string') : typeof r.value !== 'string')))) throw new Error('A snapshot value cannot be restored safely. No snapshot was saved.');
      return { path: r.path, name: r.name, keyExisted: r.keyExisted, existed: r.existed, kind: r.kind, value: r.value };
    });
    await fs.mkdir(directory, { recursive: true });
    for (const file of await fs.readdir(directory)) {
      if (!/^[a-f\d]{32}\.json$/.test(file)) continue;
      const prior = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
      if (['pending', 'rollback-failed'].includes(prior.status)) throw new Error('Restore the newest unfinished backup before saving another snapshot.');
    }
    const id = crypto.randomUUID().replaceAll('-', '');
    const backup = { version: 1, id, createdAt: new Date().toISOString(), ids, action: 'snapshot', status: 'applied', registry: records, createdKeys: [], powerScheme: ids.includes('power-plan') ? data.powerScheme : null };
    const temporary = path.join(directory, id + '.tmp');
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(JSON.stringify(backup, null, 2), 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, path.join(directory, id + '.json'));
    return { backupId: id, applied: ids, skipped: [], message: 'Saved your exact supported settings and selected power plan. No Windows settings were changed. This is not a Windows System Restore point.' };
  };
}
module.exports = { createSnapshotSaver, saveSnapshot: createSnapshotSaver() };
