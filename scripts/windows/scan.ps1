#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try {
    $null = [Console]::In.ReadToEnd()
    $cpus = @(Get-CimInstance Win32_Processor)
    $memory = @(Get-CimInstance Win32_PhysicalMemory)
    $system = Get-CimInstance Win32_ComputerSystem
    $os = Get-CimInstance Win32_OperatingSystem
    $disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3')
    $gpus = @(Get-CimInstance Win32_VideoController)
    $gpu = $gpus | Where-Object { $_.PNPDeviceID -match 'VEN_10DE|VEN_1002' } | Select-Object -First 1
    if (-not $gpu) { $gpu = $gpus | Select-Object -First 1 }
    # AdapterRAM is a 32-bit WMI field and cannot accurately report modern
    # NVIDIA VRAM. Use the signed driver utility when available; otherwise
    # report unknown, rather than presenting a truncated value as measured.
    $vram = $null
    if ($gpu -and $gpu.Name -match 'NVIDIA') {
        $smi = Get-Command 'nvidia-smi.exe' -ErrorAction SilentlyContinue
        if ($smi) {
            $gpuMemory = @(& $smi.Source '--query-gpu=name,memory.total' '--format=csv,noheader,nounits' 2>$null)
            if ($LASTEXITCODE -eq 0) {
                foreach ($line in $gpuMemory) {
                    $parts = $line -split ','
                    if ($parts.Count -eq 2 -and $parts[0].Trim() -eq $gpu.Name) {
                        $megabytes = 0.0
                        if ([double]::TryParse($parts[1].Trim(), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$megabytes)) {
                            $vram = [Math]::Round($megabytes / 1024, 1)
                        }
                    }
                }
            }
        }
    }
    $peripherals = @()
    $devices = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Mouse' OR PNPClass='Keyboard' OR PNPClass='AudioEndpoint' OR PNPClass='HIDClass'" -ErrorAction SilentlyContinue)
    foreach ($device in $devices) {
        if ($device.Status -ne 'OK' -or -not $device.Name) { continue }
        $type = switch ($device.PNPClass) {
            'Mouse' { 'Mouse' }
            'Keyboard' { 'Keyboard' }
            'AudioEndpoint' { 'Audio' }
            default { if ($device.Name -match 'gamepad|game controller|xbox|dualsense|dualshock') { 'Controller' } else { 'Other' } }
        }
        if ($type -eq 'Other') { continue }
        $connection = if ($device.PNPDeviceID -match '^(BTH|BTHENUM)' -or $device.Name -match 'Bluetooth') { 'Bluetooth' }
            elseif ($device.PNPDeviceID -match '^USB\\') { 'USB' }
            elseif ($device.PNPDeviceID -match '^HID\\') { 'HID' }
            else { 'System' }
        $peripherals += [ordered]@{ name = [string]$device.Name; type = $type; connection = $connection }
    }
    $result = [ordered]@{
        cpu = [ordered]@{ name = [string]$cpus[0].Name.Trim(); cores = [int](($cpus | Measure-Object NumberOfCores -Sum).Sum); threads = [int](($cpus | Measure-Object NumberOfLogicalProcessors -Sum).Sum) }
        gpu = [ordered]@{ name = $(if ($gpu) { [string]$gpu.Name } else { 'Unknown GPU' }); vramGB = $vram }
        memory = [ordered]@{ totalGB = [Math]::Round([double]$system.TotalPhysicalMemory / 1GB, 1); speedMHz = $(if ($memory.Count -gt 0) { [int]$memory[0].ConfiguredClockSpeed } else { 0 }) }
        os = [ordered]@{ name = [string]$os.Caption; build = [string]$os.BuildNumber }
        storage = [ordered]@{ totalGB = [Math]::Round([double](($disks | Measure-Object Size -Sum).Sum) / 1GB, 1); freeGB = [Math]::Round([double](($disks | Measure-Object FreeSpace -Sum).Sum) / 1GB, 1) }
        peripherals = @($peripherals | Sort-Object -Property name, type -Unique)
        scannedAt = [DateTime]::UtcNow.ToString('o')
    }
    [Console]::Out.WriteLine((@{ ok = $true; data = $result } | ConvertTo-Json -Depth 8 -Compress))
} catch {
    [Console]::Out.WriteLine((@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
    exit 1
}
