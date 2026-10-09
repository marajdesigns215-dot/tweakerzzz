import type { DriverReport, DriverUpdateOffers, DriverChange } from '../types';
export const hardwareCategories = ['Graphics', 'Processor', 'Motherboard', 'BIOS / UEFI', 'Peripherals', 'Audio'];
const classes = ['DISPLAY', 'PROCESSOR', 'MEDIA', 'AUDIOENDPOINT', 'HIDCLASS', 'KEYBOARD', 'MOUSE', 'CAMERA', 'IMAGE'];
export const visibleParts = (report: DriverReport) => (report.components || []).filter(c => hardwareCategories.includes(c.category));
export function visibleChange(change: DriverChange, report: DriverReport | null) {
  const platform = change.category === 'SYSTEM' && /^(PCI|ACPI)\\/i.test(change.instanceId) && /chipset|smbus|management engine|serial io|gpio|platform|\bpsp\b|dynamic tuning/i.test(change.name);
  return platform || hardwareCategories.includes(change.category) || classes.includes(change.category) || !!report && visibleParts(report).some(c => c.deviceIds.includes(change.deviceId));
}
export function visibleOffers(offers: DriverUpdateOffers | null, report: DriverReport | null) {
  if (!offers) return offers;
  const deviceIds = new Set(report ? visibleParts(report).flatMap(c => c.deviceIds) : []);
  const ids = new Set((report?.devices || []).filter(d => deviceIds.has(d.id)).flatMap(d => [d.instanceId, ...(d.hardwareIds || []), ...(d.compatibleIds || [])]).map(id => id.toUpperCase()));
  return { ...offers, packages: offers.packages.filter(p => classes.includes(p.driverClass.toUpperCase()) || p.driverClass.toUpperCase() === 'FIRMWARE' || !!p.hardwareId && ids.has(p.hardwareId.toUpperCase())) };
}
