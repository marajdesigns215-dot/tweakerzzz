import type { DisplayMode } from '../types.ts';

export function parseDisplayModes(value: unknown): DisplayMode[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Windows returned an invalid display-mode list.');
  const unique = new Map<string, DisplayMode>();
  for (const mode of value) {
    if (!mode || !Number.isInteger(mode.width) || mode.width < 320 || mode.width > 16384 || !Number.isInteger(mode.height) || mode.height < 200 || mode.height > 16384 || !Number.isInteger(mode.refreshRate) || mode.refreshRate < 23 || mode.refreshRate > 1000) throw new Error('Windows returned an invalid display mode.');
    unique.set(`${mode.width}x${mode.height}@${mode.refreshRate}`, { width: mode.width, height: mode.height, refreshRate: mode.refreshRate });
  }
  if (!unique.size) throw new Error('Windows did not report any supported display modes. Reconnect the display or check its driver, then refresh the mode list.');
  return [...unique.values()];
}

export function supportedSelection(modes: DisplayMode[], resolution: string, rate: number) {
  return modes.find(m => `${m.width}x${m.height}` === resolution && m.refreshRate === rate)
    ?? modes.find(m => `${m.width}x${m.height}` === resolution)
    ?? modes[0];
}

export function displayAspect(resolution: string) {
  const [width, height] = resolution.split('x').map(Number);
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  if (!width || !height) return 'Not selected';
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}
