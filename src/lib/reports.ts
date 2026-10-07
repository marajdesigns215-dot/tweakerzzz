import type { SystemScan } from '../types';

/** Validate local imports and native reports before they reach the renderer. */
export function parseHardwareReport(input: unknown): SystemScan {
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid hardware report structure.');
    return value as Record<string, unknown>;
  };
  const text = (value: unknown, max = 250): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('A hardware report text field is missing or invalid.');
    return value;
  };
  const number = (value: unknown, max: number): number | null => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error('A hardware report number is missing or out of range.');
    return value;
  };
  const envelope = object(input);
  const report = object(envelope.system ?? envelope);
  const cpu = object(report.cpu), gpu = object(report.gpu), memory = object(report.memory), os = object(report.os), storage = object(report.storage);
  if (!Array.isArray(report.peripherals) || report.peripherals.length > 200) throw new Error('Invalid peripheral list.');
  const date = report.scannedAt;
  if (date !== '' && (typeof date !== 'string' || !Number.isFinite(Date.parse(date)))) throw new Error('Invalid report timestamp.');
  const totalGB = number(storage.totalGB, 100_000_000), freeGB = number(storage.freeGB, totalGB ?? 100_000_000);
  const warnings = report.warnings;
  if (warnings !== undefined && (!Array.isArray(warnings) || warnings.length > 30)) throw new Error('Invalid scan diagnostics.');
  return {
    cpu: { name: text(cpu.name), cores: number(cpu.cores, 4096), threads: number(cpu.threads, 16384) },
    gpu: { name: text(gpu.name), vramGB: gpu.vramGB === null ? null : number(gpu.vramGB, 16384) },
    memory: { totalGB: number(memory.totalGB, 1_000_000), speedMHz: number(memory.speedMHz, 100_000) },
    os: { name: text(os.name), build: text(os.build) },
    storage: { totalGB, freeGB },
    peripherals: report.peripherals.map(item => {
      const p = object(item);
      if (!['Mouse', 'Keyboard', 'Audio', 'Controller', 'Camera', 'Other'].includes(String(p.type))) throw new Error('Unrecognized peripheral type.');
      if (p.identification !== undefined && !['reported', 'usb-id', 'vendor-only', 'generic'].includes(String(p.identification))) throw new Error('Invalid peripheral identification.');
      if (p.usbId !== undefined && (typeof p.usbId !== 'string' || !/^[A-F0-9]{4}:[A-F0-9]{4}$/.test(p.usbId))) throw new Error('Invalid USB product ID.');
      if (p.interfaceCount !== undefined && (!Number.isInteger(p.interfaceCount) || Number(p.interfaceCount) < 1 || Number(p.interfaceCount) > 10000)) throw new Error('Invalid interface count.');
      if (p.interfaces !== undefined && (!Array.isArray(p.interfaces) || p.interfaces.length > 30)) throw new Error('Invalid interface names.');
      return { name: text(p.name), type: p.type as SystemScan['peripherals'][number]['type'], connection: text(p.connection, 80),
        ...(p.identification !== undefined ? { identification: p.identification as 'reported' | 'usb-id' | 'vendor-only' | 'generic' } : {}),
        ...(p.manufacturer !== undefined ? { manufacturer: text(p.manufacturer) } : {}),
        ...(p.usbId !== undefined ? { usbId: p.usbId as string } : {}),
        ...(p.interfaceCount !== undefined ? { interfaceCount: p.interfaceCount as number } : {}),
        ...(p.interfaces !== undefined ? { interfaces: (p.interfaces as unknown[]).map(value => text(value)) } : {}),
      };
    }),
    scannedAt: date as string,
    ...(warnings !== undefined ? { warnings: (warnings as unknown[]).map(item => { const w = object(item); return { component: text(w.component, 80), message: text(w.message, 2000) }; }) } : {}),
  };
}

export function parsePeripheralReport(input: unknown): import('../types').PeripheralScan {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid peripheral report.');
  const report = input as Record<string, unknown>;
  const normalized = parseHardwareReport({ cpu: { name: 'Not requested', cores: null, threads: null }, gpu: { name: 'Not requested', vramGB: null }, memory: { totalGB: null, speedMHz: null }, os: { name: 'Not requested', build: 'Not requested' }, storage: { totalGB: null, freeGB: null }, peripherals: report.peripherals, scannedAt: report.scannedAt, warnings: report.warnings ?? [] });
  return { peripherals: normalized.peripherals, scannedAt: normalized.scannedAt, warnings: normalized.warnings ?? [] };
}
