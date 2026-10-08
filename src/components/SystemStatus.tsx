import { Check, Download, Info, LoaderCircle, RotateCcw } from 'lucide-react';
import type { ScanWarning, TweakStatus } from '../types';

export function TweakStateBadge({ state, native, checking }: { state?: TweakStatus; native: boolean; checking: boolean }) {
  const label = checking ? 'Checking…' : !native ? 'Windows app required' : state?.status === 'enabled' ? 'Already configured' : state?.status === 'not-enabled' ? 'Different settings' : state?.status === 'not-configured' ? 'Not configured' : state?.status === 'unknown' ? 'Unable to read' : 'Not checked';
  return <span className={`setting-state ${state?.status === 'enabled' && !checking ? 'configured' : ''}`} title={state?.message}>
    {checking ? <LoaderCircle size={12} className="spin"/> : state?.status === 'enabled' ? <Check size={12}/> : <Info size={12}/>} {label}
  </span>;
}

export function Diagnostics({ title, error = '', warnings = [], retry }: { title: string; error?: string; warnings?: ScanWarning[]; retry?: () => void }) {
  if (!error && !warnings.length) return null;
  const details = error || warnings.map(w => `${w.component}: ${w.message}`).join('\n\n');
  const save = () => {
    const url = URL.createObjectURL(new Blob([`Tweakerzzz 0.3.0\n${title}\n${new Date().toISOString()}\n\n${details}\n`], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'tweakerzzz-diagnostics.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="diagnostic-panel" role={error ? 'alert' : undefined}><div className="diagnostic-heading"><Info size={17}/><strong>{title}</strong></div><p>{error ? 'The details below identify the blocked or unavailable operation.' : 'The available results are shown. Unavailable values are labeled instead of replacing them with reference hardware.'}</p><details open={!!error}><summary>{error ? 'Error details' : `${warnings.length} collection warnings`}</summary><pre>{details}</pre></details><div className="button-row">{retry && <button className="button secondary compact" onClick={retry}><RotateCcw size={13}/>Retry</button>}<button className="button secondary compact" onClick={save}><Download size={13}/>Download error details</button></div></section>;
}
