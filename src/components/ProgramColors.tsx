import { useEffect, useState } from 'react';
import { Eye, LoaderCircle, Monitor, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { ColorStatus, ProgramColorConfig } from '../types';
import { Diagnostics } from './SystemStatus';

export function ProgramColors() {
  const native = !!window.tweaker?.colorStatus;
  const [status, setStatus] = useState<ColorStatus | null>(null);
  const [config, setConfig] = useState<ProgramColorConfig>({ displayId: '', desktop: 50, profiles: [], sdrConfirmed: false });
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [program, setProgram] = useState(''); const [programs, setPrograms] = useState<string[]>([]);
  useEffect(() => {
    if (!native) return;
    let disposed = false, loading = false, first = true;
    async function refresh() {
      if (loading) return; loading = true;
      try {
        const value = await window.tweaker!.colorStatus();
        if (disposed) return;
        setStatus(value);
        if (first) { first = false; setConfig({ ...value.config, displayId: value.config.displayId || value.displays[0]?.id || '' }); }
      } catch (e) { if (!disposed) setError(String(e)); } finally { loading = false; }
    }
    void refresh(); const timer = setInterval(refresh, 2500);
    return () => { disposed = true; clearInterval(timer); };
  }, [native]);
  async function action(kind: 'save' | 'start' | 'stop') {
    setBusy(true); setError(''); setMessage('');
    try {
      if (kind === 'stop') { setStatus(await window.tweaker!.stopColorProfiles()); setMessage('Original driver vibrance restored.'); }
      else {
        const saved = await window.tweaker!.saveColorProfiles(config); setStatus(saved);
        if (kind === 'start') { setStatus(await window.tweaker!.startColorProfiles()); setMessage('Observer started. Switch to a saved game to use its profile.'); }
        else setMessage('Program profiles saved. No display colors were changed.');
      }
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  function add() {
    const name = program.trim();
    if (!/^[^<>:"/\\|?*\x00-\x1f]+\.exe$/i.test(name) || name.length > 128) { setError('Enter the actual executable name, such as cs2.exe. Do not enter a path.'); return; }
    if (config.profiles.some(p => p.processName.toLowerCase() === name.toLowerCase())) { setError('That program already has a profile.'); return; }
    if (config.profiles.length >= 50) { setError('You can save up to 50 programs.'); return; }
    setConfig(c => ({ ...c, profiles: [...c.profiles, { processName: name, vibrance: 65 }] })); setProgram(''); setError('');
  }
  const locked = busy || !!status?.active;
  return <section className="program-colors">
    <div className="section-heading"><div><span className="eyebrow">YOUR GAME. YOUR COLOR.</span><h2>Automatic program vibrance</h2></div><span className="pill">{status?.active ? `Watching · ${status.activeProgram}` : 'Observer stopped'}</span></div>
    <p className="body-copy">Set a desktop level and a different digital vibrance for each game or program. The foreground application chooses the profile; switching away returns to the desktop level. Only the selected monitor changes.</p>
    <Diagnostics title="Display profiles need attention" error={error || status?.error || ''}/>
    {message && <p role="status" className="color-feedback">{message}</p>}
    {!native && <p className="body-copy">Automatic colors require the Windows desktop app and a supported NVIDIA display. This browser preview does not change your monitor.</p>}
    {native && status && !status.supported && <p className="body-copy">Supported NVIDIA digital vibrance was not found. AMD, Intel, hybrid-laptop outputs, and remote displays remain available through their own control panels.</p>}
    <div className="two-columns">
      <section className="panel color-desktop"><Monitor size={25}/><h3>Desktop baseline</h3>
        <label className="field-label">NVIDIA DISPLAY<select aria-label="Color profile display" disabled={locked || !status?.supported} value={config.displayId} onChange={e => setConfig(c => ({ ...c, displayId: e.target.value }))}><option value="">Select a supported display</option>{status?.displays.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
        <label className="range-field"><span>Desktop digital vibrance<strong>{config.desktop}%</strong></span><input aria-label="Desktop digital vibrance" type="range" min="0" max="100" disabled={locked} value={config.desktop} onChange={e => setConfig(c => ({ ...c, desktop: Number(e.target.value) }))}/></label>
        <p className="fine-print">0–100% maps to the supported driver range. 50% is the usual neutral level. Higher vibrance can clip color detail; it does not increase FPS.</p>
        <label className="color-checkbox"><input type="checkbox" disabled={locked} checked={config.sdrConfirmed} onChange={e => setConfig(c => ({ ...c, sdrConfirmed: e.target.checked }))}/><span>I’m using SDR with Windows HDR off, and have stopped other automatic color controllers.</span></label>
        <p className="fine-print">HDR is not detected automatically. Turn the observer off before changing HDR, reconnecting monitors, or using a calibrated creative workflow.</p>
      </section>
      <section className="panel"><div className="section-heading"><h3>Game & program profiles</h3><span className="pill">{config.profiles.length} / 50</span></div>
        <label className="field-label">EXECUTABLE NAME<input aria-label="Color program executable" disabled={locked} maxLength={128} value={program} placeholder="FortniteClient-Win64-Shipping.exe" onChange={e => setProgram(e.target.value)}/></label>
        <div className="button-row"><button className="button secondary" disabled={locked || !program.trim()} onClick={add}><Plus size={16}/>Add program</button><button className="text-button" disabled={locked || !native} onClick={async () => { setBusy(true); try { setPrograms(await window.tweaker!.listPrograms()); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>Find running programs</button></div>
        {!!programs.length && <label className="field-label">RUNNING PROGRAM<select aria-label="Running color program" disabled={locked} value="" onChange={e => setProgram(e.target.value)}><option value="">Choose an executable</option>{programs.map(name => <option key={name}>{name}</option>)}</select></label>}
        <div className="program-color-list">{config.profiles.map((p, i) => <div className="program-color-row" key={p.processName}><label className="range-field"><span><strong>{p.processName}</strong><span>{p.vibrance}%</span></span><input aria-label={`Vibrance for ${p.processName}`} disabled={locked} type="range" min="0" max="100" value={p.vibrance} onChange={e => setConfig(c => ({ ...c, profiles: c.profiles.map((row, j) => j === i ? { ...row, vibrance: Number(e.target.value) } : row) }))}/></label><button className="icon-button" disabled={locked} aria-label={`Remove ${p.processName}`} onClick={() => setConfig(c => ({ ...c, profiles: c.profiles.filter((_, j) => j !== i) }))}><Trash2 size={17}/></button></div>)}</div>
        {!config.profiles.length && <p className="fine-print">Launch your game, then find its running executable. Add the game process, not its launcher. Matches use the exact executable name, ignoring letter case.</p>}
      </section>
    </div>
    <div className="panel color-observer"><Eye size={25}/><div><h3>{status?.active ? `Active profile: ${status.activeProgram}` : 'Ready when you are'}</h3><p>Review the levels above before starting. Closing the window keeps an active observer in the tray. Stop or quit to restore the exact original driver level. Profiles do not start automatically at Windows login.</p></div><div className="button-row">
      <button className="button secondary" disabled={!native || locked || !status?.supported || !config.displayId} onClick={() => action('save')}><Save size={16}/>Save profiles</button>
      {status?.active || status?.recoveryPending ? <button className="button primary" disabled={busy || !status.supported} onClick={() => action('stop')}><RotateCcw size={16}/>{status.recoveryPending && !status.active ? 'Recover original colors' : 'Stop & restore original'}</button> : <button className="button primary" disabled={!native || busy || !status?.supported || !config.sdrConfirmed || !config.displayId} onClick={() => action('start')}>{busy ? <LoaderCircle className="spin" size={16}/> : <Eye size={16}/>}Save & start observer</button>}
    </div></div>
    <p className="fine-print">Uses the NVIDIA driver without injecting code into games. Unsupported driver controls stay unavailable. Brightness, contrast, and warmth in the color study below are preview controls; automatic profiles currently apply digital vibrance only.</p>
  </section>;
}
