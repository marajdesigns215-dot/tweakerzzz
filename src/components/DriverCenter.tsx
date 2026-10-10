import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Cpu, Download, Fan, LoaderCircle, ScanLine } from 'lucide-react';
import type { ComponentUpdateReport, DriverHistory, DriverInstallLog, DriverReport, DriverUpdateOffers } from '../types';
import { visibleChange, visibleOffers, visibleParts } from '../lib/driver-visibility';
import { Diagnostics } from './SystemStatus';
import { DriverChangeHistory, DriverOffers, HardwareParts } from './DriverPanels';

export function DriverCenter({ report, saved, scanReport }: { report: DriverReport | null; saved: boolean; scanReport: () => Promise<DriverReport> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [view, setView] = useState('Hardware'), [filter, setFilter] = useState('All devices'), [query, setQuery] = useState('');
  const [history, setHistory] = useState<DriverHistory | null>(null), [log, setLog] = useState<DriverInstallLog | null>(null);
  const [offers, setOffers] = useState<DriverUpdateOffers | null>(null), [checkingUpdates, setCheckingUpdates] = useState(false);
  const [versions, setVersions] = useState<ComponentUpdateReport | null>(null), [checkingVersions, setCheckingVersions] = useState(false), [branch, setBranch] = useState<'game-ready' | 'studio'>('game-ready');
  const [updateScope, setUpdateScope] = useState('All components'), [checkingIds, setCheckingIds] = useState<string[]>([]);
  const requestGeneration = useRef(0);
  const [historyBusy, setHistoryBusy] = useState(false), [includeIds, setIncludeIds] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      const generation=requestGeneration.current;
      window.tweaker?.getComponentUpdateStatus?.().then(v => { if (alive && generation===requestGeneration.current) { setVersions(v.result); setCheckingVersions(v.checking); setCheckingIds(v.componentIds || []); } }).catch(e => { if (alive && generation===requestGeneration.current) setError(String(e)); });
      window.tweaker?.getDriverHistory?.().then(v => { if (alive) setHistory(v); }).catch(e => { if (alive) setError(String(e)); });
      window.tweaker?.getDriverUpdateStatus?.().then(v => { if (alive) { setOffers(v.result); setCheckingUpdates(v.checking); } }).catch(e => { if (alive) setError(String(e)); });
    };
    refresh(); const timer = setInterval(refresh, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  async function scan() { ++requestGeneration.current; setBusy(true); setError(''); setVersions(null); setUpdateScope('All components'); try { const next = await scanReport(); if (next.history) setHistory(next.history); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  async function historyAction(action: () => Promise<DriverHistory>) { setHistoryBusy(true); setError(''); try { setHistory(await action()); } catch (e) { setError(String(e)); } finally { setHistoryBusy(false); } }
  async function openSource(id: string) { try { await window.tweaker!.openDriverSource(id); } catch (e) { setError(String(e)); } }
  async function checkUpdates() { setCheckingUpdates(true); setOffers(null); setError(''); try { setOffers(await window.tweaker!.checkDriverUpdates()); } catch (e) { setError(`Update availability could not be checked. No component is marked up to date. ${String(e)}`); } finally { setCheckingUpdates(false); } }
  async function checkVersions(ids?: string[]) {
    ++requestGeneration.current; const selected=ids || (report ? visibleParts(report).map(c=>c.id) : []);
    setCheckingVersions(true); setCheckingIds(selected); setError('');
    setVersions(v=>v && v.scannedAt===report?.scannedAt && v.branch===branch ? {...v,items:v.items.filter(i=>!selected.includes(i.componentId))} : null);
    try { setVersions(await window.tweaker!.checkComponentUpdates(branch,ids)); } catch(e) { setError(String(e)); } finally { setCheckingVersions(false); setCheckingIds([]); }
  }
  async function openRelease(id: string) { try { await window.tweaker!.openComponentRelease(id); } catch(e) { setError(String(e)); } }
  function exportReport() {
    const payload = { format: 'Tweakerzzz hardware and driver report', version: 1, exportedAt: new Date().toISOString(), includesDeviceIdentifiers: includeIds, report, history, componentVersions: versions, updateOffers: offers, windowsInstallationLog: log };
    const data = JSON.stringify(payload, (key, value) => !includeIds && ['instanceId', 'hardwareIds', 'compatibleIds', 'hardwareId'].includes(key) ? undefined : value, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'Tweakerzzz-hardware-driver-report.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const guides = (report?.recommendations || []).filter(r => ['Motherboard', 'Graphics', 'CPU / chipset', 'Peripherals'].includes(r.category));
  const categories = ['All devices', ...new Set(guides.map(r => r.category))];
  const shownVersions = versions?.scannedAt === report?.scannedAt && versions?.branch === branch ? versions : null;
  const parts=report ? visibleParts(report) : [], scopeParts=parts.filter(c=>updateScope==='All components' || c.category===updateScope);
  const shownHistory = history ? { ...history, changes: history.changes.filter(c => visibleChange(c, report)) } : null;
  const shownIds = new Set(report ? visibleParts(report).flatMap(c => c.deviceIds) : []);
  const shownLog = log ? { ...log, entries: log.entries.filter(e => e.deviceId && shownIds.has(e.deviceId)), message: `${log.message} Only entries associated with the displayed devices are shown; scan first to identify them.` } : null;
  const cards = guides.filter(r => (filter === 'All devices' || r.category === filter) && `${r.title} ${r.device} ${r.sourceName}`.toLowerCase().includes(query.toLowerCase())) || [];
  return <div className="driver-center">
    <div className="panel driver-intro"><span className="driver-mark"><Download size={30}/></span><div><span className="eyebrow">KNOW YOUR PARTS. TRACK YOUR CHANGES.</span><h2>Hardware, drivers & firmware</h2><p className="body-copy">Your graphics, processor, motherboard, BIOS, peripherals and audio—all in one place. Compare installed versions with available releases and see what changed on this PC.</p></div><button className="button primary" disabled={!window.tweaker?.scanDrivers || busy || checkingVersions} onClick={scan}>{busy ? <LoaderCircle className="spin" size={17}/> : <ScanLine size={17}/>}Scan drivers & devices</button></div>
    <Diagnostics title="Hardware or update check needs attention" error={error}/>
    {report?.warnings.map((w, i) => <Diagnostics key={i} title={`${w.component} unavailable`} error={w.message}/>)}
    <div className="tabs driver-view-tabs" role="tablist" aria-label="Hardware and driver views">{['Hardware', 'Update offers', 'Change history'].map(name => <button key={name} role="tab" aria-selected={view === name} aria-controls="driver-view" className={view === name ? 'active' : ''} onClick={() => setView(name)}>{name}</button>)}</div>
    <div id="driver-view" role="tabpanel" aria-label={view}>
      {view === 'Hardware' && <>{!report ? <section className="panel"><Cpu size={28}/><h3>Start with this PC’s actual hardware</h3><p className="body-copy">Scan to identify component models and installed versions. No reference build is preloaded, and no driver or BIOS installation is performed.</p>{!window.tweaker?.scanDrivers && <p className="fine-print">Hardware scanning and update checks require the Windows desktop app.</p>}</section> : <>
        <p className="fine-print">{saved ? 'Saved driver scan' : 'Hardware scan'}: {new Date(report.scannedAt).toLocaleString()}. Rescan to refresh displayed versions after changes.</p>
        <section className="panel component-check-controls">
          <div><h3>Updates for every component</h3><p className="body-copy">Check graphics, processor drivers, motherboard/chipset drivers, peripherals and audio together or separately. BIOS, device firmware and manufacturer-only packages show the official support path when automatic version verification is unavailable.</p></div>
          <div className="driver-toolbar">
            <label className="field-label">WHAT TO CHECK<select aria-label="Update check scope" value={updateScope} disabled={checkingVersions || checkingUpdates || busy} onChange={e=>setUpdateScope(e.target.value)}><option>All components</option>{[...new Set(parts.map(c=>c.category))].map(c=><option key={c}>{c}</option>)}</select></label>
            <button className="button primary" disabled={checkingVersions || busy || checkingUpdates || !scopeParts.length || !window.tweaker?.checkComponentUpdates} onClick={()=>checkVersions(updateScope==='All components' ? undefined : scopeParts.map(c=>c.id))}>{checkingVersions ? <LoaderCircle className="spin" size={17}/> : <Download size={17}/>} {updateScope==='All components' ? 'Check all hardware updates' : updateScope==='BIOS / UEFI' ? 'Review BIOS update sources' : 'Check selected components'}</button>
            {checkingVersions && <button className="button secondary" onClick={async () => { try { await window.tweaker!.cancelComponentUpdates(); } catch(e) { setError(String(e)); } }}>Cancel version check</button>}
          </div>
          {scopeParts.some(c=>c.category==='Graphics' && /NVIDIA/i.test(c.name)) && <div className="driver-vendor-options"><label className="field-label">NVIDIA OPTIONS · GRAPHICS ONLY<select aria-label="NVIDIA release branch" value={branch} disabled={checkingVersions} onChange={e=>{++requestGeneration.current;setBranch(e.target.value as 'game-ready' | 'studio');}}><option value="game-ready">Game Ready · stable WHQL</option><option value="studio">Studio · non-beta</option></select></label></div>}
          <p className="fine-print">Driver checks use exact device-matched Windows Update offers, which may lag manufacturer releases. NVIDIA GeForce also uses its official model/Windows catalog. A missing offer never confirms that a device is up to date.</p>
          <p className="fine-print" role="status">{checkingVersions ? `Checking ${checkingIds.length || scopeParts.length} selected component(s). Other components keep their previous results. This can take up to two minutes.` : shownVersions ? `Latest check finished ${new Date(shownVersions.checkedAt).toLocaleString()}. Each result shows its own check time. Installed versions are from the hardware scan above.` : 'Choose all components, a category, or the check button on an individual card.'}</p>
          {shownVersions?.windowsUpdateError && <p className="fine-print">Windows Update unavailable for the last check: {shownVersions.windowsUpdateError}</p>}
        </section>
        <HardwareParts report={report} openSource={openSource} versions={shownVersions} checking={checkingVersions} checkingIds={checkingIds} checksDisabled={checkingVersions || checkingUpdates || busy} check={id=>checkVersions([id])} openRelease={openRelease}/>
        <details className="panel driver-guides"><summary>Software & setup guides</summary><div className="driver-toolbar"><label className="field-label">DEVICE CATEGORY<select aria-label="Device category" value={filter} onChange={e => setFilter(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="field-label">FIND HARDWARE OR SOFTWARE<input placeholder="Motherboard, Logitech, chipset…" value={query} onChange={e => setQuery(e.target.value)}/></label></div><div className="driver-cards">{cards.map(card => <article className="panel driver-card" key={card.id}><div className="section-heading"><span className="pill">{card.category}</span><span className="fine-print">{card.confidence}</span></div><h3>{card.title}</h3><strong className="driver-device">{card.device}</strong><p>{card.reason}</p><p className="fine-print">{card.note}</p>{card.source && <button className="button secondary" onClick={() => openSource(card.source!)}>{card.sourceName}<ArrowUpRight size={16}/></button>}</article>)}</div>{!cards.length && <p>No guides match this filter.</p>}</details>
      </>}</>}
      {view === 'Update offers' && <DriverOffers report={report} offers={visibleOffers(offers, report)} busy={checkingUpdates || checkingVersions} check={checkUpdates} cancel={async () => { try { if (checkingVersions) await window.tweaker!.cancelComponentUpdates(); else await window.tweaker!.cancelDriverUpdateCheck(); } catch (e) { setError(String(e)); } }} openLink={async (id, index) => { try { await window.tweaker!.openDriverUpdateLink(id, index); } catch (e) { setError(String(e)); } }}/>}
      {view === 'Change history' && <DriverChangeHistory history={shownHistory} log={shownLog} busy={historyBusy || busy} setMonitoring={enabled => historyAction(() => window.tweaker!.setDriverMonitoring(enabled))} clear={() => historyAction(() => window.tweaker!.clearDriverHistory())} refresh={() => historyAction(() => window.tweaker!.getDriverHistory())} loadLog={async () => { setHistoryBusy(true); setError(''); try { setLog(await window.tweaker!.getDriverInstallLog()); } catch (e) { setError(String(e)); } finally { setHistoryBusy(false); } }}/>}
    </div>
    <section className="panel driver-export"><h3>Export hardware & update evidence</h3><p className="body-copy">Includes the full scan inventory, retained change history, version checks, update offers and Windows log entries you loaded. Diagnostics can include records hidden from this simplified view.</p><label className="check-label"><input type="checkbox" checked={includeIds} onChange={e => setIncludeIds(e.target.checked)}/>Include hardware and instance IDs (may contain device serial identifiers)</label><button className="button secondary" disabled={!report && !history?.baselineAt && !offers && !log} onClick={exportReport}><Download size={16}/>Export hardware & driver report</button><p className="fine-print">Logs stay on this PC. Review exports before sharing. History is retained across app updates and uninstall until you clear it.</p></section>
    <div className="panel driver-note"><Fan size={25}/><div><h3>About CPUs, BIOS and cooling</h3><p className="body-copy">CPU support usually comes through the motherboard BIOS and chipset package. BIOS and storage firmware need an exact model/revision match. Standard fans usually have no readable model or separate driver; an identifiable USB controller may have vendor software. Unknown details remain unknown.</p></div></div>
  </div>;
}
