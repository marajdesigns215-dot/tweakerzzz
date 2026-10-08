import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Download, RefreshCw } from 'lucide-react';
import type { UpdateStatus } from '../types';
import { version } from '../../package.json';

const releases = 'https://github.com/marajdesigns215-dot/tweakerzzz/releases';
const labels: Record<UpdateStatus['phase'], string> = {
  idle: 'Check when you’re ready.', checking: 'Checking GitHub releases…', 'up-to-date': 'You’re up to date.',
  available: 'A new version is available.', downloading: 'Downloading your update…', cancelling: 'Cancelling download…',
  downloaded: 'Your update is ready.', installing: 'Installing. Tweakerzzz will restart…', error: 'Update needs attention.',
};
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function Updates() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const mounted = useRef(false);
  const request = useRef(0);
  const bridge = window.tweaker?.updateStatus ? window.tweaker : undefined;
  useEffect(() => {
    mounted.current = true;
    if (!bridge) return () => { mounted.current = false; };
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const id = ++request.current;
      try { const next = await bridge.updateStatus(); if (mounted.current && id === request.current) setStatus(next); }
      catch (e) { if (mounted.current && id === request.current) setError(String(e)); }
      if (mounted.current) timer = setTimeout(poll, 700);
    };
    void poll();
    return () => { mounted.current = false; clearTimeout(timer); };
  }, [bridge]);
  async function run(action: () => Promise<UpdateStatus>) {
    ++request.current; setError('');
    try { const next = await action(); if (mounted.current) { ++request.current; setStatus(next); } }
    catch (e) { if (mounted.current) setError(String(e)); }
  }
  async function openReleases() {
    try { await bridge!.openUpdateRelease(); } catch (e) { setError(String(e)); }
  }
  const phase = status?.phase ?? 'idle';
  const canCheck = ['idle', 'error', 'up-to-date', 'available'].includes(phase);
  const issue = error || status?.error;
  return <div className="updates-page">
    <section className="panel update-card" aria-labelledby="update-heading">
      <div className="update-title"><RefreshCw size={30}/><div><span className="eyebrow">YOUR APP. YOUR TIMING.</span><h2 id="update-heading">{bridge ? labels[phase] : 'Keep Tweakerzzz up to date.'}</h2></div><span className="pill">{status?.supported ? 'Installed' : 'App'} v{status?.currentVersion ?? version}</span></div>
      <p className="body-copy">Check for new tester releases, see what changed, and choose when to download and install. Updates keep your saved profiles, backups, and FPS recordings.</p>
      <p className="fine-print">Tester channel · Checks and downloads start only when you ask. Closing the app never installs a waiting update.</p>
      {bridge && !status && !error && <p role="status">Loading updater…</p>}
      {(!bridge || (status && !status.supported)) && <p className="callout">In-app updates are available in the installed Windows desktop app. Install v0.6.0 or newer once to receive future updates here.</p>}
      {issue && <div className="diagnostic-panel" role="alert"><strong>Could not finish the update</strong><p>{issue}</p><p>Review the details above, then try again. You can also download the installer from GitHub releases.</p></div>}
      {status?.checkedAt && <p className="fine-print">Last successful check: {new Date(status.checkedAt).toLocaleString()}</p>}
      {status?.supported && <div className="update-actions">
        {canCheck && <button className="button primary" onClick={() => void run(() => bridge!.checkForUpdates())}><RefreshCw size={18}/>Check for updates</button>}
        {phase === 'available' && <button className="button primary" onClick={() => void run(() => bridge!.downloadUpdate())}><Download size={18}/>Download v{status.availableVersion}</button>}
        {phase === 'downloading' && <button className="button secondary" onClick={() => void run(() => bridge!.cancelUpdate())}>Cancel download</button>}
        {phase === 'downloaded' && !review && <button className="button primary" onClick={() => setReview(true)}><Check size={18}/>Review installation</button>}
      </div>}
      {['checking', 'downloading', 'cancelling', 'installing'].includes(phase) && <p role="status">{labels[phase]}</p>}
      {phase === 'downloading' && status?.progress && <div className="update-progress"><progress aria-label="Update download" max={100} value={status.progress.percent}/><p>{Math.floor(status.progress.percent)}% · {megabytes(status.progress.transferred)}{status.progress.total > 0 ? ` of ${megabytes(status.progress.total)}` : ''}</p></div>}
      {phase === 'downloaded' && <p className="fine-print">Download verified against the release checksum. Install now or return here later.</p>}
      {review && phase === 'downloaded' && <section className="update-review" aria-label="Review update installation">
        <h3>Install v{status?.availableVersion} & restart?</h3>
        <p>Tweakerzzz will close and the Windows installer will open. Finish any Windows change, stop FPS recording, and stop automatic color profiles before continuing. Your saved data stays in place.</p>
        <div className="update-actions"><button className="button primary" onClick={() => { setReview(false); void run(() => bridge!.installUpdate()); }}>Install & restart</button><button className="button secondary" onClick={() => setReview(false)}>Later</button></div>
      </section>}
    </section>
    {status?.availableVersion && <section className="panel update-card"><h2>What’s new in v{status.availableVersion}</h2><p className="update-notes">{status.releaseNotes || 'Release notes are available on GitHub.'}</p></section>}
    <section className="panel update-card"><h2>From the official release page</h2><p>Updates come from marajdesigns215-dot/tweakerzzz on GitHub. These are unsigned Windows x64 tester builds; Windows may show a publisher warning. The updater checks the download checksum before installation.</p>
      {bridge ? <button className="button secondary" onClick={() => void openReleases()}>Open GitHub releases<ArrowUpRight size={17}/></button> : <a className="button secondary" href={releases} target="_blank" rel="noreferrer">Open GitHub releases<ArrowUpRight size={17}/></a>}
    </section>
  </div>;
}
