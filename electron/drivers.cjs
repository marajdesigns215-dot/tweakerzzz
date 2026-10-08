'use strict';
const path = require('node:path');
const { scanSystem, execute } = require('./scanner.cjs');
const sources = require('./driver-sources.json');
const text = value => typeof value === 'string' ? value.trim().slice(0, 250) : '';
const useful = value => { const s = text(value); return /^(?:default string|to be filled|system product name|system manufacturer|unknown|not applicable|none|n\/a)/i.test(s) ? '' : s; };
const boardVendor = name => /micro-star|\bmsi\b/i.test(name) ? 'msi' : /asus|asustek/i.test(name) ? 'asus' : /gigabyte/i.test(name) ? 'gigabyte' : /asrock/i.test(name) ? 'asrock' : null;
const oemVendor = name => /dell|alienware/i.test(name) ? 'dell' : /hewlett|\bhp\b/i.test(name) ? 'hp' : /lenovo/i.test(name) ? 'lenovo' : /acer/i.test(name) ? 'acer' : null;

function recommendDrivers(report) {
  const cards = [];
  const add = (category, title, device, source, reason, note, confidence = 'Reported hardware') => cards.push({ id: `${category}-${cards.length}`, category, title, device, source, sourceName: sources[source]?.name ?? '', reason, note, confidence });
  const { hardware, board, computer, disks, devices } = report;
  const oem = oemVendor(computer.manufacturer);
  const boardSource = oem || boardVendor(board.manufacturer);
  const boardName = oem ? `${computer.manufacturer} ${computer.model}` : `${board.manufacturer} ${board.product}`;
  if (boardSource) {
    add('Motherboard', 'Motherboard / system drivers', boardName.trim(), boardSource, 'Use the exact model support page for chipset, LAN/Wi-Fi, Bluetooth, audio, and supported control utilities.', `Match your model, board revision${board.version ? ' (' + board.version + ')' : ''}, and Windows version. A detected vendor is not a verified download match. BIOS updates are manual and are not performance tweaks.`, board.product || computer.model ? 'Model reported; verify revision' : 'Vendor only; model required');
    add('Cooling', 'Fan curves & motherboard utilities', boardName.trim(), boardSource, 'Motherboard-connected fans normally use BIOS/UEFI fan control. The model support page lists compatible fan/RGB utilities.', 'Individual fan models and header wiring usually cannot be identified by Windows. Do not install several utilities to control the same fan or RGB controller.');
  } else add('Motherboard', 'Identify your motherboard first', boardName.trim() || 'Board model unavailable', null, 'Windows did not identify a supported motherboard vendor. Check the board label, system receipt, or BIOS information.', 'Do not guess a BIOS, chipset, or fan-controller package from the CPU alone.', 'Needs identification');
  const gpu = hardware.gpu.name;
  const gpuSource = /nvidia/i.test(gpu) ? 'nvidia' : /radeon|amd/i.test(gpu) ? 'amd' : /intel/i.test(gpu) ? 'intel' : null;
  if (gpuSource) add('Graphics', 'Graphics driver & control software', gpu, oem || gpuSource, oem ? 'Check your PC manufacturer’s validated graphics driver first, especially on laptops with switchable graphics.' : 'Choose the exact GPU model and Windows version on the detected manufacturer’s support page. Check release notes and keep a known-good driver.', `Installed version: ${hardware.gpu.driverVersion || 'not reported'}. The scan does not establish that a newer driver is needed. Keep a known-good installer before changing versions.`);
  if (/amd|ryzen/i.test(hardware.cpu.name)) add('CPU / chipset', 'AMD chipset package', hardware.cpu.name, oem || 'amd', 'Chipset packages can supply platform power management, GPIO, and PCI components. Select the motherboard chipset, not just the CPU model.', 'The CPU itself usually does not need a separate gaming driver. Chipset identity must be verified on the board support page; Ryzen Master is optional and is not required.');
  else if (/intel/i.test(hardware.cpu.name)) add('CPU / chipset', 'Intel platform support', hardware.cpu.name, oem || boardSource || 'intel', 'Check the exact system/board page for chipset and Management Engine packages; generic Intel tools are a secondary option.', 'A CPU name does not uniquely identify the chipset. Overclocking utilities are optional and do not replace platform drivers.');
  if (devices.some(d => d.category === 'NET' || d.category === 'MEDIA')) add('Network / audio', 'Network, Bluetooth & audio packages', devices.filter(d => ['NET', 'MEDIA'].includes(d.category)).slice(0, 5).map(d => d.name).join(' · '), boardSource, 'For onboard components, start with your exact system or motherboard support page. USB audio devices may use their peripheral vendor’s software.', 'Installed driver versions appear below. Date/version alone cannot determine whether a driver is current or compatible.', boardSource ? 'Vendor support; verify component' : 'Needs component identification');
  for (const p of hardware.peripherals) {
    const name = `${p.manufacturer || ''} ${p.name}`;
    let source = /corsair/i.test(name) || p.usbId?.startsWith('1B1C:') ? 'corsair' : /epomaker/i.test(name) ? 'epomaker' : /razer/i.test(name) ? 'razer' : /steelseries/i.test(name) ? 'steelseries' : /hyperx/i.test(name) ? 'hyperx' : /logitech/i.test(name) || p.usbId?.startsWith('046D:') ? (/\bG(?:102|203|305|502|600|703|903|PRO)\b/i.test(p.name) ? 'logitech' : 'logitech-support') : null;
    add('Peripherals', source ? 'Device software & support' : 'Identify this peripheral', p.name, source, source === 'epomaker' ? 'Find the exact model, connection variant, and PCB revision on EPOMAKER’s download page.' : source ? 'Use the manufacturer’s compatibility list for this exact model. Software can expose DPI, polling, onboard profiles, EQ, lighting, or camera controls.' : 'Windows supplied a generic or unrecognized product name. Check its label or packaging; the generic Windows driver may already provide all required functions.', source ? 'Utilities are optional and may add background load. Firmware for another model/revision can damage the device; this app never installs it automatically.' : 'Generic HID and UVC webcam drivers are often sufficient. A USB vendor ID identifies a brand, not necessarily the product.', p.identification === 'vendor-only' ? 'Vendor only; model required' : p.identification === 'generic' ? 'Needs identification' : 'Reported name / product family');
  }
  for (const d of devices.filter(d => /commander|lighting node|kraken|nzxt|lian li|uni fan|icue link/i.test(d.name))) {
    const source = /nzxt|kraken/i.test(d.name) ? 'nzxt' : /lian li|uni fan/i.test(d.name) ? 'lianli' : /corsair|commander|lighting node|icue/i.test(d.name) ? 'corsair' : null;
    if (source) add('Cooling', 'USB cooling / lighting controller', d.name, source, 'A named controller can expose pump, fan, or RGB controls through compatible vendor software.', 'Verify the controller generation. This scan cannot confirm which fans are attached or recommend a universal fan curve.');
  }
  for (const disk of disks) {
    const source = /samsung/i.test(disk.model) ? 'samsung' : /crucial|\bCT\d/i.test(disk.model) ? 'crucial' : /western digital|\bWDC\b|\bWD_/i.test(disk.model) ? 'wd' : /seagate/i.test(disk.model) ? 'seagate' : null;
    if (source) add('Storage', 'Drive health & support tools', disk.model, source, 'Optional vendor tools can report drive health and supported firmware.', 'Most NVMe/SATA drives use Windows storage drivers. Back up data and verify the exact drive before any manual firmware update.');
  }
  return cards;
}
const queries = {
  board: 'Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer,Product,Version',
  computer: 'Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model',
  bios: 'Get-CimInstance Win32_BIOS | Select-Object Manufacturer,SMBIOSBIOSVersion',
  disks: 'Get-CimInstance Win32_DiskDrive | Select-Object Model,FirmwareRevision',
  devices: "Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -in @('DISPLAY','NET','MEDIA','SYSTEM','SCSIADAPTER','HDC','USB','BLUETOOTH') } | Select-Object DeviceName,DeviceClass,Manufacturer,DriverVersion,DriverDate",
};
function createDriverScanner({ readHardware = scanSystem, run = execute, environment = process.env } = {}) {
  return async () => {
    const executable = path.win32.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const warnings = [];
    const entries = Object.entries(queries);
    const results = await Promise.allSettled([readHardware(), ...entries.map(([, q]) => run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $rows=@(${q}); ConvertTo-Json -InputObject $rows -Depth 4 -Compress`], { timeoutMs: 25000 }))]);
    if (results[0].status !== 'fulfilled') throw results[0].reason;
    const raw = {};
    entries.forEach(([key], i) => { try { const r = results[i + 1]; if (r.status === 'rejected') throw r.reason; const rows = JSON.parse(r.value.replace(/^\uFEFF/, '')); if (!Array.isArray(rows)) throw new Error('Invalid inventory response'); raw[key] = rows; } catch (e) { raw[key] = []; warnings.push({ component: key, message: String(e.message).slice(0, 2000) }); } });
    const report = { hardware: results[0].value, board: { manufacturer: useful(raw.board[0]?.Manufacturer), product: useful(raw.board[0]?.Product), version: useful(raw.board[0]?.Version) }, computer: { manufacturer: useful(raw.computer[0]?.Manufacturer), model: useful(raw.computer[0]?.Model) }, bios: { manufacturer: useful(raw.bios[0]?.Manufacturer), version: useful(raw.bios[0]?.SMBIOSBIOSVersion) }, disks: raw.disks.map(d => ({ model: text(d.Model), firmware: text(d.FirmwareRevision) })), devices: raw.devices.filter(d => d.DeviceName).slice(0, 1000).map(d => ({ name: text(d.DeviceName), category: text(d.DeviceClass).toUpperCase(), provider: text(d.Manufacturer), version: text(d.DriverVersion) })), warnings: [...(results[0].value.warnings || []), ...warnings], scannedAt: new Date().toISOString() };
    return { ...report, recommendations: recommendDrivers(report) };
  };
}
function driverSource(id) { if (typeof id !== 'string' || !Object.hasOwn(sources, id)) throw new Error('Unknown official download source.'); return sources[id].url; }
module.exports = { recommendDrivers, createDriverScanner, scanDrivers: createDriverScanner(), driverSource };
