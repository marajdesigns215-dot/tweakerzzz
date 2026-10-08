import { useState } from 'react';
import { ArrowRight, FlaskConical, ScanLine, Sparkles } from 'lucide-react';
import type { CaptureOptions, CaptureRecord, SystemScan, TweakStatusReport } from '../types';
import { tweaks } from '../data/tweaks';
import { recommend } from '../lib/recommendations';
import { analyzeBenchmarks } from '../lib/benchmark-evidence';

export function GameAdvisor({ options, hardware, settings, records, disabled, scan, review, details, restore }: { options: CaptureOptions; hardware: SystemScan | null; settings: TweakStatusReport | null; records: CaptureRecord[]; disabled: boolean; scan: () => void; review: (ids: string[]) => void; details: (id: string) => void; restore: () => void }) {
  const [usesWindowsCapture, setUsesWindowsCapture] = useState(true);
  const [telemetryId, setTelemetryId] = useState('');
  const matching = records.filter(r => r.status === 'completed' && r.processName.toLowerCase() === options.processName.toLowerCase() && r.context === options.context);
  const telemetryRun = matching.find(r => r.id === telemetryId);
  const sameHardware = hardware && telemetryRun?.hardware && JSON.stringify([hardware.cpu, hardware.gpu, hardware.memory, hardware.os]) === JSON.stringify([telemetryRun.hardware.cpu, telemetryRun.hardware.gpu, telemetryRun.hardware.memory, telemetryRun.hardware.os]);
  const advice = recommend({ processName: options.processName, context: options.context, hardware, settings, telemetry: sameHardware ? telemetryRun?.telemetrySummary ?? undefined : undefined, usesWindowsCapture });
  const evidence = analyzeBenchmarks(matching);
  const statusLabel = { improved: 'Repeated improvement', regressed: 'Repeated regression', inconclusive: 'Inconclusive', 'collect-more': 'More runs needed' };
  return <section className="panel game-advisor">
    <div className="section-heading"><div><span className="eyebrow"><Sparkles size={14}/> BUILT FOR YOUR NEXT TEST</span><h2>Game & hardware recommendations</h2></div><button className="button secondary" disabled={!window.tweaker || disabled} onClick={scan}><ScanLine size={16}/>Scan for recommendations</button></div>
    <div className="advisor-profile"><span className="pill lime">{advice.game.name}</span><span className="pill">{options.context}</span><p>{advice.game.note}</p></div>
    <p className="body-copy">{hardware ? `${hardware.cpu.name} · ${hardware.gpu.name} · ${hardware.memory.totalGB ?? 'Unknown'} GB RAM` : 'Scan this PC to add hardware-specific suggestions. Reference or imported specs are not treated as a live scan.'}</p>
    <p className="fine-print">These are local rules and measurements, not predicted FPS gains. Game feature availability depends on the current patch and rendering mode. Current Windows state is checked before applying a plan.</p>
    {options.context !== 'Gaming' && <label className="check-label"><input type="checkbox" checked={usesWindowsCapture} onChange={e => setUsesWindowsCapture(e.target.checked)}/>I use Windows Game Bar recording or background replays</label>}
    <label className="advisor-select">ADD MEASURED SIGNALS FROM A RUN<select value={telemetryId} onChange={e => setTelemetryId(e.target.value)}><option value="">Hardware and workload guidance only</option>{matching.filter(r => r.telemetrySummary).map(r => <option key={r.id} value={r.id}>{r.scenario} · {r.phase} · {new Date(r.startedAt).toLocaleString()}</option>)}</select></label>
    {telemetryRun && !sameHardware && <p className="callout">Scan the PC first. Measured signals are added only when its detected hardware, graphics driver, RAM, and Windows build match this recording.</p>}
    <div className="advisor-cards">{advice.items.map(item => <article className="advisor-card" key={item.id}>
      <div className="advisor-card-top"><span className="pill">{item.priority}</span><span className="quiet-label">{item.mode === 'automatic' ? 'BACKUP & REVIEW' : 'GUIDED TEST'}</span></div><h3>{item.title}</h3><p>{item.reason}</p><p className="advisor-tradeoff"><strong>Tradeoff:</strong> {item.tradeoff}</p>
      {item.mode === 'automatic' ? <button className="button primary" disabled={disabled || !window.tweaker || item.configured || !item.stateKnown} onClick={() => review([item.id])}>{item.configured ? 'Already configured — skipped' : !item.stateKnown ? 'Check Windows state first' : 'Review this tweak'}<ArrowRight size={15}/></button> : tweaks.some(t => t.id === item.id) && <button className="button secondary" onClick={() => details(item.id)}>Read setup guide<ArrowRight size={15}/></button>}
    </article>)}</div>
    {!options.processName && <p className="callout">Select a game or executable above to see its recommendations.</p>}
    <div className="evidence-heading"><FlaskConical size={22}/><h2>What your repeated tests show</h2></div><p className="body-copy">Use a named experiment and at least three separate Before and three After runs. Match the scene, game build, graphics, cap, duration, hardware, driver, and telemetry mode. Warm up the scene and confirm the conditions for each run.</p>
    {evidence.findings.length ? evidence.findings.map(finding => <article className={`evidence-card ${finding.verdict}`} key={finding.key}>
      <span className="pill">{statusLabel[finding.verdict]}</span><span className="pill">{finding.scope === 'fps-only' ? 'FPS only' : 'FPS + OBS quality'}</span><h3>{finding.experiment}</h3><p>{finding.reason}</p><div className="evidence-numbers"><span>{finding.pairs} independent pairs</span><span>Avg FPS {finding.averageChange.toFixed(1)}%</span><span>1% lows {finding.lowChange.toFixed(1)}%</span><span>P95 {finding.frameTimeChange.toFixed(1)}%</span></div>
      <p><strong>Changed together:</strong> {finding.changedIds.map(id => tweaks.find(t => t.id === id)?.title ?? id).join(', ')}</p><p className="fine-print">{finding.changedIds.length > 1 ? 'This result applies to the tested group. Test one tweak at a time to investigate individual effects.' : 'Even repeated results do not establish causation. Untracked game/driver settings, temperatures, and background work can still differ.'} This finding is for its recorded configuration; it does not automatically apply to your current PC settings.</p>
      <details><summary>Recordings used</summary><p className="fine-print">Before: {finding.beforeIds.join(', ')}<br/>After: {finding.afterIds.join(', ')}</p></details><button className="button secondary" onClick={restore}>Review restore options</button>
    </article>) : <p className="callout">No matched configuration changes yet. Ordinary recordings remain comparable, but recommendations from experiments require complete hardware and exact start/end settings snapshots, confirmed conditions, and at least 60 seconds of samples per run.</p>}
    {!!evidence.exclusions.length && <details className="evidence-exclusions"><summary>Why some runs are not used as evidence</summary><ul>{evidence.exclusions.map(item => <li key={item.reason}>{item.count} run(s): {item.reason}</li>)}</ul></details>}
    <p className="fine-print">A gain must exceed a 3% median change and agree across independent pairs without worsening lows or P95 by more than 2%. High run-to-run variation is inconclusive. FPS findings work in every workload without OBS. Optional valid OBS counters add stream/recording-quality checks. These are conservative screening rules, not a statistical significance test. Nothing is applied or reverted automatically.</p>
  </section>;
}
