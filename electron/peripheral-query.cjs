'use strict';

// Fixed read-only queries. Property lookups are batched and bounded; names,
// instance IDs and USB descriptors are data, never interpolated as commands.
const peripheralQuery = String.raw`
$inventory = @(); $propertiesAvailable = $true
try { $inventory = @(Get-PnpDevice -PresentOnly -ErrorAction Stop) }
catch {
  $propertiesAvailable = $false
  try { $inventory = @(Get-CimInstance -ClassName Win32_PnPEntity -OperationTimeoutSec 6 -ErrorAction Stop) }
  catch { $inventory = @(Get-WmiObject -Class Win32_PnPEntity -ErrorAction Stop) }
}
$nodes = @{}; $targets = @()
foreach ($device in $inventory) {
  $id = [string]$device.InstanceId
  if (-not $id) { $id = [string]$device.PNPDeviceID }
  if (-not $id) { continue }
  $class = [string]$device.Class
  if (-not $class) { $class = [string]$device.PNPClass }
  $name = [string]$device.FriendlyName
  if (-not $name) { $name = [string]$device.Name }
  $target = ($class -in @('Mouse', 'Keyboard', 'AudioEndpoint', 'Camera', 'Image')) -or ($class -eq 'HIDClass' -and $name -match 'gamepad|game controller|xbox|dualsense|dualshock')
  $nodes[$id] = @{ InstanceId = $id; Class = $class; FriendlyName = $name; Status = [string]$device.Status; ConfigManagerErrorCode = $device.ConfigManagerErrorCode; Manufacturer = [string]$device.Manufacturer; Service = [string]$device.Service; Target = $target }
  if ($target) { $targets += $id }
}
$keys = @('DEVPKEY_Device_BusReportedDeviceDesc', 'DEVPKEY_Device_FriendlyName', 'DEVPKEY_Device_DeviceDesc', 'DEVPKEY_Device_Manufacturer', 'DEVPKEY_Device_Parent', 'DEVPKEY_Device_ContainerId', 'DEVPKEY_Device_Service')
$visited = @{}; $frontier = @($targets)
for ($depth = 0; $depth -lt 5 -and $frontier.Count -gt 0; $depth++) {
  foreach ($id in $frontier) { $visited[$id] = $true }
  if (-not $propertiesAvailable) { break }
  try { $properties = @(Get-PnpDeviceProperty -InstanceId $frontier -KeyName $keys -ErrorAction SilentlyContinue) }
  catch { $properties = @(); $propertiesAvailable = $false }
  foreach ($property in $properties) {
    $id = [string]$property.InstanceId
    if (-not $nodes.ContainsKey($id) -or $null -eq $property.Data) { continue }
    $field = ([string]$property.KeyName) -replace '^DEVPKEY_Device_', ''
    $nodes[$id][$field] = [string]$property.Data
  }
  $next = @()
  foreach ($id in $frontier) {
    $parent = [string]$nodes[$id].Parent
    if ($parent -and $nodes.ContainsKey($parent) -and -not $visited.ContainsKey($parent)) { $next += $parent }
  }
  $frontier = @($next | Select-Object -Unique)
}
foreach ($id in $visited.Keys) { [pscustomobject]$nodes[$id] }
`;

module.exports = { peripheralQuery };
