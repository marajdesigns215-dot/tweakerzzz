import { useEffect, useState } from 'react';
import { ArrowUpRight, Cpu, Download, Fan, LoaderCircle, ScanLine } from 'lucide-react';
import type { DriverHistory, DriverInstallLog, DriverReport, DriverUpdateOffers } from '../types';
import { Diagnostics } from './SystemStatus';
import { AdvancedDriverInventory, DriverChangeHistory, DriverOffers, HardwareParts } from './DriverPanels';

export function DriverCenter({ scanReport }: { scanReport: () => Promise<DriverReport> }) {
  const [report, setReport] = useState<DriverReport | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [view, setView] = useState('Hardware'), [filter, setFilter] = useState('All devices'), [query, setQuery] = useState('');
  const [history, setHistory] = useState<DriverHistory | null>(null), [log, setLog] = useState<DriverInstallLog | null>(null);
  const [offers, setOffers] = useState<DriverUpdateOffers | null>(null), [checkingUpdates, setCheckingUpdates] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false), [includeIds, setIncludeIds] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      window.tweaker?.getDriverHistory?.().then(v => { if (alive) setHistory(v); }).catch(e => { if (alive) setError(String(e)); });
      window.tweaker?.getDriverUpdateStatus?.().then(v => { if (alive) { setOffers(v.result); setCheckingUpdates(v.checking); } }).catch(e => { if (alive) setError(String(e)); });
    };
    refresh(); const timer = setInterval(refresh, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  async function scan() { setBusy(true); setError(''); setReport(null); try { const next = await scanReport(); setReport(next); if (next.history) setHistory(next.history); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  async function historyAction(action: () => Promise<DriverHistory>) { setHistoryBusy(true); setError(''); try { setHistory(await action()); } catch (e) { setError(String(e)); } finally { setHistoryBusy(false); } }
  async function openSource(id: string) { try { await window.tweaker!.openDriverSource(id); } catch (e) { setError(String(e)); } }
  async function checkUpdates() { setCheckingUpdates(true); setOffers(null); setError(''); try { setOffers(await window.tweaker!.checkDriverUpdates()); } catch (e) { setError(`Update availability could not be checked. No component is marked up to date. ${String(e)}`); } finally { setCheckingUpdates(false); } }
  function exportReport() {
    const payload = { format: 'Tweakerzzz hardware and driver report', version: 1, exportedAt: new Date().toISOString(), includesDeviceIdentifiers: includeIds, report, history, updateOffers: offers, windowsInstallationLog: log };
    const data = JSON.stringify(payload, (key, value) => !includeIds && ['instanceId', 'hardwareIds', 'compatibleIds', 'hardwareId'].includes(key) ? undefined : value, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'Tweakerzzz-hardware-driver-report.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const categories = ['All devices', ...new Set(report?.recommendations.map(r => r.category) || [])];
  const cards = report?.recommendations.filter(r => (filter === 'All devices' || r.category === filter) && `${r.title} ${r.device} ${r.sourceName}`.toLowerCase().includes(query.toLowerCase())) || [];
  return <div className="driver-center">
    <div className="panel driver-intro"><span className="driver-mark"><Download size={30}/></span><div><span className="eyebrow">KNOW YOUR PARTS. TRACK YOUR CHANGES.</span><h2>Hardware, drivers & firmware</h2><p className="body-copy">Identify your graphics cards, processors, motherboard, BIOS, memory and storage. Review installed versions, official release information, available update offers and changes detected on this PC.</p></div><button className="button primary" disabled={!window.tweaker?.scanDrivers || busy} onClick={scan}>{busy ? <LoaderCircle className="spin" size={17}/> : <ScanLine size={17}/>}Scan drivers & devices</button></div>
    <Diagnostics title="Hardware or update check needs attention" error={error}/>
    {report?.warnings.map((w, i) => <Diagnostics key={i} title={`${w.component} unavailable`} error={w.message}/>)}
    <div className="tabs driver-view-tabs" role="tablist" aria-label="Hardware and driver views">{['Hardware', 'Update offers', 'Change history', 'Advanced records'].map(name => <button key={name} role="tab" aria-selected={view === name} aria-controls="driver-view" className={view === name ? 'active' : ''} onClick={() => setView(name)}>{name}</button>)}</div>
    <div id="driver-view" role="tabpanel" aria-label={view}>
      {view === 'Hardware' && <>{!report ? <section className="panel"><Cpu size={28}/><h3>Start with this PC’s actual hardware</h3><p className="body-copy">Scan to identify component models and installed versions. No reference build is preloaded, and no driver or BIOS installation is performed.</p>{!window.tweaker?.scanDrivers && <p className="fine-print">Hardware scanning and update checks require the Windows desktop app.</p>}</section> : <>
        <p className="fine-print">Hardware scan: {new Date(report.scannedAt).toLocaleString()}. Rescan to refresh displayed versions after changes.</p>
        <HardwareParts report={report} openSource={openSource}/>
        <details className="panel driver-guides" open><summary>Software & setup guides</summary><div className="driver-toolbar"><label className="field-label">DEVICE CATEGORY<select aria-label="Device category" value={filter} onChange={e => setFilter(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="field-label">FIND HARDWARE OR SOFTWARE<input placeholder="Motherboard, Logitech, chipset…" value={query} onChange={e => setQuery(e.target.value)}/></label></div><div className="driver-cards">{cards.map(card => <article className="panel driver-card" key={card.id}><div className="section-heading"><span className="pill">{card.category}</span><span className="fine-print">{card.confidence}</span></div><h3>{card.title}</h3><strong className="driver-device">{card.device}</strong><p>{card.reason}</p><p className="fine-print">{card.note}</p>{card.source && <button className="button secondary" onClick={() => openSource(card.source!)}>{card.sourceName}<ArrowUpRight size={16}/></button>}</article>)}</div>{!cards.length && <p>No guides match this filter.</p>}</details>
      </>}</>}
      {view === 'Update offers' && <DriverOffers report={report} offers={offers} busy={checkingUpdates} check={checkUpdates} cancel={async () => { try { await window.tweaker!.cancelDriverUpdateCheck(); } catch (e) { setError(String(e)); } }} openLink={async (id, index) => { try { await window.tweaker!.openDriverUpdateLink(id, index); } catch (e) { setError(String(e)); } }}/>}
      {view === 'Change history' && <DriverChangeHistory history={history} log={log} busy={historyBusy || busy} setMonitoring={enabled => historyAction(() => window.tweaker!.setDriverMonitoring(enabled))} clear={() => historyAction(() => window.tweaker!.clearDriverHistory())} refresh={() => historyAction(() => window.tweaker!.getDriverHistory())} loadLog={async () => { setHistoryBusy(true); setError(''); try { setLog(await window.tweaker!.getDriverInstallLog()); } catch (e) { setError(String(e)); } finally { setHistoryBusy(false); } }}/>}
      {view === 'Advanced records' && (report ? <AdvancedDriverInventory devices={report.devices} openSource={openSource}/> : <section className="panel"><p>Scan your hardware to inspect the underlying driver records.</p></section>)}
    </div>
    <section className="panel driver-export"><h3>Export hardware & update evidence</h3><p className="body-copy">Includes the displayed hardware report, retained change history, update offers and Windows log entries you loaded. Manufacturer links are references, not downloaded release-note archives.</p><label className="check-label"><input type="checkbox" checked={includeIds} onChange={e => setIncludeIds(e.target.checked)}/>Include hardware and instance IDs (may contain device serial identifiers)</label><button className="button secondary" disabled={!report && !history?.baselineAt && !offers && !log} onClick={exportReport}><Download size={16}/>Export hardware & driver report</button><p className="fine-print">Logs stay on this PC. Review exports before sharing. History is retained across app updates and uninstall until you clear it.</p></section>
    <div className="panel driver-note"><Fan size={25}/><div><h3>About CPUs, BIOS and cooling</h3><p className="body-copy">CPU support usually comes through the motherboard BIOS and chipset package. BIOS and storage firmware need an exact model/revision match. Standard fans usually have no readable model or separate driver; an identifiable USB controller may have vendor software. Unknown details remain unknown.</p></div></div>
  </div>;
}
