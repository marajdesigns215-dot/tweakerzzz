'use strict';
const { identity } = require('./device-inventory.cjs');
const { nvidiaVersion } = require('./vendor-releases.cjs');
const sources = require('./driver-sources.json');
const text = v => typeof v === 'string' ? v.trim().slice(0, 250) : '';
const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
function hardwareComponents(report, raw) {
  const cards = [], board = report.recommendations.find(r => r.title === 'Motherboard / system drivers');
  const add = (key, category, name, values, source, note, deviceIds = []) => cards.push({ id: identity('component:' + key), category, name: name || 'Not reported', values, source: source || null, sourceName: sources[source]?.name || '', note, deviceIds });
  const boardName = [report.board.manufacturer, report.board.product].filter(Boolean).join(' ');
  const platformDevices = report.devices.filter(d => d.present !== false && d.category === 'SYSTEM' && /^(PCI|ACPI)\\/i.test(d.instanceId) && /chipset|smbus|management engine|serial io|gpio|platform|\bpsp\b|dynamic tuning/i.test(d.name));
  add('board', 'Motherboard', boardName, { Manufacturer: report.board.manufacturer, Model: report.board.product, Revision: report.board.version, 'OEM system': [report.computer.manufacturer, report.computer.model].filter(Boolean).join(' ') }, board?.source,
    'Use the exact board model and revision, or the OEM system support page for a prebuilt/laptop. Chipset and onboard-device packages are listed there.', platformDevices.map(d => d.id));
  add('bios', 'BIOS / UEFI', boardName || report.computer.model, { 'BIOS version': report.bios.version, 'BIOS vendor': report.bios.manufacturer, 'Firmware release date': text(raw.bios?.[0]?.ReleaseDate) }, board?.source,
    'Match the exact motherboard/OEM model and hardware revision before reading a BIOS release. A BIOS release date is not the date it was installed. This app does not flash firmware.');
  for (const [i, cpu] of (raw.processors || []).entries()) {
    const name = text(cpu.Name), source = report.recommendations.find(r => r.category === 'CPU / chipset')?.source;
    add('cpu:' + (text(cpu.DeviceID) || i), 'Processor', name, { Manufacturer: text(cpu.Manufacturer), Socket: text(cpu.SocketDesignation), Cores: String(number(cpu.NumberOfCores) ?? ''), Threads: String(number(cpu.NumberOfLogicalProcessors) ?? '') }, source,
      'CPUs generally do not have a separate performance driver. Review platform/chipset packages and the motherboard BIOS release notes for CPU support and microcode changes.', report.devices.filter(d => d.present !== false && d.category === 'PROCESSOR' && (!d.name || d.name.toUpperCase() === name.toUpperCase())).map(d => d.id));
  }
  for (const [i, gpu] of (raw.graphics || []).entries()) {
    const instance = text(gpu.PNPDeviceID), device = report.devices.find(d => d.instanceId.toUpperCase() === instance.toUpperCase());
    const name = text(gpu.Name), source = /nvidia/i.test(name) ? 'nvidia' : /amd|radeon/i.test(name) ? 'amd' : /intel/i.test(name) ? 'intel' : null;
    add('gpu:' + (instance || i), 'Graphics', name, { 'Installed driver': text(gpu.DriverVersion) || device?.version || '', ...(/nvidia/i.test(name) ? { 'NVIDIA version': nvidiaVersion(text(gpu.DriverVersion) || device?.version) } : {}), 'Driver provider': device?.provider || '', 'Driver release date': device?.driverDate || '', 'Driver INF': device?.infName || '' }, board?.source && /dell|hp|lenovo|acer/.test(board.source) ? board.source : source,
      'Check the exact GPU, Windows version and driver branch. Vendor gaming drivers may be newer than packages offered through Windows Update.', device ? [device.id] : []);
  }
  for (const [i, module] of (raw.memoryModules || []).entries()) {
    const maker = text(module.Manufacturer), part = text(module.PartNumber), capacity = number(module.Capacity);
    add('ram:' + (text(module.DeviceLocator) || i), 'Memory', [maker, part].filter(Boolean).join(' '), { Manufacturer: maker, 'Part number': part, Slot: text(module.DeviceLocator), 'Capacity (GB)': capacity === null ? '' : String(Math.round(capacity / 1024 ** 3 * 10) / 10), 'Configured speed (MHz)': String(number(module.ConfiguredClockSpeed) ?? '') }, board?.source,
      'RAM modules normally need no separate driver. Check motherboard BIOS compatibility and memory support lists; the reported speed does not establish stability or the rated profile.');
  }
  for (const [i, disk] of (raw.disks || []).entries()) {
    const name = text(disk.Model), source = report.recommendations.find(r => r.category === 'Storage' && r.device === name)?.source;
    add('disk:' + (text(disk.DeviceID) || i), 'Storage', name, { Model: name, 'Firmware version': text(disk.FirmwareRevision), Interface: text(disk.InterfaceType) }, source,
      'Most drives use Windows storage drivers. Firmware releases are model-specific; read the manufacturer’s release notes and prerequisites before making a manual change.');
  }
  for (const d of report.devices.filter(d => d.present !== false && /^(PCI|USB|BTH|BTHENUM|HDAUDIO|ACPI|SD)\\/i.test(d.instanceId) && d.category === 'MEDIA').slice(0, 100)) {
    add('driver:' + d.id, 'Audio', d.name,
      { Manufacturer: d.manufacturer, 'Installed driver': d.version, 'Driver provider': d.provider, 'Driver release date': d.driverDate }, board?.source || d.source,
      'Prefer the system or motherboard manufacturer’s validated package for onboard hardware. An installed version alone does not establish that it is the latest.', [d.id]);
  }
  for (const [i, peripheral] of (report.hardware?.peripherals || []).entries()) {
    if (peripheral.type === 'Audio') continue; // The actual audio driver is shown above.
    const usb = /^([A-F0-9]{4}):([A-F0-9]{4})$/i.exec(peripheral.usbId || '');
    const candidates = report.devices.filter(d => d.present !== false && ['HIDCLASS', 'KEYBOARD', 'MOUSE', 'CAMERA', 'IMAGE', 'USB', 'MEDIA'].includes(d.category) && (usb
      ? [d.instanceId, ...d.hardwareIds].some(id => id.toUpperCase().includes('VID_' + usb[1].toUpperCase()) && id.toUpperCase().includes('PID_' + usb[2].toUpperCase()))
      : [peripheral.name, ...(peripheral.interfaces || [])].some(name => name && name.toUpperCase() === d.name.toUpperCase())));
    const matches = usb || candidates.length === 1 ? candidates : [];
    const guide = report.recommendations.find(r => r.category === 'Peripherals' && r.device === peripheral.name);
    add('peripheral:' + (peripheral.usbId || peripheral.name) + ':' + i, 'Peripherals', peripheral.name,
      { Type: peripheral.type, Connection: peripheral.connection, 'Installed driver': [...new Set(matches.map(d => d.version).filter(Boolean))].join(' · '), 'Driver provider': [...new Set(matches.map(d => d.provider).filter(Boolean))].join(' · ') }, guide?.source,
      'Versions below are Windows device drivers, not the firmware or optional control app. Generic HID/UVC drivers can be correct for this device.', matches.map(d => d.id));
  }
  return cards;
}
module.exports = { hardwareComponents };
