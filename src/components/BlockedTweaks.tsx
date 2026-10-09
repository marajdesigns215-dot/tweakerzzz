import { Info, X } from 'lucide-react';
import { tweaks } from '../data/tweaks';
import type { BlockedPreference } from '../types';

export function BlockedTweaks({ blocked, message, remove, busy = false }: { blocked: BlockedPreference[]; message: string; remove: () => void; busy?: boolean }) {
  if (!blocked.length) return null;
  const edge = blocked.some(item => item.id === 'edge-background' || item.id === 'edge-startup-boost');
  return <section className="diagnostic-panel blocked-tweaks" role="alert">
    <div className="diagnostic-heading"><Info size={18}/><strong>{blocked.length} {blocked.length === 1 ? 'tweak needs' : 'tweaks need'} to be left out</strong></div>
    <p>{message}</p>
    <ul>{blocked.map(item => <li key={item.id}><strong>{tweaks.find(t => t.id === item.id)?.title ?? item.id}</strong><details><summary>Why this tweak is blocked</summary><pre>{item.message}</pre></details></li>)}</ul>
    {edge && <p>For Edge, open <strong>Settings → System and performance</strong> and look for <strong>Startup boost</strong> and <strong>Continue running background extensions and apps when Microsoft Edge is closed</strong>. If a setting is managed or unavailable, leave it unchanged.</p>}
    <p>Remove these items, then review and apply the remaining changes. Tweakerzzz does not change registry permissions or bypass Windows access restrictions.</p>
    <button className="button secondary" disabled={busy} onClick={remove}><X size={16}/>Remove blocked tweaks</button>
  </section>;
}
