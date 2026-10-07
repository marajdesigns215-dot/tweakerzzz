#requires -Version 5.1
# All automatic changes are per-user preferences, except switching to an
# existing Windows power scheme. No services, security, updates, boot flags,
# driver profiles, overclocks, or undocumented timer settings are changed.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Preference($path, $name, $kind, $value) {
    return [ordered]@{ path = $path; name = $name; kind = $kind; value = $value }
}

$manifest = @{}
foreach ($entry in @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tweaks.json') -Raw | ConvertFrom-Json)) {
    $manifest[$entry.id] = @($entry.registry)
}
$allowedValues = @{}
foreach ($id in $manifest.Keys) {
    foreach ($value in $manifest[$id]) { $allowedValues[$value.path + '|' + $value.name] = $true }
}

function Read-Preference($specification) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($specification.path, $false)
    $record = [ordered]@{ path = $specification.path; name = $specification.name; keyExisted = ($null -ne $key); existed = $false; kind = $null; value = $null }
    if ($null -eq $key) { return $record }
    try {
        if ($key.GetValueNames() -contains $specification.name) {
            $record.existed = $true
            $record.kind = $key.GetValueKind($specification.name).ToString()
            $value = $key.GetValue($specification.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            switch ($record.kind) {
                'Binary' { $record.value = [Convert]::ToBase64String([byte[]]$value) }
                'None' { $record.value = [Convert]::ToBase64String([byte[]]$value) }
                'DWord' { $record.value = ([int]$value).ToString([Globalization.CultureInfo]::InvariantCulture) }
                'QWord' { $record.value = ([long]$value).ToString([Globalization.CultureInfo]::InvariantCulture) }
                'MultiString' { $record.value = @([string[]]$value) }
                default { $record.value = [string]$value }
            }
        }
    } finally { $key.Dispose() }
    return $record
}

function Convert-RegistryValue($specification) {
    $kind = [Enum]::Parse([Microsoft.Win32.RegistryValueKind], [string]$specification.kind)
    $value = switch ($specification.kind) {
        'DWord' { [int]::Parse([string]$specification.value, [Globalization.CultureInfo]::InvariantCulture) }
        'QWord' { [long]::Parse([string]$specification.value, [Globalization.CultureInfo]::InvariantCulture) }
        'Binary' { ,([Convert]::FromBase64String($specification.value)) }
        'None' { ,([Convert]::FromBase64String($specification.value)) }
        'MultiString' {
            if ($specification.value -isnot [array] -or @($specification.value | Where-Object { $_ -isnot [string] }).Count -gt 0) { throw 'Invalid multi-string registry value.' }
            ,([string[]]$specification.value)
        }
        'String' { if ($specification.value -isnot [string]) { throw 'Invalid string registry value.' }; [string]$specification.value }
        'ExpandString' { if ($specification.value -isnot [string]) { throw 'Invalid expandable registry value.' }; [string]$specification.value }
        default { throw 'Unsupported registry value kind in backup.' }
    }
    return @{ kind = $kind; value = $value }
}

function Write-Preference($specification) {
    $converted = Convert-RegistryValue $specification
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($specification.path)
    try { $key.SetValue($specification.name, $converted.value, $converted.kind) }
    finally { $key.Dispose() }
}

