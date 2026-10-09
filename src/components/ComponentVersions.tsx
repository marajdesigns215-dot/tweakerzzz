import { ArrowUpRight } from 'lucide-react';
import type { ComponentUpdateItem, HardwareComponent, DriverDevice } from '../types';
const labels = { current: 'Latest checked release installed', newer: 'Newer release available', ahead: 'Installed version is newer', different: 'Different release available', offered: 'Windows Update offer', unverified: 'Latest version unverified', 'not-applicable': 'Platform support' };
export function ComponentVersions({ component, devices, update, busy, openRelease }: { component: HardwareComponent; devices: DriverDevice[]; update?: ComponentUpdateItem; busy: boolean; openRelease: (id: string) => void }) {
  const platform = component.category === 'Processor' || component.category === 'Motherboard';
  if (platform) {
    const groups = [...new Map(devices.map(d => [[d.name, d.version, d.provider].join('|'), d])).values()];
    return <div className="component-platform"><strong>{component.category === 'Processor' ? 'Chipset & BIOS support' : 'Motherboard drivers & BIOS'}</strong><p>{update?.message || (component.category === 'Processor' ? 'CPU support comes through chipset packages and the motherboard BIOS. Reported Windows processor drivers are shown separately below.' : 'A board has several platform drivers with individual versions. BIOS firmware is shown on its own card.')}</p>
      {!!groups.length && <details className="component-platform-drivers"><summary>Installed {component.category === 'Processor' ? 'Windows processor' : 'chipset & platform'} drivers ({groups.length})</summary>{groups.map(d => {
        const related = devices.filter(other => other.name === d.name && other.version === d.version && other.provider === d.provider).map(other => other.id);
        const packages = [...new Map((update?.packages || []).filter(p => related.includes(p.deviceId)).map(p => [p.offerId, p])).values()];
        return <article key={d.id}><strong>{d.name}</strong><div className="component-version-pair"><div><span>INSTALLED DRIVER</span><strong>{d.version || 'Not reported'}</strong></div><div><span>WINDOWS UPDATE OFFER</span><strong>{busy ? 'Checking…' : packages.map(p => p.latestVersion || 'Version not published').join(' · ') || (update ? 'No matched offer' : 'Not checked')}</strong></div></div><small>{d.provider || 'Provider not reported'}</small>{packages.map(p => <p className="fine-print" key={p.offerId}>{p.title} · {p.date || 'Date not reported'}</p>)}</article>;
      })}</details>}
      {!groups.length && <p className="fine-print">No identifiable {component.category === 'Processor' ? 'Windows processor' : 'chipset/platform'} driver records were reported. Use the exact system or board support page to verify package releases.</p>}
    </div>;
  }
  const current = update?.installedVersion || component.values['NVIDIA version'] || component.values['Installed driver'] || component.values['BIOS version'];
  return <div className="component-version-panel">
    <div className="component-version-pair"><div><span>INSTALLED VERSION</span><strong>{current || 'Not reported'}</strong></div><div><span>{update?.source.startsWith('Windows Update') ? 'LATEST WINDOWS UPDATE OFFER' : 'LATEST STABLE AVAILABLE'}</span><strong>{busy ? 'Checking…' : update?.latestVersion || (update?.packages.length ? 'See matched packages' : 'Not verified')}</strong></div></div>
    {update && !busy && <><span className={`pill version-status ${update.status}`}>{labels[update.status]}</span><p className="fine-print">{update.message}</p>{update.source && <p className="fine-print">{update.source}{update.date ? ` · Released ${update.date}` : ''}</p>}
      {update.url && <button className="button secondary" onClick={() => openRelease(component.id)}>View this release & notes<ArrowUpRight size={15}/></button>}
      {!!update.notes && <details className="component-release-notes"><summary>Release notes</summary><p>{update.notes}</p></details>}
      {!!update.packages.length && <details className="component-package-list"><summary>Matched Windows driver offers ({update.packages.length})</summary>{update.packages.map(p => <article key={p.deviceId + p.offerId}><strong>{p.name}</strong><p>Installed: {p.installedVersion || 'Not reported'} → Offered: {p.latestVersion || 'Version not published'}</p><small>{p.title} · {p.source}</small><p className="fine-print">Versions shown here come from the Windows driver record and published update title, not device firmware or control software.</p></article>)}</details>}
    </>}
    {!update && !busy && <p className="fine-print">Choose “Check latest versions” to query supported manufacturer sources and Windows Update for this scan.</p>}
  </div>;
}
