'use strict';
const path = require('node:path');
const { execute } = require('./scanner.cjs');
const manifest = require('../scripts/windows/tweaks.json');

// Generated only from bundled data, never from renderer input. This command
// reads HKCU and the active power scheme; it cannot set or restore anything.
const command = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$manifest = '${JSON.stringify(manifest).replace(/'/g, "''")}' | ConvertFrom-Json
$states = @(); foreach ($entry in $manifest) {
  try {
    if ($entry.id -eq 'power-plan') {
      $active = (& "$env:SystemRoot\\System32\\powercfg.exe" /getactivescheme 2>&1) -join ' '
      if ($LASTEXITCODE -ne 0 -or $active -notmatch '[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}') { throw 'Could not read the active power scheme.' }
      $state = if ($Matches[0] -eq '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c') { 'enabled' } else { 'not-enabled' }
      $message = if ($state -eq 'enabled') { 'High performance is the active Windows power plan.' } else { 'A different Windows power plan is active.' }
    } else {
      $missing = $false; $different = $false
      foreach ($spec in @($entry.registry)) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($spec.path, $false)
        if ($null -eq $key) { $missing = $true; continue }
        try {
          if ($key.GetValueNames() -notcontains $spec.name) { $missing = $true; continue }
          $kind = $key.GetValueKind($spec.name).ToString()
          $value = $key.GetValue($spec.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
          if ($kind -ne $spec.kind -or [string]$value -cne [string]$spec.value) { $different = $true }
        } finally { $key.Dispose() }
      }
      $state = if ($different) { 'not-enabled' } elseif ($missing) { 'not-configured' } else { 'enabled' }
      $message = switch ($state) {
        'enabled' { 'All saved Windows values match this tweak. Sign-out, restart, or organizational policy can still affect behavior.' }
        'not-enabled' { 'One or more saved Windows values differ from this tweak.' }
        'not-configured' { 'One or more preferences are unset. The effective Windows default is not inferred.' }
      }
    }
    $states += @{ id = $entry.id; status = $state; message = $message }
  } catch { $states += @{ id = $entry.id; status = 'unknown'; message = ('Windows could not read this setting: ' + $_.Exception.Message) } }
}
[Console]::Out.WriteLine((@{ checkedAt = [DateTime]::UtcNow.ToString('o'); tweaks = $states } | ConvertTo-Json -Depth 5 -Compress))`;

function createStatusReader({ run = execute, environment = process.env } = {}) {
  return async function getTweakStatus() {
    const executable = path.win32.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const raw = await run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command]);
    const report = JSON.parse(raw.replace(/^\uFEFF/, '').trim());
    if (!report || !Array.isArray(report.tweaks) || report.tweaks.length !== manifest.length) throw new Error('Windows returned an incomplete settings report.');
    return report;
  };
}

module.exports = { createStatusReader, getTweakStatus: createStatusReader() };
