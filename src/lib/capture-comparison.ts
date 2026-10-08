import type { CaptureRecord } from '../types.ts';

export function compareCaptures(before: CaptureRecord, after: CaptureRecord) {
  if (before.id === after.id || before.phase !== 'before' || after.phase !== 'after') return null;
  if (before.status !== 'completed' || after.status !== 'completed' || !before.summary || !after.summary) return null;
  if (before.processName.toLowerCase() !== after.processName.toLowerCase() || before.context !== after.context || before.scenario.trim().toLowerCase() !== after.scenario.trim().toLowerCase()) return null;
  if (Date.parse(after.startedAt) <= Date.parse(before.startedAt)) return null;
  const delta = (a: number | null, b: number | null) => a === null || b === null || a <= 0 ? null : (b - a) / a * 100;
  const states = new Map(before.settings.tweaks.map(t => [t.id, t.status]));
  return {
    average: delta(before.summary.averageFps, after.summary.averageFps),
    low: delta(before.summary.onePercentLow, after.summary.onePercentLow),
    frameTime: delta(before.summary.p95FrameMs, after.summary.p95FrameMs),
    changed: after.settings.tweaks.filter(t => states.get(t.id) !== t.status).map(t => t.id),
    shortRun: before.summary.sampledSeconds < 30 || after.summary.sampledSeconds < 30,
  };
}
