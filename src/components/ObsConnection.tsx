import { useEffect, useState } from 'react';
import type { TelemetrySummary } from '../types';
export function ObsConnection({ disabled }: { disabled: boolean }) {
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [password, setPassword] = useState(''), [port, setPort] = useState(4455);
  useEffect(() => {
    if (!window.tweaker?.obsStatus) return;
    let active = true;
    const poll = () => window.tweaker!.obsStatus().then(result => { if (active) setConnected(result.connected); }).catch(() => { if (active) setConnected(false); });
    void poll(); const timer = setInterval(poll, 5000); return () => { active = false; clearInterval(timer); };
  }, []);
  async function connect() {
    setBusy(true); setError('');
    try { setConnected((await window.tweaker!.connectObs({ port, password })).connected); }
    catch (e) { setError(String(e)); } finally { setPassword(''); setBusy(false); }
  }
  return <details className="obs-connection"><summary>Optional OBS lag measurements · {connected ? 'Connected locally' : 'Not connected'}</summary><p className="body-copy">You can skip this section. FPS recording and comparison work without OBS in every workload. Connect only to add OBS-specific rendering lag, encoding lag, and dropped-frame counters. In OBS, open Tools → WebSocket Server Settings, enable the server, and copy its port/password here. Only this PC (127.0.0.1) is supported. The app reads statistics; it cannot start streams or change OBS settings.</p>{error && <p role="alert" className="callout">{error}</p>}
    <div className="capture-form"><label>OBS PORT<input type="number" min={1024} max={65535} value={port} disabled={busy || disabled || connected} onChange={e => setPort(Number(e.target.value))}/></label><label>OBS PASSWORD<input type="password" value={password} autoComplete="off" disabled={busy || disabled || connected} onChange={e => setPassword(e.target.value)} maxLength={256}/></label></div>
    {connected ? <button className="button secondary" disabled={disabled || busy} onClick={async () => { try { await window.tweaker!.disconnectObs(); setConnected(false); } catch (e) { setError(String(e)); } }}>Disconnect OBS</button> : <button className="button secondary" disabled={!window.tweaker || disabled || busy} onClick={connect}>{busy ? 'Connecting…' : 'Connect to OBS'}</button>}
    <p className="fine-print">The password is held in memory only, then cleared. Reconnect after restarting Tweakerzzz. Enable extra measurements above to record OBS lag. Start the chosen stream/recording before the FPS run and keep it active throughout.</p></details>;
}
export function TelemetryReport({ data }: { data?: TelemetrySummary | null }) {
  if (!data) return <p className="fine-print">Extra measurements were not enabled for this run.</p>;
  const number = (value: number | null | undefined, unit: string) => value == null ? 'Unavailable' : `${value.toFixed(1)}${unit}`;
  const hasObs = data.obs.enabled ?? data.obs.samples > 0;
  return <details className="telemetry-report"><summary>{hasObs ? 'CPU, GPU, temperatures & OBS lag' : 'CPU, GPU & temperatures'}</summary><div className="telemetry-grid">
    <div><span>Overall CPU · average</span><strong>{number(data.cpu.averagePercent, '%')}</strong></div><div><span>GPU load · average</span><strong>{number(data.gpu.averagePercent, '%')}</strong></div><div><span>Busiest logical CPU · sampled peak</span><strong>{number(data.busiestCore?.peakPercent, '%')}</strong></div><div><span>Available system RAM · minimum</span><strong>{number(data.minimumAvailableMemoryMB == null ? null : data.minimumAvailableMemoryMB / 1024, ' GB')}</strong></div><div><span>GPU memory · peak used</span><strong>{number(data.gpuMemory?.peakUsedMB == null ? null : data.gpuMemory.peakUsedMB / 1024, ' GB')}</strong></div><div><span>GPU memory · peak usage</span><strong>{number(data.gpuMemory?.peakPercent, '%')}</strong></div><div><span>System RAM · peak</span><strong>{number(data.memory.peakPercent, '%')}</strong></div><div><span>GPU temperature · peak</span><strong>{number(data.gpu.peakTemperatureC, ' °C')}</strong></div><div><span>CPU package temperature · peak</span><strong>{number(data.cpuTemperatureC, ' °C')}</strong></div>{hasObs && <><div><span>OBS rendering lag</span><strong>{number(data.obs.renderingLagPercent, '%')}</strong></div><div><span>OBS encoding lag</span><strong>{number(data.obs.encodingLagPercent, '%')}</strong></div><div><span>OBS stream drops</span><strong>{number(data.obs.networkDropPercent, '%')}</strong></div></>}
    </div>{!hasObs && <p className="fine-print">OBS was not connected. Game FPS and hardware measurements were recorded independently; stream/recording-quality counters were not collected.</p>}<p className="fine-print">{data.cpuTemperatureSensor ? `CPU sensor: ${data.cpuTemperatureSensor} (Libre Hardware Monitor). ` : ''}Sampled every {data.intervalSeconds} seconds. CPU/RAM and GPU values describe overall system/device use, not this game alone. OBS percentages use counter deltas during this run. The busiest logical CPU may differ between samples. GPU memory is device-wide allocation, not proof of paging or eviction. Short spikes may fall between samples. Missing counters are unavailable, not zero.</p><ul className="fine-print">{data.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>;
}
