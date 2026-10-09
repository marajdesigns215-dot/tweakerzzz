#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (-not ($env:GITHUB_ACTIONS -eq 'true' -and $env:RUNNER_OS -eq 'Windows')) {
    throw 'Run registry permission tests only on an isolated Windows CI runner.'
}
# Only private disposable keys receive test ACLs. Production Edge/Windows keys
# are never modified. Run the production transaction script with a remapped manifest.
$token = [Guid]::NewGuid().ToString('N')
$root = 'Software\TweakerzzzPermissionTests-' + $token
$protected = $root + '\Protected'
$desktop = $root + '\Desktop'
$folder = Join-Path $env:RUNNER_TEMP ('TweakerzzzPermissions-' + $token)
$null = New-Item -ItemType Directory -Path $folder
$scriptFile = Join-Path $folder 'tweaks.ps1'
$manifestFile = Join-Path $folder 'tweaks.json'
$backupDirectory = Join-Path $folder 'backups'
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../scripts/windows/tweaks.ps1') -Raw
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../scripts/windows/tweaks.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest) {
    foreach ($spec in $entry.registry) {
        $spec.path = if ($entry.id -in @('edge-background', 'edge-startup-boost')) { $protected } elseif ($entry.id -eq 'menu-delay') { $desktop } else { $root + '\Other\' + $entry.id }
    }
}
[IO.File]::WriteAllText($scriptFile, $source)
[IO.File]::WriteAllText($manifestFile, ($manifest | ConvertTo-Json -Depth 8))
$invoke = @'
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const result = spawnSync(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'), ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',process.argv[1]], {input:Buffer.from(process.argv[2],'base64').toString('utf8'),encoding:'utf8',windowsHide:true,timeout:60000});
if(result.stdout) process.stdout.write(result.stdout);
if(result.stderr) process.stderr.write(result.stderr);
if(result.error) console.error(result.error);
process.exitCode=result.status ?? 1;
'@
function Invoke-Fixture($payload) {
    $payload.backupDirectory = $backupDirectory
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 8 -Compress)))
    $raw = & node -e $invoke $scriptFile $encoded
    $result = ($raw -join "`n") | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $result.ok) { throw ('Fixture operation failed: ' + $result.error) }
    return $result.data
}
function Write-FixtureValues($edgeValue, $menuValue) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($protected)
    try {
        $key.SetValue('BackgroundModeEnabled', [int]$edgeValue, [Microsoft.Win32.RegistryValueKind]::DWord)
        $key.SetValue('StartupBoostEnabled', [int]$edgeValue, [Microsoft.Win32.RegistryValueKind]::DWord)
    } finally { $key.Dispose() }
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($desktop)
    try { $key.SetValue('MenuShowDelay', [string]$menuValue, [Microsoft.Win32.RegistryValueKind]::String) } finally { $key.Dispose() }
}
function Read-FixtureValues {
    $values = @()
    foreach ($path in @($protected, $desktop)) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($path, $false)
        try {
            foreach ($name in @($key.GetValueNames() | Sort-Object)) { $values += @{ name = $name; kind = $key.GetValueKind($name).ToString(); value = $key.GetValue($name) } }
        } finally { $key.Dispose() }
    }
    return ConvertTo-Json -InputObject @($values) -Compress
}
function Set-FixtureAcl($sddl, $deny = $null) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($protected, [Microsoft.Win32.RegistryKeyPermissionCheck]::Default, ([Security.AccessControl.RegistryRights]::ReadPermissions -bor [Security.AccessControl.RegistryRights]::ChangePermissions))
    try {
        $acl = [Security.AccessControl.RegistrySecurity]::new()
        $acl.SetSecurityDescriptorSddlForm($sddl, [Security.AccessControl.AccessControlSections]::Access)
        if ($null -ne $deny) {
            $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
            $rule = [Security.AccessControl.RegistryAccessRule]::new($sid, $deny, [Security.AccessControl.InheritanceFlags]::None, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Deny)
            $acl.AddAccessRule($rule)
        }
        $key.SetAccessControl($acl)
    } finally { $key.Dispose() }
}
function Read-FixtureAcl {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($protected, $false)
    try { return $key.GetAccessControl().GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access) } finally { $key.Dispose() }
}
$originalAcl = $null
try {
    Write-FixtureValues 1 '400'
    $originalAcl = Read-FixtureAcl
    $before = Read-FixtureValues
    Set-FixtureAcl $originalAcl ([Security.AccessControl.RegistryRights]::CreateSubKey)
    $limitedAcl = Read-FixtureAcl
    $legacyDenied = $false
    try { $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($protected); $key.Dispose() }
    catch { $legacyDenied = $true }
    if (-not $legacyDenied) { throw 'The fixture did not reproduce CreateSubKey access denied.' }
    $result = Invoke-Fixture @{ action = 'apply'; ids = @('edge-background', 'edge-startup-boost', 'menu-delay') }
    if ($result.blocked -or @($result.applied).Count -ne 3) { throw 'Writable values were incorrectly blocked by missing key-creation rights.' }
    if ((Read-FixtureValues) -notmatch '100' -or (Read-FixtureValues) -match '400') { throw 'The accessible control setting was not applied.' }
    $null = Invoke-Fixture @{ action = 'restore'; id = $result.backupId }
    if ((Read-FixtureValues) -ne $before) { throw 'Limited-rights backup restoration changed original values or types.' }
    if ((Read-FixtureAcl) -ne $limitedAcl) { throw 'The app changed registry permissions.' }
    Write-Output 'PASS: reproduced CreateSubKey denial; minimum-rights apply and exact restore succeed without changing ACLs.'

    foreach ($action in @('apply', 'disable', 'defaults')) {
        Set-FixtureAcl $originalAcl
        if ($action -eq 'disable') { Write-FixtureValues 0 '100' } else { Write-FixtureValues 1 '400' }
        $before = Read-FixtureValues
        Set-FixtureAcl $originalAcl ([Security.AccessControl.RegistryRights]::SetValue)
        $limitedAcl = Read-FixtureAcl
        $result = Invoke-Fixture @{ action = $action; ids = @('edge-background', 'edge-startup-boost', 'menu-delay') }
        if (@($result.blocked).Count -ne 2 -or @($result.applied).Count -ne 0 -or $result.backupId) { throw "Blocked $action did not return the two affected IDs without applying." }
        if ((($result.blocked.id | Sort-Object) -join ',') -ne 'edge-background,edge-startup-boost') { throw 'The blocked IDs are incorrect.' }
        if ((Read-FixtureValues) -ne $before -or @(Invoke-Fixture @{ action = 'list' }).Count -ne 0) { throw 'A blocked plan changed values or left an active backup.' }
        if ((Read-FixtureAcl) -ne $limitedAcl) { throw 'The blocked transaction changed registry permissions.' }
        # The user removes blocked entries and explicitly submits the smaller plan.
        $rest = Invoke-Fixture @{ action = $action; ids = @('menu-delay') }
        if (@($rest.applied).Count -ne 1 -or (Read-FixtureValues) -eq $before) { throw 'The remaining accessible preference could not be used.' }
        $null = Invoke-Fixture @{ action = 'restore'; id = $rest.backupId }
        if ((Read-FixtureValues) -ne $before) { throw 'The remaining preference could not be restored.' }
    }
    Write-Output 'PASS: protected values block apply/disable/defaults before writes; removing them enables the remaining plan and exact restore.'

    Set-FixtureAcl $originalAcl
    Write-FixtureValues 1 '400'
    $before = Read-FixtureValues
    foreach ($entry in $manifest) { if ($entry.id -like 'edge-*') { foreach ($spec in $entry.registry) { $spec.path = $protected + '\Missing' } } }
    [IO.File]::WriteAllText($manifestFile, ($manifest | ConvertTo-Json -Depth 8))
    Set-FixtureAcl $originalAcl ([Security.AccessControl.RegistryRights]::CreateSubKey)
    $result = Invoke-Fixture @{ action = 'apply'; ids = @('edge-background', 'edge-startup-boost', 'menu-delay') }
    if (@($result.blocked).Count -ne 2 -or (Read-FixtureValues) -ne $before) { throw 'Missing child key under a protected parent was not detected before writes.' }
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(($protected + '\Missing'), $false)
    if ($null -ne $key) { $key.Dispose(); throw 'The permission probe created a key.' }
    Write-Output 'PASS: preflight checks missing-key parent access without creating a key.'

    Set-FixtureAcl $originalAcl
    foreach ($entry in $manifest) { if ($entry.id -like 'edge-*') { foreach ($spec in $entry.registry) { $spec.path = $protected } } }
    [IO.File]::WriteAllText($manifestFile, ($manifest | ConvertTo-Json -Depth 8))
    # Inject a deterministic permission change only into this disposable copy,
    # after preflight/backup and after one tracked preference has been written.
    $hook = @'
    if ($specification.path -eq '__PROTECTED__' -and -not $script:denialInjected) {
        $script:denialInjected = $true
        $testControl = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('__DESKTOP__', $true)
        try { $testControl.SetValue('MenuShowDelay', '777', [Microsoft.Win32.RegistryValueKind]::String) } finally { $testControl.Dispose() }
        $testKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('__PROTECTED__', $true)
        try {
            $acl = $testKey.GetAccessControl()
            $acl.AddAccessRule([Security.AccessControl.RegistryAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.AccessControl.RegistryRights]::SetValue, [Security.AccessControl.AccessControlType]::Deny))
            $testKey.SetAccessControl($acl)
        } finally { $testKey.Dispose() }
    }
