import type { CaptureRecord } from '../types.ts';

export function captureQualityIssues(record: CaptureRecord): string[] {
  const s = record.summary;
  if (!s) return ['No usable frame measurements.'];
  const issues = [...(s.qualityIssues ?? [])];
  if (s.metricsVersion !== 2) issues.push('Older calculation: repeated frame starts may inflate FPS. Recalculate this run from its saved CSV before using it as evidence.');
  if (record.endedAt) {
    const duration = (Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 1000;
    if (duration > 0 && s.sampledSeconds > duration + Math.max(2, duration * .02)) issues.push('Sampled time exceeds the recording duration. Review capture timing before drawing conclusions.');
  }
  if (/64 MB|row limit|frame limit/i.test(record.stopReason ?? '')) issues.push('The recording reached a storage or row limit before the intended duration. Use a shorter matched test.');
  if (/lost.*event|event.*lost/i.test(record.collectorWarnings ?? '')) issues.push('The collector reported lost events. Repeat the capture before comparing performance.');
  if (s.otherStreamFrames > s.frames * .2) issues.push('Multiple active render streams were found. Confirm that the selected stream represents gameplay.');
  return issues;
}
