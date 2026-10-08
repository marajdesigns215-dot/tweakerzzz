import type { TweakStatusReport } from '../types';

export function parseTweakStatus(input: unknown, supported: string[]): TweakStatusReport {
  if (!input || typeof input !== 'object') throw new Error('Invalid Windows settings report.');
  const report = input as TweakStatusReport;
  if (typeof report.checkedAt !== 'string' || !Number.isFinite(Date.parse(report.checkedAt)) || !Array.isArray(report.tweaks) || report.tweaks.length !== supported.length) throw new Error('Incomplete Windows settings report.');
  const seen = new Set<string>();
  const tweaks = report.tweaks.map(item => {
    if (!item || !supported.includes(item.id) || seen.has(item.id) || !['enabled', 'not-enabled', 'not-configured', 'unknown'].includes(item.status) || typeof item.message !== 'string' || item.message.length > 3000) throw new Error('Invalid Windows setting status.');
    seen.add(item.id);
    if (item.fingerprint !== undefined && !/^[a-f0-9]{64}$/.test(item.fingerprint)) throw new Error('Invalid setting fingerprint.');
    return { id: item.id, status: item.status, message: item.message, ...(item.fingerprint ? { fingerprint: item.fingerprint } : {}) };
  });
  return { checkedAt: report.checkedAt, tweaks };
}
