import type { CaptureRecord } from '../types.ts';
import { captureQualityIssues } from './capture-quality.ts';
import { tweaks } from '../data/tweaks.ts';
const supported = tweaks.filter(t => t.mode === 'automatic').map(t => t.id).sort();
const normalized = (value: string) => value.trim().toLowerCase();
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
function signature(record: CaptureRecord, end = false): string | null {
  const states = end ? record.settingsEnd?.tweaks : record.settings?.tweaks;
  if (!states || states.length !== supported.length || new Set(states.map(t => t.id)).size !== supported.length) return null;
  const ordered = supported.map(id => states.find(t => t.id === id));
  if (ordered.some(t => !t || t.status === 'unknown' || !/^[a-f0-9]{64}$/.test(t.fingerprint ?? ''))) return null;
  return ordered.map(t => `${t!.id}:${t!.status}:${t!.fingerprint}`).join('|');
}
export function evidenceExclusion(record: CaptureRecord): string | null {
  if (record.status !== 'completed' || !record.summary) return 'Unsuccessful or unfinished recording';
  if (captureQualityIssues(record).length) return 'Frame measurements need recalculation or capture-quality review';
  if (record.summary.sampledSeconds < 60 || record.summary.frames < 100 || record.summary.onePercentLow == null) return 'Less than 60 seconds of usable samples';
  if (![record.summary.averageFps, record.summary.onePercentLow, record.summary.p95FrameMs].every(v => Number.isFinite(v) && v > 0)) return 'Invalid performance measurements';
  if (!record.benchmark?.verified) return 'Benchmark conditions not confirmed';
  if (!record.hardwareKey || !record.hardware?.gpu.driverVersion || /unknown|not reported/i.test(record.hardware.cpu.name + record.hardware.gpu.name) || !record.hardware.memory.totalGB) return 'Hardware or graphics driver snapshot unavailable';
  const start = signature(record), end = signature(record, true);
  if (!start || !end) return 'Exact start/end tweak values unavailable';
  if (start !== end) return 'Supported settings changed during the run';
  if (!record.endedAt || !Number.isFinite(Date.parse(record.startedAt)) || Date.parse(record.endedAt) <= Date.parse(record.startedAt)) return 'Recording times unavailable';
  if (/lost.*event|event.*lost/i.test(record.collectorWarnings ?? '')) return 'Collector reported lost events';
  if (record.summary.otherStreamFrames > record.summary.frames * .2) return 'Multiple active render streams need review';
  return null;
}
export function experimentKey(record: CaptureRecord): string {
  const b = record.benchmark!;
  return JSON.stringify([normalized(record.processName), record.context, normalized(record.scenario), record.seconds, !!record.telemetry, record.telemetrySummary?.obs.enabled ?? !!record.telemetrySummary?.obs.samples, record.hardwareKey, record.collector, record.captureMethod ?? 'legacy', record.summary?.metricsVersion, record.summary?.measurementBasis, ...['experiment', 'resolution', 'graphics', 'gameBuild'].map(key => normalized(b[key as 'experiment'])), b.fpsCap]);
}
export interface BenchmarkEvidence { scope: 'fps-only' | 'fps-and-obs'; key: string; experiment: string; processName: string; context: string; hardwareKey: string; changedIds: string[]; pairs: number; verdict: 'improved' | 'regressed' | 'inconclusive' | 'collect-more'; averageChange: number; lowChange: number; frameTimeChange: number; beforeIds: string[]; afterIds: string[]; reason: string }
export function analyzeBenchmarks(records: CaptureRecord[]) {
  const exclusions = new Map<string, number>(), experiments = new Map<string, CaptureRecord[]>();
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) continue; seen.add(record.id);
    const reason = evidenceExclusion(record);
    if (reason) { exclusions.set(reason, (exclusions.get(reason) ?? 0) + 1); continue; }
    const key = experimentKey(record); experiments.set(key, [...(experiments.get(key) ?? []), record]);
  }
  const groups = new Map<string, { before: CaptureRecord[]; after: CaptureRecord[]; changed: string[] }>();
  for (const [experiment, runs] of experiments) {
    const unused: CaptureRecord[] = [];
    for (const record of [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
      if (record.phase === 'before') { unused.push(record); continue; }
      let index = -1;
      for (let i = unused.length - 1; i >= 0; i--) { const before = unused[i]; if (Date.parse(before.endedAt!) < Date.parse(record.startedAt) && signature(before) !== signature(record)) { index = i; break; } }
      if (index < 0) continue;
      const before = unused.splice(index, 1)[0];
      const key = experiment + '|' + signature(before) + '→' + signature(record);
      const changed = supported.filter(id => before.settings.tweaks.find(t => t.id === id)!.fingerprint !== record.settings.tweaks.find(t => t.id === id)!.fingerprint);
      if (!changed.length) continue;
      const group = groups.get(key) ?? { before: [], after: [], changed };
      group.before.push(before); group.after.push(record); groups.set(key, group);
    }
  }
  const findings: BenchmarkEvidence[] = [];
  for (const [key, group] of groups) {
    const delta = (metric: 'averageFps' | 'onePercentLow' | 'p95FrameMs') => group.before.map((before, i) => (group.after[i].summary![metric]! / before.summary![metric]! - 1) * 100);
    const averages = delta('averageFps'), lows = delta('onePercentLow'), times = delta('p95FrameMs');
    const averageChange = median(averages), lowChange = median(lows), frameTimeChange = median(times);
    const spread = (runs: CaptureRecord[], metric: 'averageFps' | 'onePercentLow') => { const values = runs.map(r => r.summary![metric]!); return (Math.max(...values) - Math.min(...values)) / median(values); };
    const noisy = [group.before, group.after].some(runs => spread(runs, 'averageFps') > .1 || spread(runs, 'onePercentLow') > .15);
    const obsWorse = group.before.some((b, i) => {
      const a = group.after[i];
      return ['renderingLagPercent', 'encodingLagPercent', 'networkDropPercent'].some(key => {
        const metric = key as 'renderingLagPercent', oldValue = b.telemetrySummary?.obs[metric], value = a.telemetrySummary?.obs[metric];
        return oldValue != null && value != null && value > oldValue + 1;
      });
    });
    const needsObs = group.before[0].context !== 'Gaming';
    const obsMissing = needsObs && [...group.before, ...group.after].some(r => !r.telemetrySummary?.obs.samples || r.telemetrySummary.obs.renderingLagPercent == null || r.telemetrySummary.obs.encodingLagPercent == null || (r.context === 'Streaming' ? !r.telemetrySummary.obs.streaming || r.telemetrySummary.obs.networkDropPercent == null : !r.telemetrySummary.obs.recording));
    let verdict: BenchmarkEvidence['verdict'] = 'inconclusive', reason = 'Changes are small or inconsistent. Keep testing before choosing a configuration.';
    if (group.before.length < 3) { verdict = 'collect-more'; reason = 'Collect at least three independent Before/After pairs with the same two configurations. A baseline is never reused.'; }
    else if (noisy) reason = 'Run-to-run variation is high (over 10% average FPS or 15% lows). Improve repeatability before choosing settings.';
    else if (obsWorse) reason = 'OBS lag or stream drops worsened by over one percentage point in at least one pair. Review the FPS/creation tradeoff.';
    else if (((averageChange >= 3 && averages.every(v => v > 0)) || (lowChange >= 3 && lows.every(v => v > 0))) && averages.every(v => v >= -2) && lows.every(v => v >= -2) && times.every(v => v <= 2)) { verdict = 'improved'; reason = 'Repeated runs favor the After configuration. Consider keeping this tested configuration, then verify it in actual play.'; }
    else if ((averageChange <= -3 && averages.every(v => v < 0)) || (lowChange <= -5 && lows.every(v => v < 0)) || (frameTimeChange >= 5 && times.every(v => v > 0))) { verdict = 'regressed'; reason = 'Repeated runs show a performance regression. Review the tested changes and consider restoring their backup before retesting.'; }
    const first = group.before[0];
    if (obsMissing) reason += ' This is an FPS-only finding. Stream/recording quality was not assessed because matching output/lag measurements were unavailable; OBS is optional.';
    findings.push({ key, experiment: first.benchmark!.experiment, processName: first.processName, context: first.context, scope: needsObs && !obsMissing ? 'fps-and-obs' : 'fps-only', hardwareKey: first.hardwareKey!, changedIds: group.changed, pairs: group.before.length, verdict, averageChange, lowChange, frameTimeChange, beforeIds: group.before.map(r => r.id), afterIds: group.after.map(r => r.id), reason });
  }
  return { findings, exclusions: [...exclusions].map(([reason, count]) => ({ reason, count })) };
}
