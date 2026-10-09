#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (-not ($env:GITHUB_ACTIONS -eq 'true' -and $env:RUNNER_OS -eq 'Windows')) {
    throw 'Run this install/launch/uninstall test only on an isolated Windows CI runner.'
}
$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$installer = Join-Path (Get-Location) "release\Tweakerzzz-Setup-$version-x64.exe"
$directory = Join-Path $env:RUNNER_TEMP ('TweakerzzzSmoke-' + [Guid]::NewGuid().ToString('N'))
$application = Join-Path $directory 'Tweakerzzz.exe'
$process = $null
try {
    # Verify a real upgrade from the last released build, with pinned artifact bytes.
    $baseline = Join-Path $env:RUNNER_TEMP 'Tweakerzzz-Setup-0.6.2-x64.exe'
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri 'https://github.com/marajdesigns215-dot/tweakerzzz/releases/download/v0.6.2/Tweakerzzz-Setup-0.6.2-x64.exe' -OutFile $baseline
    if ((Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant() -ne '865b046cb090c3498b34677565b6eb07bbb7f88bd36a5d81de82560fbe77ddf7') { throw 'Baseline installer checksum mismatch.' }
    $oldInstall = Start-Process -FilePath $baseline -ArgumentList @('/S', "/D=$directory") -Wait -PassThru
    if ($oldInstall.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $application)) { throw 'Baseline installation failed.' }
    if ((Get-Item -LiteralPath $application).VersionInfo.ProductVersion -notlike '0.6.2*') { throw 'Baseline application version mismatch.' }
    $dataRoot = Join-Path $env:APPDATA 'tweakerzzz'
    $sentinels = @()
    foreach ($folder in @('backups', 'recordings', 'display-colors')) {
        $destination = Join-Path $dataRoot $folder
        $null = New-Item -ItemType Directory -Path $destination -Force
        $sentinel = Join-Path $destination 'update-qa-preserve.txt'
        Set-Content -LiteralPath $sentinel -Value 'Preserve saved tester data'
        $sentinels += $sentinel
    }
    $install = Start-Process -FilePath $installer -ArgumentList @('/S', '--updated', "/D=$directory") -Wait -PassThru
    if ($install.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $application)) { throw 'The installer failed to install the application.' }
    if ((Get-Item -LiteralPath $application).VersionInfo.ProductVersion -notlike "$version*") { throw 'The upgrade did not replace the application version.' }
    foreach ($sentinel in $sentinels) {
        if ((Get-Content -LiteralPath $sentinel -Raw).Trim() -ne 'Preserve saved tester data') { throw 'The upgrade changed saved data.' }
    }
    Write-Output 'PASS: verified 0.6.2 installation upgrades to the new version and preserves backup/recording/color data.'
    foreach ($resource in @('resources\app.asar', 'resources\windows\tweaks.json', 'resources\windows\tweaks.ps1', 'resources\windows\display.ps1')) {
        if (-not (Test-Path -LiteralPath (Join-Path $directory $resource))) { throw "Missing installed resource: $resource" }
    }
    $desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Tweakerzzz.lnk'
    $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Tweakerzzz.lnk'
    if (-not (Test-Path -LiteralPath $desktop) -or -not (Test-Path -LiteralPath $startMenu)) { throw 'The expected desktop and Start menu shortcuts were not created.' }
    $profileDirectory = Join-Path $env:RUNNER_TEMP ('TweakerzzzProfile-' + [Guid]::NewGuid().ToString('N'))
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $debugPort = $listener.LocalEndpoint.Port
    $listener.Stop()
    $process = Start-Process -FilePath $application -ArgumentList @("--remote-debugging-port=$debugPort", '--remote-debugging-address=127.0.0.1', "--user-data-dir=`"$profileDirectory`"") -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        Start-Sleep -Milliseconds 500
        $process.Refresh()
        if ($process.HasExited) { throw "The installed app exited unexpectedly: $($process.ExitCode)" }
    } while ($process.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)
    if ($process.MainWindowHandle -eq 0) { throw 'The installed app did not create a desktop window.' }
    Write-Output 'PASS: installed executable launches a desktop window without Node.js/npm commands; packaged resources and shortcuts exist.'
    node tests/windows.app.cjs $debugPort
    if ($LASTEXITCODE -ne 0) { throw 'The installed Windows app walkthrough failed.' }
} finally {
    if ($process -and -not $process.HasExited) {
        $null = $process.CloseMainWindow()
        if (-not $process.WaitForExit(10000)) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
    }
    $uninstaller = Join-Path $directory 'Uninstall Tweakerzzz.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        $null = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        while ((Test-Path -LiteralPath $application) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500 }
        if (Test-Path -LiteralPath $application) { throw 'The uninstaller did not remove the application executable.' }
        Write-Output 'PASS: the tester installer can be uninstalled.'
    }
}
