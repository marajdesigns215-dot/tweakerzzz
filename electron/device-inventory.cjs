'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { execute } = require('./scanner.cjs');
const sources = require('./driver-sources.json');
const LIMIT = 3000;
const text = (v, max = 1024) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const identity = v => crypto.createHash('sha256').update(v.toUpperCase()).digest('hex');
const list = v => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter(x => typeof x === 'string').slice(0, 16).map(x => text(x));
const query = `
$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$result=@{pnp=@();drivers=@();warnings=@();pnpOk=$false;driversOk=$false}
try {
  $result.pnp=@(Get-CimInstance Win32_PnPEntity -OperationTimeoutSec 15 | Select-Object -First 3001 DeviceID,Name,PNPClass,ClassGuid,Manufacturer,HardwareID,CompatibleID,Service,Status,Present,ConfigManagerErrorCode)
  $result.pnpOk=$true
} catch { $result.warnings+=@{component='device inventory';message=$_.Exception.Message} }
try {
  $result.drivers=@(Get-CimInstance Win32_PnPSignedDriver -OperationTimeoutSec 15 | Select-Object -First 3001 DeviceID,DeviceName,DeviceClass,Manufacturer,DriverProviderName,DriverVersion,InfName,IsSigned,Signer,@{Name='DriverDate';Expression={if ($_.DriverDate) {$_.DriverDate.ToString('yyyy-MM-dd')}}})
  $result.driversOk=$true
} catch { $result.warnings+=@{component='driver inventory';message=$_.Exception.Message} }
ConvertTo-Json -InputObject $result -Depth 5 -Compress`;

function deviceSource(device) {
  // Manufacturer/name evidence only: a Microsoft class driver is not proof
  // that Microsoft made the physical device. Hardware IDs stay visible.
  const name = `${device.manufacturer} ${device.name}`;
  const matches = [
    [/nvidia/i, 'nvidia'], [/\bamd\b|radeon|advanced micro devices/i, 'amd'], [/\bintel\b/i, 'intel'],
    [/logitech|\blogi\b/i, 'logitech-support'], [/corsair/i, 'corsair'], [/epomaker/i, 'epomaker'],
    [/razer/i, 'razer'], [/steelseries/i, 'steelseries'], [/hyperx/i, 'hyperx'], [/realtek/i, 'realtek'],
    [/qualcomm/i, 'qualcomm'], [/mediatek/i, 'mediatek'], [/broadcom/i, 'broadcom'], [/tp-link/i, 'tplink'],
    [/elgato/i, 'elgato'], [/\bbrother\b/i, 'brother'], [/\bcanon\b/i, 'canon'], [/\bepson\b/i, 'epson'],
    [/samsung/i, 'samsung-support'], [/\blenovo\b/i, 'lenovo'], [/\bdell\b/i, 'dell'], [/hewlett|\bhp\b/i, 'hp'],
    [/asustek|\basus\b/i, 'asus'], [/micro-star|\bmsi\b/i, 'msi'], [/gigabyte/i, 'gigabyte'],
  ];
  const id = matches.find(([pattern]) => pattern.test(name))?.[1];
  return id && sources[id] ? { source: id, sourceName: sources[id].name } : { source: null, sourceName: '' };
}
function normalizeInventory(raw, scannedAt) {
  if (!raw || !Array.isArray(raw.pnp) || !Array.isArray(raw.drivers) || typeof raw.pnpOk !== 'boolean' || typeof raw.driversOk !== 'boolean') throw new Error('Windows returned an invalid device inventory.');
  const warnings = (Array.isArray(raw.warnings) ? raw.warnings : []).slice(0, 10).map(w => ({ component: text(w?.component, 100), message: text(w?.message, 2000) }));
  const devices = new Map(); let malformed = 0;
  for (const row of raw.pnp.slice(0, LIMIT)) {
    const instanceId = text(row?.DeviceID);
    if (!instanceId) { malformed++; continue; }
    const id = identity(instanceId);
    if (devices.has(id)) { malformed++; continue; }
    devices.set(id, { id, instanceId, name: text(row.Name, 250) || 'Unnamed Windows device', category: text(row.PNPClass, 100).toUpperCase() || 'UNCLASSIFIED',
      manufacturer: text(row.Manufacturer, 250), hardwareIds: list(row.HardwareID), compatibleIds: list(row.CompatibleID), classGuid: text(row.ClassGuid, 100),
      service: text(row.Service, 250), status: text(row.Status, 100), present: typeof row.Present === 'boolean' ? row.Present : null,
      problemCode: Number.isInteger(row.ConfigManagerErrorCode) && row.ConfigManagerErrorCode >= 0 ? row.ConfigManagerErrorCode : null,
      provider: '', version: '', driverDate: '', infName: '', signed: null, signer: '', driverReported: false });
  }
  const seenDrivers = new Set();
  for (const row of raw.drivers.slice(0, LIMIT)) {
    const instanceId = text(row?.DeviceID);
    if (!instanceId) { malformed++; continue; }
    const id = identity(instanceId);
    if (seenDrivers.has(id)) { malformed++; continue; }
    seenDrivers.add(id);
    const d = devices.get(id) || { id, instanceId, name: text(row.DeviceName, 250) || 'Unnamed Windows device', category: text(row.DeviceClass, 100).toUpperCase() || 'UNCLASSIFIED', manufacturer: text(row.Manufacturer, 250), hardwareIds: [], compatibleIds: [], classGuid: '', service: '', status: '', present: null, problemCode: null };
    Object.assign(d, { provider: text(row.DriverProviderName, 250), version: text(row.DriverVersion, 100), driverDate: /^\d{4}-\d{2}-\d{2}$/.test(row.DriverDate) ? row.DriverDate : '',
      infName: text(row.InfName, 250), signed: typeof row.IsSigned === 'boolean' ? row.IsSigned : null, signer: text(row.Signer, 250), driverReported: true });
    devices.set(id, d);
  }
  const truncated = raw.pnp.length > LIMIT || raw.drivers.length > LIMIT || devices.size > LIMIT;
  if (truncated) warnings.push({ component: 'inventory limit', message: `The inventory exceeded ${LIMIT} records. Results are partial; driver-change history will not use this scan.` });
  if (malformed) warnings.push({ component: 'inventory identity', message: `${malformed} records had missing or duplicate device IDs. Driver-change history will not use this scan.` });
  if (!raw.pnpOk || !raw.driversOk) warnings.push({ component: 'partial inventory', message: 'A Windows inventory query was unavailable. Missing records are not evidence of removed devices or drivers.' });
  return { devices: [...devices.values()].slice(0, LIMIT).map(d => ({ ...d, ...deviceSource(d) })).sort((a, b) => a.name.localeCompare(b.name)),
    complete: raw.pnpOk && raw.driversOk && !truncated && !malformed && devices.size > 0, scannedAt, warnings };
}
function createDeviceScanner({ run = execute, environment = process.env, now = () => new Date().toISOString() } = {}) {
  return async () => {
    const executable = path.win32.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const raw = await run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', query], { timeoutMs: 45000, maxBufferBytes: 8 * 1024 * 1024 });
    return normalizeInventory(JSON.parse(raw.replace(/^\uFEFF/, '')), now());
  };
}
module.exports = { createDeviceScanner, scanDeviceInventory: createDeviceScanner(), normalizeInventory, identity, LIMIT };
