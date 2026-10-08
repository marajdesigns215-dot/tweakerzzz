import { useEffect, useState } from 'react';
import { Activity, Download, LoaderCircle, Minimize2, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import type { CaptureOptions, CaptureRecord, CaptureStatus, SystemScan, TweakStatusReport } from '../types';
import { compareCaptures } from '../lib/capture-comparison';
import { tweaks } from '../data/tweaks';
import { GameAdvisor } from './GameAdvisor';
import { ObsConnection, TelemetryReport } from './ObsConnection';
import { gameProfiles } from '../data/game-profiles';
import { parseHardwareReport } from '../lib/reports';
import { Diagnostics } from './SystemStatus';

const format = (value: number | null | undefined, suffix = '') => value == null ? '—' : value.toFixed(1) + suffix;
const difference = (value: number | null | undefined) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
export function PerformanceLab({ hardware, settings, onHardware, refreshSettings, review, details, restore }: { hardware: SystemScan | null; settings: TweakStatusReport | null; onHardware: (hardware: SystemScan) => void; refreshSettings: () => Promise<unknown>; review: (ids: string[]) => void; details: (id: string) => void; restore: () => void }) {
  const native = !!window.tweaker;
  const [options, setOptions] = useState<CaptureOptions>({ processName: '', phase: 'before', context: 'Gaming', seconds: 300, scenario: '' });
  const [programs, setPrograms] = useState<string[]>([]);
  const [status, setStatus] = useState<CaptureStatus>({ active: false });
  const [records, setRecords] = useState<CaptureRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [beforeId, setBeforeId] = useState(''), [afterId, setAfterId] = useState('');
  const [removing, setRemoving] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!window.tweaker) return;
    let disposed = false, polling = false;
    const refresh = async () => {
      if (polling) return; polling = true;
      try {
        const [current, history] = await Promise.all([window.tweaker!.captureStatus(), window.tweaker!.listCaptures()]);
        if (!disposed) { setStatus(current); setRecords(history); setNow(Date.now()); }
      } catch (e) { if (!disposed) setError(String(e)); }
      finally { polling = false; }
    };
    void refresh(); const timer = setInterval(refresh, 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); setStatus(await window.tweaker!.captureStatus()); setRecords(await window.tweaker!.listCaptures()); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  const before = records.find(r => r.id === beforeId);
  const after = records.find(r => r.id === afterId);
  const comparison = before && after ? compareCaptures(before, after) : null;
  const optionsFor = (phase: 'before' | 'after') => records.filter(r => r.phase === phase && r.status === 'completed');
  const benchmarkInvalid = options.benchmark && ['experiment', 'resolution', 'graphics', 'gameBuild'].some(key => !(options.benchmark![key as 'experiment']).trim());
  const elapsed = status.active && status.startedAt ? Math.max(0, Math.floor((now - Date.parse(status.startedAt)) / 1000)) : 0;
  function exportSummary(record: CaptureRecord) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Tweakerzzz-${record.processName}-${record.phase}-${record.id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="performance-lab">
    <div className="notice-panel"><Activity size={22}/><div><strong>Standalone FPS recorder · OBS is not required.</strong><p>Record a repeatable scene before changes, apply your tweaks, then repeat it as an After run. Use the same resolution, graphics, FPS cap, and streaming or recording workload. Game FPS, 1% lows, frame times, and before/after comparisons work without an OBS connection.</p></div></div>
    {!native && <p className="callout">FPS recording requires the Windows desktop app. The browser preview cannot measure frames from other programs.</p>}
    <Diagnostics title="FPS recording needs attention" error={error}/>
    <section className="panel capture-panel">
      <h2>{status.active ? 'Recording in progress' : 'Start a recording'}</h2>
      {status.active ? <>
        <div className="capture-running" role="status"><span className="status-light"/><strong>{status.processName || 'Preparing collector…'}</strong><span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} elapsed · {status.frames.toLocaleString()} frame samples</span></div>
        <p className="body-copy">{status.phase} · {status.context} · {status.scenario}</p>
        <p className="body-copy">Closing the window keeps this recording running in the system tray. It stops at the chosen time limit. Quit from the tray to stop and exit.</p>
        {elapsed > 15 && status.frames === 0 && <p className="callout">Waiting for frames. Bring the game into view and check its executable name. If this run ends without frames, it will be marked unsuccessful.</p>}
        <div className="button-row"><button className="button primary" disabled={busy || status.stopping || !status.id} onClick={() => action(() => window.tweaker!.stopCapture())}><Square size={16}/>{status.stopping ? 'Finishing…' : 'Stop & save'}</button><button className="button secondary" onClick={() => action(() => window.tweaker!.minimizeToTray())}><Minimize2 size={16}/>Minimize to tray</button></div>
      </> : <>
        <div className="capture-form">
          <label>GAME PROFILE<select aria-label="Game profile" value={gameProfiles.find(game => game.executables.includes(options.processName.toLowerCase()))?.id ?? 'generic'} onChange={e => { const game = gameProfiles.find(item => item.id === e.target.value)!; setOptions({ ...options, processName: game.executables[0] ?? '' }); }}><option value="generic">Other game / enter an executable</option>{gameProfiles.filter(g => g.id !== 'generic').map(game => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label><p className="fine-print">Choose a known game or its actual executable below. Suggestions follow the selected game and your scan.</p>
          <label>GAME OR PROGRAM EXECUTABLE<input list="running-programs" placeholder="Example: game.exe" value={options.processName} maxLength={115} onChange={e => setOptions({ ...options, processName: e.target.value })}/><datalist id="running-programs">{programs.map(name => <option key={name} value={name}/>)}</datalist></label>
          <button className="button secondary" disabled={!native || busy} onClick={() => action(async () => setPrograms(await window.tweaker!.listPrograms()))}><RotateCcw size={16}/>Find running programs</button>
          <label>PHASE<select value={options.phase} onChange={e => setOptions({ ...options, phase: e.target.value as CaptureOptions['phase'] })}><option value="before">Before tweaks</option><option value="after">After tweaks</option></select></label>
          <label>WORKLOAD<select value={options.context} onChange={e => setOptions({ ...options, context: e.target.value as CaptureOptions['context'] })}><option>Gaming</option><option>Streaming</option><option>Recording</option></select></label>
          <label>STOP AFTER<select value={options.seconds} onChange={e => setOptions({ ...options, seconds: Number(e.target.value) })}>{[30, 60, 180, 300, 600, 1800, 3600].map(s => <option key={s} value={s}>{s < 60 ? '30 seconds' : `${s / 60} minutes`}</option>)}</select></label>
          <label className="scenario-input">SCENE & SETTINGS<input placeholder="Example: built-in benchmark · 1080p Low · 240 FPS cap" maxLength={160} value={options.scenario} onChange={e => setOptions({ ...options, scenario: e.target.value })}/></label>
        </div>
        <label className="check-label"><input type="checkbox" checked={!!options.benchmark} onChange={e => setOptions({ ...options, benchmark: e.target.checked ? { experiment: '', resolution: '', graphics: '', gameBuild: '', fpsCap: 0, verified: false } : undefined })}/>Use controlled benchmark conditions for recommendations from repeated runs</label>
        {options.benchmark && <div className="benchmark-conditions"><div className="capture-form">{([['experiment', 'EXPERIMENT NAME', 'Example: Game Mode test'], ['resolution', 'GAME RESOLUTION', 'Example: 1920 × 1080'], ['graphics', 'GRAPHICS, UPSCALING & FRAME GENERATION', 'Example: Low · DLSS off · FG off'], ['gameBuild', 'GAME BUILD / PATCH', 'Copy the game version']] as const).map(([key, label, placeholder]) => <label key={key}>{label}<input maxLength={120} value={options.benchmark![key]} placeholder={placeholder} onChange={e => setOptions({ ...options, benchmark: { ...options.benchmark!, [key]: e.target.value } })}/></label>)}<label>FPS CAP · 0 = UNCAPPED<input type="number" min={0} max={2000} step={1} value={options.benchmark.fpsCap} onChange={e => setOptions({ ...options, benchmark: { ...options.benchmark!, fpsCap: Number(e.target.value) } })}/></label></div><label className="check-label"><input type="checkbox" checked={options.benchmark.verified} onChange={e => setOptions({ ...options, benchmark: { ...options.benchmark!, verified: e.target.checked } })}/>I warmed up this scene and kept the game, any streaming/recording software, driver options, and other workload settings consistent except for the supported tweaks being tested.</label><p className="fine-print">Use at least 60 seconds of gameplay per run. Repeat each configuration three times; the app pairs independent runs without reusing baselines. Hardware, driver version, and exact supported tweak values are captured automatically.</p></div>}
        <label className="check-label"><input type="checkbox" checked={!!options.telemetry} onChange={e => setOptions({ ...options, telemetry: e.target.checked })}/>Record extra CPU/RAM and supported GPU temperature/load (OBS not required)</label><p className="fine-print">Extra sampling adds overhead; use the same choice before and after. NVIDIA GPU counters are supported where the driver exposes them. CPU package temperature uses an existing Libre Hardware Monitor WMI provider when available. No sensor driver is installed; missing readings stay unavailable.</p>
        <ObsConnection disabled={busy || status.active}/>
        <p className="fine-print">Launch the game first. Use its game process, which may differ from the launcher. Streaming and Recording label your workload; start your preferred streaming/recording software separately if you use it. Connecting OBS is optional in every mode. Windows may require running Tweakerzzz as administrator under the same account to collect FPS.</p>
        <button className="button primary" disabled={!native || busy || !options.processName || !options.scenario.trim() || !!benchmarkInvalid} onClick={() => action(() => window.tweaker!.startCapture(options))}>{busy ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>}Start background recording</button>
      </>}
    </section>
    <GameAdvisor options={options} hardware={hardware} settings={settings} records={records} disabled={busy || status.active} scan={() => action(async () => { onHardware(parseHardwareReport(await window.tweaker!.scan())); await refreshSettings(); })} review={review} details={details} restore={restore}/>
    <section className="panel comparison-panel"><h2>Before & after</h2><p className="body-copy">Select completed runs of the same executable, workload, and scene. The After run must be newer.</p><div className="capture-form">
      <label>BEFORE RUN<select value={beforeId} onChange={e => setBeforeId(e.target.value)}><option value="">Select a baseline</option>{optionsFor('before').map(r => <option key={r.id} value={r.id}>{r.processName} · {r.scenario} · {new Date(r.startedAt).toLocaleString()}</option>)}</select></label>
      <label>AFTER RUN<select value={afterId} onChange={e => setAfterId(e.target.value)}><option value="">Select a newer run</option>{optionsFor('after').map(r => <option key={r.id} value={r.id}>{r.processName} · {r.scenario} · {new Date(r.startedAt).toLocaleString()}</option>)}</select></label>
    </div>
      {before && after && !comparison && <p className="callout">These runs are not comparable. Match the executable, workload, scene, hardware/driver, benchmark conditions, and telemetry choice, and choose a newer After recording.</p>}
      {comparison && <><div className="table-scroll"><table className="fps-table"><thead><tr><th>Measurement</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>{[
        ['Average FPS', format(before?.summary?.averageFps), format(after?.summary?.averageFps), difference(comparison.average)],
        ['1% low FPS', format(before?.summary?.onePercentLow), format(after?.summary?.onePercentLow), difference(comparison.low)],
        ['95th percentile frame time ↓', format(before?.summary?.p95FrameMs, ' ms'), format(after?.summary?.p95FrameMs, ' ms'), difference(comparison.frameTime)],
        ...((before?.telemetrySummary?.obs.samples || after?.telemetrySummary?.obs.samples) ? [['OBS rendering lag', format(before?.telemetrySummary?.obs.renderingLagPercent, '%'), format(after?.telemetrySummary?.obs.renderingLagPercent, '%'), 'Lower is better'], ['OBS encoding lag', format(before?.telemetrySummary?.obs.encodingLagPercent, '%'), format(after?.telemetrySummary?.obs.encodingLagPercent, '%'), 'Lower is better'], ['OBS stream drops', format(before?.telemetrySummary?.obs.networkDropPercent, '%'), format(after?.telemetrySummary?.obs.networkDropPercent, '%'), 'Lower is better']] : []),
      ].map(row => <tr key={row[0]}>{row.map((cell, i) => i === 0 ? <th key={i}>{cell}</th> : <td key={i}>{cell}</td>)}</tr>)}</tbody></table></div>
        <p className="body-copy">Detected tweak status changes: {comparison.changed.length ? comparison.changed.map(id => tweaks.find(t => t.id === id)?.title || id).join(', ') : 'None among the supported automatic settings.'}</p>
        {comparison.shortRun && <p className="callout">At least one run contains fewer than 30 seconds of frame samples. Capture a longer repeatable scene before drawing conclusions.</p>}
        <p className="fine-print">Differences are measured observations, not proof a tweak caused a gain. Repeat runs to account for scene variation, temperatures, caches, and background tasks. The snapshot records saved tweak states; it cannot confirm restart completion or detect every external setting change.</p>
      </>}
    </section>
    <div className="section-heading"><h2>Recording history</h2><span className="quiet-label">LOCAL ONLY · {records.length} / 100 RUNS</span></div>
    {!records.length && <p className="panel body-copy">Your completed and unsuccessful recordings will appear here. No sample results are invented.</p>}
    <div className="recording-list">{records.map(record => <article className="panel recording-card" key={record.id}>
      <div className="recording-title"><div><span className="eyebrow">{record.phase} · {record.context} · {record.status}</span><h3>{record.processName}</h3><p>{record.scenario}</p><small>{new Date(record.startedAt).toLocaleString()} · {record.stopReason}</small></div><Activity size={23}/></div>
      {record.error && <p className="callout" role="alert">{record.error}</p>}
      {record.summary && <><div className="fps-stats"><div><strong>{format(record.summary.averageFps)}</strong><span>AVERAGE FPS</span></div><div><strong>{format(record.summary.onePercentLow)}</strong><span>1% LOW FPS</span></div><div><strong>{format(record.summary.p95FrameMs, ' ms')}</strong><span>P95 FRAME TIME</span></div></div><p className="fine-print">{record.summary.frames.toLocaleString()} frames · {format(record.summary.sampledSeconds, ' sampled seconds')} · primary process {record.summary.processId} · {record.summary.otherStreamFrames.toLocaleString()} frames from other streams excluded · {record.summary.invalidFrames} invalid/zero intervals excluded.</p></>}
      <TelemetryReport data={record.telemetrySummary}/><p className="fine-print">{record.hardware ? `${record.hardware.cpu.name} · ${record.hardware.gpu.name} · ${record.hardware.memory.totalGB ?? 'Unknown'} GB RAM · GPU driver ${record.hardware.gpu.driverVersion ?? 'unavailable'}` : 'This older run has no hardware snapshot.'}</p>
      <details><summary>Saved tweak states & collector notes</summary><p className="fine-print">{record.collector} · {record.settings.checkedAt}</p>{record.settings.tweaks.map(t => <div className="snapshot-setting" key={t.id}><span>{tweaks.find(item => item.id === t.id)?.title || t.id}</span><span>{t.status}</span></div>)}{record.collectorWarnings && <pre className="collector-notes">{record.collectorWarnings}</pre>}</details>
      <div className="button-row"><button className="button secondary" disabled={busy || status.active} onClick={() => setOptions({ processName: record.processName, context: record.context, scenario: record.scenario, seconds: record.seconds, telemetry: record.telemetry, benchmark: record.benchmark ? { ...record.benchmark, verified: false } : undefined, phase: 'after' })}>Use for After run</button><button className="button secondary" disabled={busy} onClick={() => action(() => window.tweaker!.exportCapture(record.id))}><Download size={15}/>Export CSV</button><button className="button secondary" onClick={() => exportSummary(record)}>Export summary</button><button className="icon-button" aria-label={`Delete recording ${record.id}`} disabled={busy} onClick={() => setRemoving(record.id)}><Trash2 size={18}/></button></div>
      {removing === record.id && <div className="callout delete-confirm"><p>Delete this local recording and its raw CSV permanently?</p><button className="button secondary" disabled={busy} onClick={() => setRemoving('')}>Keep</button><button className="button secondary" disabled={busy} onClick={() => action(async () => { await window.tweaker!.deleteCapture(record.id); setRemoving(''); })}>Delete recording</button></div>}
    </article>)}</div>
    <details className="panel measurement-notes"><summary>How FPS is measured</summary><p className="body-copy">PresentMon observes Windows graphics events without injecting into games. Results describe application presentation cadence, not displayed FPS or OBS dropped frames. The busiest process/swap chain is selected so menus, overlays, and secondary render streams are not added together. Verify it represents the gameplay you tested.</p><p className="body-copy">Average FPS = 1,000 ÷ mean frame time. The 1% low is 1,000 ÷ the mean of the slowest 1% of frames (at least 100 samples required). P95 is the 95th percentile frame time; lower is better. Pauses and loading screens count, so record the same scene each time.</p><p className="body-copy">Each recording is capped at 60 minutes, 64 MB of CSV, or two million frame samples. Logs remain on your PC until you delete them; exported files are yours to manage. Capture adds some overhead. No FPS gains are guaranteed.</p></details>
  </div>;
}