'@
    $hook = $hook.Replace('__PROTECTED__', $protected).Replace('__DESKTOP__', $desktop)
    $signature = 'function Write-Preference($specification) {'
    [IO.File]::WriteAllText($scriptFile, $source.Replace($signature, ($signature + "`n" + $hook)))
    $result = Invoke-Fixture @{ action = 'apply'; ids = @('edge-background', 'edge-startup-boost', 'menu-delay') }
    if (@($result.blocked).Count -ne 2 -or $result.message -notmatch 'rolled back') { throw 'A late access denial did not report a rolled-back blocked plan.' }
    if ((Read-FixtureValues) -ne $before) { throw 'A partial write survived the rollback.' }
    if (@(Invoke-Fixture @{ action = 'list' }).Count -ne 0) { throw 'The successful rollback left an active backup.' }
    Write-Output 'PASS: a real permission change after preflight restores the partial write and reports blocked tweaks only after rollback.'
} finally {
    [IO.File]::WriteAllText($scriptFile, $source)
    if ($originalAcl) { Set-FixtureAcl $originalAcl }
    foreach ($backup in @(Invoke-Fixture @{ action = 'list' })) { $null = Invoke-Fixture @{ action = 'restore'; id = $backup.id } }
    [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($root, $false)
    Remove-Item -LiteralPath $folder -Recurse -Force
}
