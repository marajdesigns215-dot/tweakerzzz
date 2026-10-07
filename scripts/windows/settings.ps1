#requires -Version 5.1
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($request.target -ne 'nvidia') { throw 'Unsupported settings target.' }
    $package = Get-AppxPackage -Name 'NVIDIACorp.NVIDIAControlPanel' | Select-Object -First 1
    if (-not $package) { throw 'NVIDIA Control Panel was not found. Install it from NVIDIA or the Microsoft Store, then retry.' }
    $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
    $application = @($manifest.Package.Applications.Application) | Select-Object -First 1
    $identifier = $package.PackageFamilyName + '!' + $application.Id
    if ($identifier -notmatch '^[A-Za-z0-9_.!]+$') { throw 'NVIDIA Control Panel returned an invalid application identifier.' }
    Start-Process -FilePath "$env:SystemRoot\explorer.exe" -ArgumentList @('shell:AppsFolder\' + $identifier)
    [Console]::Out.WriteLine((@{ ok = $true; data = $null } | ConvertTo-Json -Compress))
} catch {
    [Console]::Out.WriteLine((@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
    exit 1
}
