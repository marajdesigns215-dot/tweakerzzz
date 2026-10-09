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
# Windows PowerShell 5.1 emits a top-level JSON array as one pipeline object.
# Assign it first so foreach enumerates the entries instead of nesting it in @().
$entries = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tweaks.json') -Raw | ConvertFrom-Json
foreach ($entry in $entries) {
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
    # Existing keys only need SetValue. CreateSubKey requests broader access,
    # which can fail on protected policy keys even when values are writable.
    $key = Open-PreferenceWriter $specification.path
    if ($null -eq $key) { $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($specification.path) }
    try { $key.SetValue($specification.name, $converted.value, $converted.kind) }
    finally { $key.Dispose() }
}

function Open-PreferenceWriter($path) {
    # ReadWriteSubTree marks the .NET handle writable; the explicit rights
    # argument still limits the Windows handle to SetValue only.
    return [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($path, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, [Security.AccessControl.RegistryRights]::SetValue)
}

function Assert-PreferenceWritable($specification) {
    # Opening a handle checks access without creating a key or writing a value.
    $key = Open-PreferenceWriter $specification.path
    if ($null -ne $key) { $key.Dispose(); return }
    if ($specification.remove) { return }
    $parent = [string]$specification.path
    while ($parent.Contains('\')) {
        $parent = $parent.Substring(0, $parent.LastIndexOf('\'))
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($parent, [Microsoft.Win32.RegistryKeyPermissionCheck]::Default, [Security.AccessControl.RegistryRights]::CreateSubKey)
        if ($null -ne $key) { $key.Dispose(); return }
    }
    throw ('Windows could not verify access to HKCU\' + $specification.path + '. Leave this tweak out of the plan.')
}

function Test-AccessFailure($exception) {
    while ($null -ne $exception) {
        if ($exception -is [UnauthorizedAccessException] -or $exception -is [Security.SecurityException]) { return $true }
        $exception = $exception.InnerException
    }
    return $false
}

function Test-OriginalPreference($record) {
    $current = Read-Preference $record
    if ($current.existed -ne $record.existed) { return $false }
    if (-not $record.existed) { return $true }
    if ($current.kind -ne $record.kind) { return $false }
    return (ConvertTo-Json -InputObject $current.value -Depth 5 -Compress) -ceq (ConvertTo-Json -InputObject $record.value -Depth 5 -Compress)
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
        # Windows PowerShell 5.1 otherwise binds $null to an empty string for
        # this string parameter, which File.Replace rejects as a backup path.
        if ([IO.File]::Exists($file)) { [IO.File]::Replace($temporary, $file, [NullString]::Value) }
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
            # A denied write may leave a protected value untouched. Do not
            # request write access again when its original state already matches.
            if (Test-OriginalPreference $record) { continue }
            if ($record.existed) { Write-Preference $record }
            else {
                $key = Open-PreferenceWriter $record.path
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
                $items += [ordered]@{ id = $backup.id; createdAt = $backup.createdAt; count = @($backup.ids).Count; action = $backup.action; ids = @($backup.ids) }
            }
            $data = @($items)
        }
        { $_ -in @('apply', 'disable', 'defaults', 'snapshot') } {
            $operation = [string]$request.action
            if (@($history | Where-Object { $_.status -in @('pending', 'rollback-failed') }).Count -gt 0) { throw 'An earlier change did not finish. Restore the newest backup before applying more preferences.' }
            $ids = @($request.ids)
            if ($ids.Count -lt 1 -or $ids.Count -gt $manifest.Count) { throw 'Invalid optimization selection.' }
            if (@($ids | Select-Object -Unique).Count -ne $ids.Count) { throw 'Duplicate optimization IDs are not allowed.' }
            foreach ($id in $ids) { if ($id -isnot [string] -or -not $manifest.ContainsKey($id)) { throw 'Unsupported optimization ID.' } }
            $targetPower = if ($operation -eq 'apply') { '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' } else { '381b4222-f694-41f0-9685-ff5bb260df2e' }
            $skipped = @()
            $blocked = @()
            $specifications = @{}
            foreach ($id in $ids) {
                $desired = @()
                foreach ($original in $manifest[$id]) {
                    $remove = $operation -eq 'defaults' -or ($operation -eq 'disable' -and $null -eq $original.disabledValue)
                    $value = if ($operation -eq 'disable') { $original.disabledValue } else { $original.value }
                    $desired += [ordered]@{ id = $id; path = $original.path; name = $original.name; kind = $original.kind; value = $value; remove = $remove }
                }
                try {
                    $desiredMatches = $operation -ne 'snapshot'
                    if ($id -eq 'power-plan' -and $desiredMatches) {
                        $active = Invoke-Power @('/getactivescheme')
                        $desiredMatches = $active -match $targetPower
                    } else {
                        foreach ($specification in $desired) {
                            $current = Read-Preference $specification
                            if ($specification.remove) { if ($current.existed) { $desiredMatches = $false } }
                            elseif (-not $current.existed -or $current.kind -ne $specification.kind -or [string]$current.value -cne [string]$specification.value) { $desiredMatches = $false }
                        }
                    }
                    if ($desiredMatches) { $skipped += $id; continue }
                    if ($operation -ne 'snapshot') {
                        foreach ($specification in $desired) { Assert-PreferenceWritable $specification }
                    }
                } catch {
                    if ($operation -eq 'snapshot') { throw }
                    $blocked += @{ id = $id; message = ('Windows could not access this preference for the selected action: ' + $_.Exception.Message) }
                    continue
                }
                foreach ($specification in $desired) { $specifications[$specification.path + '|' + $specification.name] = $specification }
            }
            if ($blocked.Count -gt 0) {
                $data = @{ backupId = $null; applied = @(); skipped = $skipped; blocked = @($blocked); message = 'No changes were made. Remove the blocked tweaks, review the remaining plan, then apply again. Registry permissions were not changed.' }
                break
            }
            $ids = @($ids | Where-Object { $_ -notin $skipped })
            if ($ids.Count -eq 0) {
                $data = @{ backupId = $null; applied = @(); skipped = $skipped; message = 'The selected preferences already match this action. No changes or backup were needed.' }
                break
            }
            $originalPower = $null
            if ($ids -contains 'power-plan') {
                $active = Invoke-Power @('/getactivescheme')
                if ($active -notmatch '[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}') { throw 'Could not identify the active Windows power scheme.' }
                $originalPower = $Matches[0]
                if ($operation -ne 'snapshot') {
                    $available = Invoke-Power @('/list')
                    if ($available -notmatch $targetPower) { throw 'The requested power plan is not available. Leave Power plan unselected and use Windows Power settings.' }
                }
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
            $backup = [ordered]@{ version = 1; id = [Guid]::NewGuid().ToString('N'); createdAt = [DateTime]::UtcNow.ToString('o'); ids = @($ids); action = $operation; status = 'pending'; registry = @($records); createdKeys = @($createdKeys.Keys); powerScheme = $originalPower }
            if ($operation -eq 'snapshot') { $backup.createdKeys = @() }
            $file = Join-Path $backupDirectory ($backup.id + '.json')
            Save-Backup $backup $file
            $writing = $null
            try {
                if ($operation -ne 'snapshot') {
                    foreach ($specification in $specifications.Values) {
                        $writing = $specification
                        if ($specification.remove) {
                            $key = Open-PreferenceWriter $specification.path
                            if ($null -ne $key) { try { $key.DeleteValue($specification.name, $false) } finally { $key.Dispose() } }
                        } else { Write-Preference $specification }
                    }
                    $writing = $null
                    if ($ids -contains 'power-plan') { $null = Invoke-Power @('/setactive', $targetPower) }
                }
                $backup.status = 'applied'
                Save-Backup $backup $file
            } catch {
                $applyException = $_.Exception
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
                # Permissions or a protection provider can change after preflight.
                # Offer a smaller plan only after the entire transaction rolls back.
                if ($null -ne $writing -and (Test-AccessFailure $applyException)) {
                    $blocked = @()
                    foreach ($id in $ids) {
                        if (@($manifest[$id] | Where-Object { $_.path -eq $writing.path }).Count -gt 0) {
                            $blocked += @{ id = $id; message = ('Windows denied the registry write at HKCU\' + $writing.path + ': ' + $applyFailure) }
                        }
                    }
                    $data = @{ backupId = $null; applied = @(); skipped = $skipped; blocked = @($blocked); message = 'No changes were kept. The transaction was rolled back. Remove the blocked tweaks and review the remaining plan before applying again.' }
                    break
                }
                throw ('No changes were kept. The transaction was rolled back: ' + $applyFailure)
            }
            $message = switch ($operation) {
                'snapshot' { 'Saved a snapshot of the selected supported settings. No Windows settings were changed. This is not a Windows System Restore point.' }
                'defaults' { 'Removed selected registry overrides and used Balanced for the power plan if selected. Windows or organization policy supplies the defaults; this is not an OEM factory reset.' }
                'disable' { 'Turned off the selected tweaks, including preferences configured outside Tweakerzzz. Your previous values were backed up.' }
                default { 'Saved the selected changes with a reversible backup.' }
            }
            if ($operation -ne 'snapshot') { $message += ' Sign out and back in for all preferences to take effect. Windows build and organization policy can affect behavior.' }
            $data = [ordered]@{ backupId = $backup.id; applied = @($ids); skipped = $skipped; message = $message }

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
