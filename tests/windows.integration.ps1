#requires -Version 5.1
param([switch]$AllowLocalSettingChanges)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This integration test requires Windows.' }
if (-not $AllowLocalSettingChanges -and -not ($env:GITHUB_ACTIONS -eq 'true' -and $env:RUNNER_OS -eq 'Windows')) {
    throw 'Run on an isolated Windows CI runner, or use -AllowLocalSettingChanges on a test account. This temporarily changes and restores transparency and menu delay.'
}
$backupDirectory = Join-Path ([IO.Path]::GetTempPath()) ('TweakerzzzIntegration-' + [Guid]::NewGuid().ToString('N'))
function Invoke-TestNative($payload) {
    $payload.backupDirectory = $backupDirectory
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 5 -Compress)))
    $raw = & node (Join-Path $PSScriptRoot 'windows.invoke.cjs') $encoded
    $code = $LASTEXITCODE
    $result = ($raw -join "`n") | ConvertFrom-Json
    if ($code -ne 0 -or -not $result.ok) { throw ('Native integration operation failed: ' + $result.error) }
    return $result.data
}
function Read-TestValue($path, $name) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($path, $false)
    if ($null -eq $key) { return [ordered]@{ existed = $false } }
    try {
        if ($key.GetValueNames() -notcontains $name) { return [ordered]@{ existed = $false } }
        return [ordered]@{ existed = $true; kind = $key.GetValueKind($name).ToString(); value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
    } finally { $key.Dispose() }
}
$targets = @(
    @{ path = 'Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'; name = 'EnableTransparency'; expected = 0 },
    @{ path = 'Control Panel\Desktop'; name = 'MenuShowDelay'; expected = '100' }
)
$before = @($targets | ForEach-Object { Read-TestValue $_.path $_.name | ConvertTo-Json -Compress })
try {
    $result = Invoke-TestNative @{ action = 'apply'; ids = @('transparency', 'menu-delay') }
    if ((@($result.applied).Count + @($result.skipped).Count) -ne 2) { throw 'The native transaction did not account for both selected preferences.' }
    foreach ($target in $targets) {
        $actual = Read-TestValue $target.path $target.name
        if (-not $actual.existed -or $actual.value -ne $target.expected) { throw ('A preference was not written: ' + $target.name) }
    }
    $history = @(Invoke-TestNative @{ action = 'list' })
    if (@($result.applied).Count -gt 0) {
        if ($history.Count -ne 1 -or $history[0].id -ne $result.backupId) { throw 'The saved backup is missing from history.' }
    } elseif ($history.Count -ne 0 -or $null -ne $result.backupId) { throw 'Already configured preferences created an unnecessary backup.' }
    $statusRaw = & node -e "require('./electron/tweak-status.cjs').getTweakStatus().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1})"
    if ($LASTEXITCODE -ne 0) { throw 'The read-only status reader failed.' }
    $status = ($statusRaw -join "`n") | ConvertFrom-Json
    foreach ($id in @('transparency', 'menu-delay')) {
        $state = @($status.tweaks | Where-Object { $_.id -eq $id })
        if ($state.Count -ne 1 -or $state[0].status -ne 'enabled') { throw ('An applied preference was not detected: ' + $id) }
    }
    $again = Invoke-TestNative @{ action = 'apply'; ids = @('transparency', 'menu-delay') }
    if (@($again.applied).Count -ne 0 -or @($again.skipped).Count -ne 2 -or $null -ne $again.backupId) { throw 'Repeated application did not skip already configured settings.' }
    if ($result.backupId) { $null = Invoke-TestNative @{ action = 'restore'; id = $result.backupId } }
    for ($index = 0; $index -lt $targets.Count; $index++) {
        $actual = Read-TestValue $targets[$index].path $targets[$index].name | ConvertTo-Json -Compress
        if ($actual -ne $before[$index]) { throw ('Original preference was not restored: ' + $targets[$index].name) }
    }
    if (@(Invoke-TestNative @{ action = 'list' }).Count -ne 0) { throw 'Restored backup still appears as active.' }
    # Preserve externally configured values before disable/default operations,
    # including an unusual original registry type and value.
    $snapshot = Invoke-TestNative @{ action = 'snapshot'; ids = @('transparency', 'menu-delay') }
    if (-not $snapshot.backupId) { throw 'A manual snapshot was not created.' }
    for ($index = 0; $index -lt $targets.Count; $index++) {
        $actual = Read-TestValue $targets[$index].path $targets[$index].name | ConvertTo-Json -Compress
        if ($actual -ne $before[$index]) { throw 'Creating a snapshot modified a preference.' }
    }
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($targets[0].path)
    try { $key.SetValue($targets[0].name, 0, [Microsoft.Win32.RegistryValueKind]::DWord) } finally { $key.Dispose() }
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($targets[1].path)
    try { $key.SetValue($targets[1].name, 275, [Microsoft.Win32.RegistryValueKind]::DWord) } finally { $key.Dispose() }
    $disabled = Invoke-TestNative @{ action = 'disable'; ids = @('transparency', 'menu-delay') }
    if ((Read-TestValue $targets[0].path $targets[0].name).value -ne 1) { throw 'An externally enabled tweak was not disabled.' }
    if ((Read-TestValue $targets[1].path $targets[1].name).value -ne '400') { throw 'Menu delay disable target is incorrect.' }
    $null = Invoke-TestNative @{ action = 'restore'; id = $disabled.backupId }
    $custom = Read-TestValue $targets[1].path $targets[1].name
    if ($custom.kind -ne 'DWord' -or $custom.value -ne 275) { throw 'Disable rollback did not preserve the custom value and kind.' }
    $defaults = Invoke-TestNative @{ action = 'defaults'; ids = @('transparency', 'menu-delay') }
    foreach ($target in $targets) { if ((Read-TestValue $target.path $target.name).existed) { throw 'Windows defaults did not remove a supported override.' } }
    $again = Invoke-TestNative @{ action = 'defaults'; ids = @('transparency', 'menu-delay') }
    if ($again.backupId) { throw 'Unchanged Windows defaults should be a no-op.' }
    $null = Invoke-TestNative @{ action = 'restore'; id = $defaults.backupId }
    $custom = Read-TestValue $targets[1].path $targets[1].name
    if ($custom.kind -ne 'DWord' -or $custom.value -ne 275) { throw 'Defaults rollback lost the custom original preference.' }
    $null = Invoke-TestNative @{ action = 'restore'; id = $snapshot.backupId }
    for ($index = 0; $index -lt $targets.Count; $index++) {
        $actual = Read-TestValue $targets[$index].path $targets[$index].name | ConvertTo-Json -Compress
        if ($actual -ne $before[$index]) { throw ('Snapshot did not restore the initial state: ' + $targets[$index].name) }
    }
    Write-Output 'PASS: manual snapshots, externally enabled tweak disable, defaults reset, no-op defaults, and exact value/type restoration.'
    Write-Output ('PASS: Windows detection, no-op handling, exact restoration, and history lifecycle; wrote ' + @($result.applied).Count + ' preferences, skipped ' + @($result.skipped).Count + ' already configured preferences.')
} finally {
    # If an assertion fails after application, unwind every pending test backup.
    if (Test-Path -LiteralPath $backupDirectory) {
        $remaining = @(Invoke-TestNative @{ action = 'list' })
        foreach ($backup in $remaining) { $null = Invoke-TestNative @{ action = 'restore'; id = $backup.id } }
        # Only our unique temporary backup directory is removed, after restore.
        Remove-Item -LiteralPath $backupDirectory -Recurse -Force
    }
}