function Invoke-Power($arguments) {
    $output = @(& "$env:SystemRoot\System32\powercfg.exe" @arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { throw ('Windows could not change or read the power plan: ' + ($output -join ' ')) }
    return $output -join "`n"
}

function Save-Backup($backup, $file) {
    $temporary = $file + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    $encoding = New-Object System.Text.UTF8Encoding($false)
    try {
        [IO.File]::WriteAllText($temporary, ($backup | ConvertTo-Json -Depth 12), $encoding)
        if ([IO.File]::Exists($file)) { [IO.File]::Replace($temporary, $file, $null) }
        else { [IO.File]::Move($temporary, $file) }
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
    }
}

function Get-TweakStatus($id) {
    try {
        if ($id -eq 'power-plan') {
            $active = Invoke-Power @('/getactivescheme')
            if ($active -notmatch '[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}') { throw 'Windows did not report the active power plan.' }
            if ($Matches[0] -eq '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c') {
                return @{ id = $id; status = 'enabled'; message = 'High performance is the active Windows power plan.' }
            }
            return @{ id = $id; status = 'not-enabled'; message = 'A different Windows power plan is active.' }
        }
        $missing = $false
        $different = $false
        foreach ($specification in $manifest[$id]) {
            $current = Read-Preference $specification
            if (-not $current.existed) { $missing = $true; continue }
            if ($current.kind -ne $specification.kind -or [string]$current.value -cne [string]$specification.value) { $different = $true }
        }
        if ($different) { return @{ id = $id; status = 'not-enabled'; message = 'One or more saved Windows values differ from this tweak.' } }
        if ($missing) { return @{ id = $id; status = 'not-configured'; message = 'One or more registry preferences are unset. The effective Windows default is not inferred.' } }
        return @{ id = $id; status = 'enabled'; message = 'All saved Windows values match this tweak. A sign-out, restart, or organizational policy can still affect its behavior.' }
    } catch {
        return @{ id = $id; status = 'unknown'; message = ('Windows could not read this setting: ' + $_.Exception.Message) }
    }
}

function Restore-State($backup) {
    $failures = @()
    # Validate the entire backup before performing any writes.
    if ($backup.version -ne 1) { throw 'Unsupported backup version.' }
    $seen = @{}
    foreach ($record in @($backup.registry)) {
        if ($record.path -isnot [string] -or $record.name -isnot [string] -or $record.existed -isnot [bool] -or $record.keyExisted -isnot [bool]) { throw 'Invalid registry backup record.' }
        if (-not $allowedValues.ContainsKey($record.path + '|' + $record.name)) { throw 'Backup contains a registry preference outside the supported allowlist.' }
        if ($seen.ContainsKey($record.path + '|' + $record.name)) { throw 'Duplicate registry preference in backup.' }
        $seen[$record.path + '|' + $record.name] = $true
        if ($record.existed -and $record.kind -notin @('DWord', 'QWord', 'Binary', 'None', 'String', 'ExpandString', 'MultiString')) { throw 'Backup contains an unsupported registry value kind.' }
        if ($record.existed) { $null = Convert-RegistryValue $record }
    }
    if ($backup.powerScheme -and $backup.powerScheme -notmatch '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$') { throw 'Invalid power scheme in backup.' }
    foreach ($keyPath in @($backup.createdKeys)) {
        $related = $false
        foreach ($record in @($backup.registry)) {
            if ($record.path -eq $keyPath -or $record.path.StartsWith($keyPath + '\', [StringComparison]::OrdinalIgnoreCase)) { $related = $true; break }
        }
        if (-not $related -or $keyPath -notmatch '^Software\\|^System\\|^Control Panel\\') { throw 'Backup contains an unsupported registry key.' }
    }
    $records = @($backup.registry)
    [Array]::Reverse($records)
    foreach ($record in $records) {
        try {
            if ($record.existed) { Write-Preference $record }
            else {
                $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($record.path, $true)
                if ($null -ne $key) {
                    try { $key.DeleteValue($record.name, $false) } finally { $key.Dispose() }
                }
            }
        } catch { $failures += $_.Exception.Message }
    }
    # Remove only keys this transaction created, and only if still empty.
    foreach ($keyPath in @($backup.createdKeys | Sort-Object -Property Length -Descending)) {
        try {
            $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($keyPath, $false)
            if ($null -ne $key) {
                try { $empty = $key.SubKeyCount -eq 0 -and $key.ValueCount -eq 0 } finally { $key.Dispose() }
                if ($empty) { [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKey($keyPath, $false) }
            }
        } catch { $failures += $_.Exception.Message }
    }
    if ($backup.powerScheme) {
        try { $null = Invoke-Power @('/setactive', $backup.powerScheme) }
        catch { $failures += $_.Exception.Message }
    }
    if ($failures.Count -gt 0) { throw ($failures -join '; ') }
}

$mutex = $null
$ownsMutex = $false
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    # The status operation performs only reads. It must not create a backup
    # directory or infer activation from old backups or renderer preferences.
    if ($request.action -eq 'status') {
        $states = @($manifest.Keys | Sort-Object | ForEach-Object { Get-TweakStatus $_ })
        $report = @{ checkedAt = [DateTime]::UtcNow.ToString('o'); tweaks = $states }
        [Console]::Out.WriteLine((@{ ok = $true; data = $report } | ConvertTo-Json -Depth 6 -Compress))
        return
    }
    if (-not $request.backupDirectory -or -not [IO.Path]::IsPathRooted($request.backupDirectory)) { throw 'A local backup directory is required.' }
    $backupDirectory = [IO.Path]::GetFullPath($request.backupDirectory)
    $null = [IO.Directory]::CreateDirectory($backupDirectory)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $mutex = [Threading.Mutex]::new($false, ('Local\TweakerzzzPreferences-' + $sid))
    try { $ownsMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { throw 'Another Windows preference operation is running. Please wait and retry.' }
    $history = @()
    foreach ($historyFile in @(Get-ChildItem -LiteralPath $backupDirectory -Filter '*.json' -File)) {
        if ($historyFile.BaseName -notmatch '^[a-f0-9]{32}$') { continue }
        try {
            $item = [IO.File]::ReadAllText($historyFile.FullName) | ConvertFrom-Json
            if ($item.version -eq 1 -and $item.id -eq $historyFile.BaseName -and $item.status -in @('pending', 'applied', 'rollback-failed')) { $history += $item }
        } catch { continue }
    }
    $history = @($history | Sort-Object -Property createdAt -Descending)
    switch ($request.action) {
        'list' {
            $items = @()
            foreach ($backup in $history) {
                $items += [ordered]@{ id = $backup.id; createdAt = $backup.createdAt; count = @($backup.ids).Count }
            }
            $data = @($items)
        }
        'apply' {
            if (@($history | Where-Object { $_.status -in @('pending', 'rollback-failed') }).Count -gt 0) { throw 'An earlier change did not finish. Restore the newest backup before applying more preferences.' }
            $ids = @($request.ids)
            if ($ids.Count -lt 1 -or $ids.Count -gt $manifest.Count) { throw 'Invalid optimization selection.' }
            if (@($ids | Select-Object -Unique).Count -ne $ids.Count) { throw 'Duplicate optimization IDs are not allowed.' }
            foreach ($id in $ids) { if ($id -isnot [string] -or -not $manifest.ContainsKey($id)) { throw 'Unsupported optimization ID.' } }
            # Recheck immediately before writing, including changes made by
            # Windows or another tool since the renderer last checked.
            $skipped = @($ids | Where-Object { (Get-TweakStatus $_).status -eq 'enabled' })
            $ids = @($ids | Where-Object { $_ -notin $skipped })
            if ($ids.Count -eq 0) {
                $data = @{ backupId = $null; applied = @(); skipped = $skipped; message = 'All selected tweaks already match your saved Windows settings. No changes or backup were needed.' }
                break
            }
            $specifications = @{}
            foreach ($id in $ids) {
                if ($id -isnot [string] -or -not $manifest.ContainsKey($id)) { throw 'Unsupported optimization ID.' }
                foreach ($specification in $manifest[$id]) { $specifications[$specification.path + '|' + $specification.name] = $specification }
            }
            $originalPower = $null
            if ($ids -contains 'power-plan') {
                $active = Invoke-Power @('/getactivescheme')
                if ($active -notmatch '[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}') { throw 'Could not identify the active Windows power scheme.' }
                $originalPower = $Matches[0]
                $available = Invoke-Power @('/list')
                if ($available -notmatch '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c') { throw 'The High performance plan is not available on this PC. Use Windows Power settings instead.' }
            }
            $records = @()
            $createdKeys = @{}
            foreach ($specification in $specifications.Values) {
                $records += Read-Preference $specification
                $parts = $specification.path -split '\\'
                for ($index = 1; $index -lt $parts.Count; $index++) {
                    $keyPath = $parts[0..$index] -join '\'
                    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($keyPath, $false)
                    if ($null -eq $key) { $createdKeys[$keyPath] = $true } else { $key.Dispose() }
                }
            }
            $backup = [ordered]@{ version = 1; id = [Guid]::NewGuid().ToString('N'); createdAt = [DateTime]::UtcNow.ToString('o'); ids = @($ids); status = 'pending'; registry = @($records); createdKeys = @($createdKeys.Keys); powerScheme = $originalPower }
            $file = Join-Path $backupDirectory ($backup.id + '.json')
            Save-Backup $backup $file
            try {
                foreach ($specification in $specifications.Values) { Write-Preference $specification }
                if ($ids -contains 'power-plan') { $null = Invoke-Power @('/setactive', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c') }
                $backup.status = 'applied'
                Save-Backup $backup $file
            } catch {
                $applyFailure = $_.Exception.Message
                try {
                    Restore-State $backup
                    $backup.status = 'rolled-back'
                    Save-Backup $backup $file
                } catch {
                    $backup.status = 'rollback-failed'
                    try { Save-Backup $backup $file } catch { }
                    throw ('The change failed and rollback needs attention. Restore backup ' + $backup.id + '. Original error: ' + $applyFailure)
                }
                throw ('No changes were kept. The transaction was rolled back: ' + $applyFailure)
            }
            $data = [ordered]@{ backupId = $backup.id; applied = @($ids); skipped = $skipped; message = ('Saved ' + $ids.Count + ' changes with a reversible backup; skipped ' + $skipped.Count + ' already configured settings. Sign out and back in for all Windows preferences to take effect. Some preferences depend on your Windows build or organizational policy.') }
        }
        'restore' {
            if ($request.id -isnot [string] -or $request.id -notmatch '^[a-f0-9]{32}$') { throw 'Invalid backup ID.' }
            if ($history.Count -eq 0 -or $history[0].id -ne $request.id) { throw 'Restore the newest remaining backup first to preserve the order of your changes.' }
            $file = Join-Path $backupDirectory ($request.id + '.json')
            if (-not [IO.File]::Exists($file)) { throw 'Backup not found.' }
            $backup = [IO.File]::ReadAllText($file) | ConvertFrom-Json
            if ($backup.id -ne $request.id) { throw 'Backup ID does not match its file.' }
            if ($backup.status -in @('restored', 'rolled-back')) { throw 'This backup has already been restored.' }
            Restore-State $backup
            $backup.status = 'restored'
            Save-Backup $backup $file
            $data = @{ message = 'Original preferences and power scheme restored. Sign out and back in for all changes to take effect.' }
        }
        default { throw 'Unsupported optimization operation.' }
    }
    [Console]::Out.WriteLine((@{ ok = $true; data = $data } | ConvertTo-Json -Depth 8 -Compress))
} catch {
    [Console]::Out.WriteLine((@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
    exit 1
} finally {
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    if ($null -ne $mutex) { $mutex.Dispose() }
}
