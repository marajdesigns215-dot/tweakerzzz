import { useState } from 'react';
import { CheckCheck, History, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { BlockedTweaks } from './BlockedTweaks';
import type { TweakStatusReport, BlockedPreference } from '../types';
import { tweaks } from '../data/tweaks';
import { Diagnostics, TweakStateBadge } from './SystemStatus';

const automatic = tweaks.filter(t => t.mode === 'automatic');
const disableEffects: Record<string, string> = {
  'game-mode': 'Turn Game Mode off.', 'game-dvr': 'Allow Windows game capture again.',
  'mouse-acceleration': 'Enable pointer acceleration (speed 1; thresholds 6 and 10).',
  transparency: 'Enable transparency effects.', animations: 'Enable window animations.',
  'background-apps': 'Allow background app activity.', 'game-bar-tips': 'Allow Game Bar startup tips.',
  'startup-delay': 'Remove the zero-delay override; Windows controls startup timing.',
  'menu-delay': 'Set menu opening delay to 400 ms.', 'taskbar-animations': 'Enable taskbar animations.',
  peek: 'Enable Aero Peek.', 'content-suggestions': 'Allow Windows content suggestions.',
  'tailored-experiences': 'Allow tailored experiences using diagnostic data.',
  'advertising-id': 'Allow the advertising ID preference.', 'tips-notifications': 'Allow Windows tips.',
  'lockscreen-suggestions': 'Allow lock screen suggestions.',
  'explorer-sync-notifications': 'Allow File Explorer sync provider notifications.',
  'search-highlights': 'Allow Search highlights.', widgets: 'Show the Widgets taskbar entry.',
  'edge-background': 'Allow Edge background mode.', 'edge-startup-boost': 'Allow Edge startup boost.',
  'power-plan': 'Switch to the existing Balanced power plan; retain custom plans.',
};
export function RestoreTools({ report, checking, refresh, changed, notify }: { report: TweakStatusReport | null; checking: boolean; refresh: () => Promise<unknown>; changed: () => Promise<void>; notify: (message: string) => void }) {
  const native = !!window.tweaker;
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<'disable' | 'defaults' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState<{ items: BlockedPreference[]; message: string }>({ items: [], message: '' });
  const states = new Map(report?.tweaks.map(t => [t.id, t]) ?? []);
  async function run(action: 'disable' | 'defaults' | 'snapshot') {
    if (!window.tweaker) return;
    setBusy(true); setError(''); setBlocked({ items: [], message: '' });
    try {
      const result = await window.tweaker.changePreferences(action, action === 'snapshot' ? automatic.map(t => t.id) : selected);
      if (result.blocked?.length) { setBlocked({ items: result.blocked, message: result.message }); return; }
      setReview(null); notify(result.message); await changed();
    } catch (e) { setError(String(e)); }
    finally { await refresh(); setBusy(false); }
  }
  async function protection() {
    try { await window.tweaker!.openSettings('protection'); } catch (e) { setError(String(e)); }
  }
  return <div className="restore-tools">
    <Diagnostics title="Restore center needs attention" error={error}/><BlockedTweaks blocked={blocked.items.filter(item => selected.includes(item.id))} message={blocked.message} busy={busy} remove={() => { setSelected(ids => ids.filter(id => !blocked.items.some(item => item.id === id))); setReview(null); }}/>
    <div className="two-columns">
      <section className="panel restore-snapshot"><History size={26}/><h2>Save my current settings</h2><p className="body-copy">Save all {automatic.length} supported automatic preferences exactly as they are now, including values changed by you or another app, plus your active power plan. This snapshot does not modify Windows.</p><button className="button secondary" disabled={!native || busy || checking} onClick={() => run('snapshot')}>{busy ? <LoaderCircle size={16} className="spin"/> : <ShieldCheck size={16}/>}Save settings snapshot</button><p className="fine-print">This covers supported preferences only. Restore snapshots and change backups in newest-first order.</p></section>
      <section className="panel restore-snapshot"><ShieldCheck size={26}/><h2>Windows restore point</h2><p className="body-copy">Open Windows System Protection, select your system drive, then choose <strong>Create…</strong> and name your restore point. If protection is Off, use <strong>Configure…</strong> to enable it first.</p><button className="button secondary" disabled={!native} onClick={protection}>Open System Protection</button><p className="fine-print">Windows handles creation and may request administrator permission. Tweakerzzz cannot confirm a restore point was created. A restore point does not back up personal files.</p></section>
    </div>
    <section className="panel restore-preferences"><div className="section-heading"><h2>Manage existing tweaks</h2><button className="button secondary" disabled={!native || busy || checking} onClick={() => refresh()}><RotateCcw size={15}/>Refresh Windows state</button></div>
      <p className="body-copy">Select the tweaks to turn off or return to Windows-managed defaults. This also works for tweaks you enabled before installing Tweakerzzz. Each operation saves the current values first.</p>
      <div className="button-row"><button className="button secondary" disabled={!native || busy || checking || !!review} onClick={() => setSelected(automatic.filter(t => states.get(t.id)?.status === 'enabled').map(t => t.id))}><CheckCheck size={15}/>Select configured</button><button className="text-button" disabled={busy || !!review} onClick={() => setSelected(automatic.map(t => t.id))}>Select all {automatic.length}</button><button className="text-button" disabled={busy || !!review} onClick={() => setSelected([])}>Clear selection</button><span>{selected.length} selected</span></div>
      <div className="restore-settings">{automatic.map(t => <label className="restore-setting" key={t.id}><input type="checkbox" disabled={busy || !!review} checked={selected.includes(t.id)} onChange={() => setSelected(ids => ids.includes(t.id) ? ids.filter(id => id !== t.id) : [...ids, t.id])}/><span><strong>{t.title}</strong><small>{disableEffects[t.id]}</small></span><TweakStateBadge state={states.get(t.id)} native={native} checking={checking}/></label>)}</div>
      <div className="button-row"><button className="button secondary" disabled={!native || busy || checking || !selected.length} onClick={() => setReview('disable')}>Review turning off tweaks</button><button className="button secondary" disabled={!native || busy || checking || !selected.length} onClick={() => setReview('defaults')}>Review Windows defaults</button></div>
      {review && <div className="preference-review" role="region" aria-label="Review preference changes"><h3>{review === 'disable' ? `Turn off ${selected.length} tweaks?` : `Use Windows defaults for ${selected.length} settings?`}</h3><p className="body-copy">{review === 'disable' ? 'These actions reverse the selected preferences. Some re-enable background activity, recording, suggestions, or personalization. Review the effects below.' : 'This removes only the registry values managed by the selected tweaks. Windows or your organization then controls their behavior. If Power plan is selected, it switches to an existing Balanced plan. Unset values do not necessarily mean the tweak is off.'}</p><ul>{automatic.filter(t => selected.includes(t.id)).map(t => <li key={t.id}><strong>{t.title}:</strong> {review === 'disable' ? disableEffects[t.id] : t.id === 'power-plan' ? disableEffects[t.id] : 'Remove this setting’s registry override.'}</li>)}</ul><p className="body-copy">A backup will preserve your current values, including preferences set outside this app. Close games and save your work; sign out and back in afterward for all preferences to take effect.</p><div className="button-row"><button className="button secondary" disabled={busy} onClick={() => setReview(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={() => run(review)}>{busy ? <LoaderCircle size={16} className="spin"/> : <ShieldCheck size={16}/>}Back up & {review === 'disable' ? 'turn off' : 'use defaults'}</button></div></div>}
      <p className="fine-print"><strong>About factory settings:</strong> Tweakerzzz cannot reconstruct unknown OEM or previous user settings. Windows defaults removes the supported overrides; it does not reset drivers, BIOS, games, installed software, or the entire PC. Use an earlier backup to restore exact previous values.</p>
    </section>
  </div>;
}
