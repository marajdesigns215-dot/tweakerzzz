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
  const number = (value: unknown, max: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error('A hardware report number is missing or out of range.');
    return value;
  };
  const envelope = object(input);
  const report = object(envelope.system ?? envelope);
  const cpu = object(report.cpu), gpu = object(report.gpu), memory = object(report.memory), os = object(report.os), storage = object(report.storage);
  if (!Array.isArray(report.peripherals) || report.peripherals.length > 200) throw new Error('Invalid peripheral list.');
  const date = report.scannedAt;
  if (date !== '' && (typeof date !== 'string' || !Number.isFinite(Date.parse(date)))) throw new Error('Invalid report timestamp.');
  const totalGB = number(storage.totalGB, 100_000_000), freeGB = number(storage.freeGB, totalGB);
  return {
    cpu: { name: text(cpu.name), cores: number(cpu.cores, 4096), threads: number(cpu.threads, 16384) },
    gpu: { name: text(gpu.name), vramGB: gpu.vramGB === null ? null : number(gpu.vramGB, 16384) },
    memory: { totalGB: number(memory.totalGB, 1_000_000), speedMHz: number(memory.speedMHz, 100_000) },
    os: { name: text(os.name), build: text(os.build) },
    storage: { totalGB, freeGB },
    peripherals: report.peripherals.map(item => {
      const p = object(item);
      if (!['Mouse', 'Keyboard', 'Audio', 'Controller', 'Other'].includes(String(p.type))) throw new Error('Unrecognized peripheral type.');
      return { name: text(p.name), type: p.type as SystemScan['peripherals'][number]['type'], connection: text(p.connection, 80) };
    }),
    scannedAt: date as string,
  };
}
