import { useState } from 'react';
import type { CaptureRecord, FrameDistribution } from '../types';
import { performanceDiagnostics } from '../lib/performance-diagnostics';
import { captureQualityIssues } from '../lib/capture-quality';
const format = (value: number | null | undefined, suffix = '') => value == null ? 'Unavailable' : value.toFixed(1) + suffix;
function FpsNumbers({ data }: { data: FrameDistribution }) {
  return <div className="fps-stats report-fps-stats">
    <div><strong>{format(data.highestFps)}</strong><span>HIGHEST FPS · ≥1 S WINDOW</span></div>
    <div><strong>{format(data.averageFps)}</strong><span>AVERAGE FPS · ENTIRE RUN</span></div>
    <div><strong>{format(data.onePercentLow)}</strong><span>1% LOW FPS · SLOWEST FRAMES</span></div>
  </div>;
}
function FpsTimeline({ data }: { data: FrameDistribution }) {
  const [selection, setSelection] = useState(0);
  const points = data.timeline ?? [];
  if (!points.length) return <p className="fine-print">A timeline requires at least one second of usable frame intervals. Older reports need recalculation from the original CSV.</p>;
  const ceiling = Math.max(10, Math.ceil(Math.max(...points.map(p => p.averageFps)) / 50) * 50);
  const duration = points.at(-1)!.endSecond;
  const x = (i: number) => 46 + (points[i].startSecond + points[i].endSecond) / 2 / duration * 708;
  const y = (i: number) => 184 - points[i].averageFps / ceiling * 155;
  const selected = points[Math.min(selection, points.length - 1)];
  return <div className="fps-timeline">
    <h4>FPS across the run</h4>
    <svg viewBox="0 0 780 216" role="img" aria-label="Application FPS timeline. Use the interval slider or data table for exact measurements.">
      {[0, .5, 1].map(f => <g key={f}><line x1="46" y1={184 - f * 155} x2="754" y2={184 - f * 155} className="chart-grid"/><text x="4" y={188 - f * 155}>{Math.round(ceiling * f)}</text></g>)}
      <polyline points={points.map((_, i) => `${x(i)},${y(i)}`).join(' ')} fill="none" className="fps-line"/>
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(i)} r={selection === i ? 5 : 2.5} tabIndex={0} role="button" aria-label={`${p.startSecond.toFixed(1)} to ${p.endSecond.toFixed(1)} seconds: ${p.averageFps.toFixed(1)} FPS`} onClick={() => setSelection(i)} onFocus={() => setSelection(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelection(i); } }}><title>{p.averageFps.toFixed(1)} FPS · {p.startSecond.toFixed(1)}–{p.endSecond.toFixed(1)} s</title></circle>)}
      <text x="46" y="207">0 s</text><text x="674" y="207">{duration.toFixed(1)} s</text>
    </svg>
    <label className="timeline-control">Explore a time interval<input type="range" aria-label="Timeline interval" min={0} max={points.length - 1} value={Math.min(selection, points.length - 1)} onChange={e => setSelection(Number(e.target.value))}/></label>
    <p aria-live="polite" className="fine-print"><strong>{selected.averageFps.toFixed(1)} FPS</strong> · {selected.startSecond.toFixed(1)}–{selected.endSecond.toFixed(1)} seconds of sampled time · {selected.frames.toLocaleString()} frame intervals.</p>
    <p className="fine-print">Up to 120 complete time windows. This helps locate slower sections; it cannot identify menus, loading screens or the cause of a hitch automatically.</p>
    <details><summary>Timeline data table</summary><div className="table-scroll"><table className="fps-table"><thead><tr><th>Sampled seconds</th><th>Average FPS</th></tr></thead><tbody>{points.map((p, i) => <tr key={i}><td>{p.startSecond.toFixed(1)}–{p.endSecond.toFixed(1)}</td><td>{p.averageFps.toFixed(1)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
export function FrameReport({ record }: { record: CaptureRecord }) {
  const s = record.summary;
  if (!s) return null;
  const issues = captureQualityIssues(record), advice = performanceDiagnostics(record);
  return <section className="frame-report" aria-label="FPS and performance report">
    <h4>Application FPS <span className="quiet-label">{s.measurementBasis === 'cpu-start-interval' ? 'DISTINCT FRAME STARTS' : 'OLDER CALCULATION'}</span></h4>
    {issues.length > 0 && <div className="callout"><strong>Measurement needs review</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
    <FpsNumbers data={s}/>
    <p className="fine-print">{s.frames.toLocaleString()} frame intervals · {format(s.sampledSeconds, ' sampled seconds')} · process {s.processId} · {s.otherStreamFrames.toLocaleString()} intervals from other streams excluded · {s.invalidFrames} invalid rows excluded.</p>
    {s.duplicateRows != null && <p className="fine-print">{s.duplicateRows.toLocaleString()} repeated frame-start rows excluded from application FPS. The first start establishes the clock; each subsequent distinct start completes one interval.</p>}
    <div className="telemetry-grid frame-details">{[
      ['Lowest FPS · ≥1 s window', format(s.lowestFps)], ['0.1% low FPS', format(s.pointOnePercentLow)],
      ['Mean frame time', format(s.meanFrameMs, ' ms')], ['P95 frame time', format(s.p95FrameMs, ' ms')],
      ['P99 frame time', format(s.p99FrameMs, ' ms')], ['Longest frame interval', format(s.worstFrameMs, ' ms')],
      ['Frame-time standard deviation', format(s.frameTimeStdDevMs, ' ms')],
      ['Intervals over 50 ms', s.slowFrames50ms?.toLocaleString() ?? 'Unavailable'], ['Intervals over 100 ms', s.slowFrames100ms?.toLocaleString() ?? 'Unavailable'],
    ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p className="fine-print">Highest/lowest use complete consecutive windows of at least one second; the final partial window is excluded only from these peaks. Averages and lows include all valid intervals, including pauses. The 0.1% low requires 1,000 intervals. Percentiles and standard deviation describe frame pacing, not input latency.</p>
    <FpsTimeline data={s}/>
    <details className="display-fps"><summary>Displayed FPS · a separate measurement</summary>{s.displayed ? <><FpsNumbers data={s.displayed}/><p className="fine-print">{s.displayed.frames.toLocaleString()} displayed intervals · {s.notDisplayedFrames ?? 'Unknown'} application intervals marked not displayed. Displayed cadence may include generated/repeated frames; it does not measure unique game simulation frames or monitor refresh rate. Frame-type identification varies by provider.</p></> : <p className="fine-print">{s.displayTracking ? 'No usable display timings were reported by this capture. Displayed FPS is unavailable.' : 'This recording did not collect display timings. A new recording is needed; recalculation cannot recreate missing display events.'}</p>}</details>
    <details className="diagnostic-advice" open><summary>Performance diagnostics & next tests</summary><p className="fine-print">Suggestions are reviewable tests, not automatic tweaks or confirmed bottleneck diagnoses.</p><div className="diagnostic-cards">{advice.map(item => <article key={item.id}><h4>{item.title}</h4><p>{item.evidence}</p><p><strong>Next test:</strong> {item.nextStep}</p></article>)}</div></details>
    <details><summary>Measurement source & render streams</summary><p className="fine-print">{record.collector} · {s.measurementBasis === 'cpu-start-interval' ? 'Consecutive distinct CPUStartTime intervals, in milliseconds.' : 'Legacy FrameTime values; frame-start validation is unavailable.'} The stream with the most application intervals is selected. Verify it represents gameplay; no other streams are added to its FPS.</p><p className="fine-print">Presentation API: {s.runtimes?.join(', ') || 'Not saved'} · Modes: {s.presentModes?.join(', ') || 'Not saved'} · Identified generated rows: {s.generatedFrameRows ?? 'Not saved'} · Zero-duration rows: {s.zeroFrameRows ?? 'Not saved'}</p>{s.streams && <ul className="fine-print">{s.streams.map(stream => <li key={`${stream.processId}:${stream.swapChain}`}>PID {stream.processId} · {stream.swapChain} · {stream.frames.toLocaleString()} intervals · {stream.sampledSeconds.toFixed(1)} seconds</li>)}</ul>}</details>
  </section>;
}
