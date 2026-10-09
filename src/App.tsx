import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight, CircleHelp, Command, Cpu, Download, Gauge, Gamepad2, HardDrive, History, Info, Layers3, LayoutDashboard, LoaderCircle, MemoryStick, Monitor, Mouse, Plus, Radio, RotateCcw, ScanLine, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, TvMinimal, Video, WandSparkles, X, Zap } from 'lucide-react';
import { tweaks as catalogTweaks, categories } from './data/tweaks';
import type { Tweak } from './data/tweaks';
import type { Backup, DisplayMode, SystemScan, PeripheralScan, Peripheral, DriverReport, BlockedPreference } from './types';
import { useTweakStatus } from './lib/use-tweak-status';
import { Diagnostics, TweakStateBadge } from './components/SystemStatus';
import { BlockedTweaks } from './components/BlockedTweaks';
import { Updates } from './components/Updates';
import { version } from '../package.json';
import { PerformanceLab } from './components/PerformanceLab';
import { RestoreTools } from './components/RestoreTools';
import { ProgramColors } from './components/ProgramColors';
import { DriverCenter } from './components/DriverCenter';
import { PeripheralDevices } from './components/PeripheralDevices';
import { PeripheralGuidance } from './components/PeripheralGuidance';
import { parseHardwareReport, parsePeripheralReport } from './lib/reports';
import { emptyHardware, encoderGuidance, memoryGuidance, displayGuidance, streamSettings } from './lib/hardware-guidance';
import { tweaksForHardware } from './lib/tweak-catalog';
import { parseDisplayModes, supportedSelection, displayAspect } from './lib/display-modes';

type Page = 'Overview' | 'Optimizations' | 'PC scanner' | 'Display studio' | 'Peripherals' | 'Streaming lab' | 'Restore center' | 'FPS recorder' | 'Drivers & devices' | 'Updates';
type Profile = 'Gaming' | 'Streaming' | 'Recording';
type ColorProfile = { name: string; vibrance: number; brightness: number; contrast: number; warmth: number };

const workflow = [
  { page: 'PC scanner', label: 'Overview / PC scanner', icon: ScanLine, description: 'Scan your PC and check the hardware report.' },
  { page: 'Drivers & devices', label: 'Drivers & devices', icon: Download, description: 'Review official software for your detected hardware. Finish any driver changes before your baseline recording.' },
  { page: 'FPS recorder', label: 'FPS recorder', icon: Activity, description: 'Record a repeatable scene as your Before run.' },
  { page: 'Restore center', label: 'Restore center', icon: History, description: 'Save a settings snapshot before changing tweaks. Open System Protection here for a Windows restore point.' },
  { page: 'Optimizations', label: 'Optimizations', icon: SlidersHorizontal, description: 'Review applicable tweaks and their tradeoffs, then apply your plan.' },
  { page: 'Peripherals', label: 'Peripherals', icon: Mouse, description: 'Check your detected devices and review their settings guides.' },
  { page: 'Streaming lab', label: 'Streaming lab', icon: Radio, description: 'Set up your streaming or recording workload if you use one.' },
] as const;
const nav = [{ name: 'Overview', icon: LayoutDashboard }, ...workflow.map(step => ({ name: step.page, icon: step.icon })), { name: 'Display studio', icon: Monitor }] as const;
const auto = catalogTweaks.filter(t => t.mode === 'automatic');
function validColors(v: unknown): v is ColorProfile { if (!v || typeof v !== 'object') return false; const c = v as ColorProfile; return typeof c.name === 'string' && c.name.length <= 40 && [[c.vibrance, 0, 200], [c.brightness, 50, 150], [c.contrast, 50, 150], [c.warmth, 0, 50]].every(([value, min, max]) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max); }
function readSaved<T>(key: string, fallback: T): T { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); if (value === null) return fallback; if (key === 'tz-profile' && !['Gaming', 'Streaming', 'Recording'].includes(value)) return fallback; if (['tz-selected', 'tz-reviewed'].includes(key) && (!Array.isArray(value) || !value.every(v => typeof v === 'string'))) return fallback; if (key === 'tz-colors' && !validColors(value)) return fallback; if (key === 'tz-color-profiles' && (!Array.isArray(value) || value.length > 30 || !value.every(validColors))) return fallback; return value as T; } catch { return fallback; } }
function saveLocal(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The workspace remains usable when browser storage is unavailable. */ } }
function download(name: string, data: string, type = 'application/json') { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function Pill({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`pill ${tone}`}>{children}</span>; }
function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) { return <div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{children}</div>; }
function Toggle({ on, onClick, label, disabled = false }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) { return <button disabled={disabled} type="button" className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick}><span/></button>; }
function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const before = document.activeElement as HTMLElement; const root = ref.current; root?.querySelector<HTMLElement>('button,input,select')?.focus(); const listener = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'Tab' && root) { const nodes = [...root.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href]')]; const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }; document.addEventListener('keydown', listener); return () => { document.removeEventListener('keydown', listener); before?.focus(); }; }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}

export default function App() {
  const [page, setPage] = useState<Page>('Overview');
  const [profile, setProfile] = useState<Profile>(() => readSaved('tz-profile', 'Gaming'));
  const [selected, setSelected] = useState<string[]>(() => { const v = readSaved<unknown>('tz-selected', []); return Array.isArray(v) ? v.filter(id => typeof id === 'string' && auto.some(t => t.id === id)) : []; });
  const tweakStatus = useTweakStatus();
  const states = new Map(tweakStatus.report?.tweaks.map(t => [t.id, t]) ?? []);
  const configured = (id: string) => states.get(id)?.status === 'enabled';
  const configuredCount = tweakStatus.report?.tweaks.filter(t => t.status === 'enabled').length ?? 0;
  const [scanError, setScanError] = useState('');
  const [peripheralError, setPeripheralError] = useState('');
  const [peripheralReport, setPeripheralReport] = useState<PeripheralScan | null>(null);
  const [scanningDevices, setScanningDevices] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [blockedPlan, setBlockedPlan] = useState<{ items: BlockedPreference[]; message: string }>({ items: [], message: '' });
  const [reviewed, setReviewed] = useState<string[]>(() => readSaved('tz-reviewed', []));
  const [system, setSystem] = useState<SystemScan>(emptyHardware);
  const [reportKind, setReportKind] = useState<'none' | 'native' | 'imported' | 'cached'>('none');
  const [driverReport, setDriverReport] = useState<DriverReport | null>(null);
  const [savedDrivers, setSavedDrivers] = useState(false), [savedPeripherals, setSavedPeripherals] = useState(false);
  const [memoryError, setMemoryError] = useState(''), [forgetting, setForgetting] = useState(false), [confirmForget, setConfirmForget] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All tweaks');
  const [filter, setFilter] = useState('All settings');
  const [detail, setDetail] = useState<Tweak | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [backups, setBackups] = useState<Backup[]>([]);
  const [restore, setRestore] = useState<Backup | null>(null);
  const [colors, setColors] = useState<ColorProfile>(() => readSaved('tz-colors', { name: 'Competitive clarity', vibrance: 135, brightness: 100, contrast: 108, warmth: 0 }));
  const [colorProfiles, setColorProfiles] = useState<ColorProfile[]>(() => readSaved('tz-color-profiles', []));
  const [modes, setModes] = useState<DisplayMode[]>([]);
  const [displayError, setDisplayError] = useState('');
  const [displayBusy, setDisplayBusy] = useState(false);
  const displayGeneration = useRef(0);
  const [resolution, setResolution] = useState('1920x1080');
  const [rate, setRate] = useState(60);
  const [displayPending, setDisplayPending] = useState(false);
  const [seconds, setSeconds] = useState(15);
  const [peripheral, setPeripheral] = useState('Mouse');
  const [selectedDevice, setSelectedDevice] = useState<Peripheral | null>(null);
  const [streamTarget, setStreamTarget] = useState('Twitch');
  const [streamQuality, setStreamQuality] = useState('Balanced');
  const native = !!window.tweaker;
  const isScanned = reportKind !== 'none';
  const guidanceHardware = isScanned ? system : null;
  const tweaks = tweaksForHardware(guidanceHardware);
  const displayHelp = displayGuidance(guidanceHardware);
  const scanGeneration = useRef(0);
  const peripheralGeneration = useRef(0);
  const importRef = useRef<HTMLInputElement>(null);
  const notify = (message: string) => setToast(message);
  const devices = peripheralReport?.peripherals ?? (peripheralError ? [] : system.peripherals);
  useEffect(() => { if (tweakStatus.report) { const matches = new Set(tweakStatus.report.tweaks.filter(t => t.status === 'enabled').map(t => t.id)); setSelected(v => v.filter(id => !matches.has(id))); } }, [tweakStatus.report]);
  useEffect(() => {
    if (!window.tweaker?.getHardwareMemory) return;
    let alive = true;
    const hardwareGeneration = scanGeneration.current, devicesGeneration = peripheralGeneration.current;
    window.tweaker.getHardwareMemory().then(saved => {
      if (!alive || hardwareGeneration !== scanGeneration.current || devicesGeneration !== peripheralGeneration.current) return;
      // Validate everything before publishing any restored state.
      const hardware = saved.system ? parseHardwareReport(saved.system) : null;
      const peripherals = saved.peripherals ? parsePeripheralReport(saved.peripherals) : null;
      if (hardware) acceptHardware(hardware, 'cached');
      if (saved.drivers) { setDriverReport(saved.drivers); setSavedDrivers(true); }
      if (peripherals) { setPeripheralReport(peripherals); setSavedPeripherals(true); }
      setMemoryError(saved.warning || '');
    }).catch(e => { if (alive && hardwareGeneration === scanGeneration.current) setMemoryError(`Saved scan could not be loaded. ${String(e)}`); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { saveLocal('tz-selected', selected); }, [selected]);
  useEffect(() => { saveLocal('tz-profile', profile); }, [profile]);
  useEffect(() => { saveLocal('tz-reviewed', reviewed); }, [reviewed]);
  useEffect(() => { saveLocal('tz-colors', colors); }, [colors]);
  useEffect(() => { saveLocal('tz-color-profiles', colorProfiles); }, [colorProfiles]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowSearch(v => !v); } }; window.addEventListener('keydown', onKey); if (window.tweaker) { window.tweaker.listBackups().then(setBackups).catch(e => notify(String(e))); void refreshDisplayModes(); } return () => window.removeEventListener('keydown', onKey); }, []);
  useEffect(() => { if (!displayPending) return; const timer = setInterval(() => setSeconds(v => { if (v <= 1) { setDisplayPending(false); notify('Display test expired. The desktop app restores the previous mode.'); return 0; } return v - 1; }), 1000); return () => clearInterval(timer); }, [displayPending]);
  async function refreshDisplayModes() {
    if (!window.tweaker) return;
    const generation = ++displayGeneration.current;
    setDisplayBusy(true); setDisplayError(''); setModes([]);
    try {
      const reported = parseDisplayModes(await window.tweaker.getDisplayModes());
      if (generation !== displayGeneration.current) return;
      const selectedMode = supportedSelection(reported, resolution, rate)!;
      setModes(reported); setResolution(`${selectedMode.width}x${selectedMode.height}`); setRate(selectedMode.refreshRate);
    } catch (e) { if (generation === displayGeneration.current) setDisplayError(String(e)); }
    finally { if (generation === displayGeneration.current) setDisplayBusy(false); }
  }
  const toggle = (id: string) => { if (!configured(id)) setSelected(v => v.includes(id) ? v.filter(i => i !== id) : [...v, id]); };
  const go = (next: Page) => { setPage(next); setQuery(''); };
  function clearHardware() {
    ++peripheralGeneration.current; setScanningDevices(false);
    setDriverReport(null); setSavedDrivers(false); setSavedPeripherals(false);
    setSystem(emptyHardware); setReportKind('none'); setSelectedDevice(null); setPeripheralReport(null); setPeripheralError(''); setDetail(null);
  }
  function acceptHardware(report: SystemScan, source: 'native' | 'imported' | 'cached') {
    ++peripheralGeneration.current; setScanningDevices(false);
    setDriverReport(null); setSavedDrivers(false); setSavedPeripherals(source === 'cached' && !report.warnings?.some(w => w.component === 'peripherals'));
    setMemoryError(report.warnings?.find(w => w.component === 'Saved scan')?.message || '');
    setSystem(report); setReportKind(source); setScanError(''); setSelectedDevice(null); setDetail(null);
    const failure = report.warnings?.find(w => w.component === 'peripherals');
    setPeripheralError(failure?.message ?? '');
    setPeripheralReport(failure ? null : { peripherals: report.peripherals, scannedAt: report.scannedAt, warnings: [] });
  }
  async function scanCurrentHardware() {
    const generation = ++scanGeneration.current;
    clearHardware(); setScanning(true); setScanError('');
    try {
      const report = parseHardwareReport(await window.tweaker!.scan());
      if (generation !== scanGeneration.current) return;
      acceptHardware(report, 'native');
      notify(report.warnings?.length ? 'Scan finished with some unavailable details. Review the collection warnings.' : 'Hardware scan complete. Guidance across the workspace now uses this report.');
    } catch (e) { if (generation !== scanGeneration.current) return; clearHardware(); setScanError(String(e)); throw e; }
    finally { if (generation === scanGeneration.current) setScanning(false); }
  }
  async function scanDriverReport(): Promise<DriverReport> {
    const generation = ++scanGeneration.current;
    clearHardware(); setScanning(true); setScanError('');
    try {
      const report = await window.tweaker!.scanDrivers();
      const hardware = parseHardwareReport(report.hardware);
      if (generation !== scanGeneration.current) throw new Error('A newer hardware scan replaced this scan. Scan drivers again to refresh this view.');
      acceptHardware(hardware, 'native'); setDriverReport(report); setSavedDrivers(false); setMemoryError(report.warnings.find(w => w.component === 'Saved scan')?.message || ''); return report;
    } catch (e) { if (generation === scanGeneration.current) { clearHardware(); setScanError(String(e)); } throw e; }
    finally { if (generation === scanGeneration.current) setScanning(false); }
  }
  async function scan() {
    setPage('PC scanner');
    if (!native) { notify('Open the Windows desktop app to scan your PC, or import a hardware report. No hardware is assumed.'); return; }
    try { await scanCurrentHardware(); void tweakStatus.refresh(); }
    catch { notify('Hardware scan failed. No previous hardware recommendations are being used.'); }
  }
  async function scanDevices() {
    if (!native) { notify('Open the Windows desktop app to scan connected peripherals.'); return; }
    const generation = ++peripheralGeneration.current;
    setScanningDevices(true); setPeripheralError(''); setSelectedDevice(null); setPeripheralReport(null);
    try {
      const report = parsePeripheralReport(await window.tweaker!.scanPeripherals());
      if (generation !== peripheralGeneration.current) return;
      setPeripheralReport(report); setSavedPeripherals(false); setMemoryError(report.warnings?.find(w => w.component === 'Saved scan')?.message || '');
      notify(`${report.peripherals.length} connected peripherals found.`);
    } catch (e) { if (generation === peripheralGeneration.current) { setPeripheralReport(null); setPeripheralError(String(e)); notify('Peripheral scan failed. The error details are shown below.'); } }
    finally { if (generation === peripheralGeneration.current) setScanningDevices(false); }
  }
  async function forgetHardware() {
    if (!window.tweaker?.forgetHardwareMemory) return;
    ++scanGeneration.current; ++peripheralGeneration.current;
    setForgetting(true); setMemoryError('');
    try { await window.tweaker.forgetHardwareMemory(); clearHardware(); setScanning(false); setConfirmForget(false); notify('Saved scan forgotten. Profiles, recordings, backups and change history were kept.'); }
    catch(e) { setMemoryError(String(e)); }
    finally { setForgetting(false); }
  }
  async function openSettings(target: string) { if (!native) { notify('Windows settings shortcuts are available in the desktop app.'); return; } try { await window.tweaker!.openSettings(target); } catch (e) { notify(String(e)); } }
  function selectRecommended() { setSelected(auto.filter(t => t.recommended && !configured(t.id)).map(t => t.id)); setShowReview(true); }
  function exportPlan() { download('tweakerzzz-setup-plan.json', JSON.stringify({ version: 1, profile, createdAt: new Date().toISOString(), hardwareSource: reportKind, system, changes: tweaks.filter(t => selected.includes(t.id)), note: 'This plan does not change Windows. Apply supported changes in the Windows desktop app; benchmark before and after.' }, null, 2)); notify('Setup plan downloaded. No system settings were changed.'); }
  async function apply() {
    if (!native) { exportPlan(); return; }
    setBusy(true); setOperationError(''); setBlockedPlan({ items: [], message: '' }); tweakStatus.invalidate();
    try {
      const result = await window.tweaker!.applyTweaks(selected);
      if (result.blocked?.length) {
        setBlockedPlan({ items: result.blocked, message: result.message });
        notify('The plan needs review. Remove blocked tweaks to use the remaining changes.');
        return;
      }
      setSelected([]); setShowReview(false); notify(result.message);
      window.tweaker!.listBackups().then(setBackups).catch(() => notify('Changes were applied, but backup history could not refresh. Reopen Restore center before further changes.'));
    } catch (e) { setOperationError(String(e)); notify('Could not apply changes. Review the error details in your plan.'); }
    finally { await tweakStatus.refresh(); setBusy(false); }
  }

  async function restoreSelected() { if (!restore || !native) return; setBusy(true); setOperationError(''); tweakStatus.invalidate(); try { const result = await window.tweaker!.restoreBackup(restore.id); setRestore(null); notify(result.message); window.tweaker!.listBackups().then(setBackups).catch(() => notify('Settings were restored, but backup history could not refresh. Reopen the app to refresh the list.')); } catch (e) { setOperationError(String(e)); notify('Restore failed. Review the error details.'); } finally { await tweakStatus.refresh(); setBusy(false); } }
  async function importReport(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('Report is too large.');
      const data = JSON.parse(await file.text()); const report = parseHardwareReport(data);
      if (data.source === 'reference' || data.source === 'none' || !report.scannedAt) throw new Error('This file has no hardware scan. Run a native scan to identify this PC.');
      ++scanGeneration.current; setScanning(false); acceptHardware(report, 'imported'); notify('Imported report loaded. Guidance uses this report; it is not a live scan of this PC.');
    } catch (e) { notify(`Import failed: ${String(e)}`); }
  }

  const filtered = tweaks.filter(t => {
    if (category !== 'All tweaks' && t.category !== category) return false;
    if (!`${t.title} ${t.description} ${t.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())) return false;
    switch (filter) {
      case 'Automatic': return t.mode === 'automatic';
      case 'Selected': return selected.includes(t.id);
      case 'Recommended': return t.recommended;
      case 'Already configured': return configured(t.id);
      case 'Different or unset': return ['not-enabled', 'not-configured'].includes(states.get(t.id)?.status ?? '');
      case 'Unknown': return t.mode === 'automatic' && (!states.has(t.id) || states.get(t.id)?.status === 'unknown');
      default: return true;
    }
  });
  const suggestions = tweaks.filter(t => t.recommended && t.mode === 'automatic').slice(0, 4);
  const hardware = [ { label: 'PROCESSOR', title: system.cpu.name.replace('AMD ', ''), subtitle: `${system.cpu.cores ?? 'Unknown'} cores / ${system.cpu.threads ?? 'Unknown'} threads`, icon: Cpu }, { label: 'GRAPHICS CARD', title: system.gpu.name.replace('NVIDIA GeForce ', ''), subtitle: system.gpu.vramGB === null ? 'VRAM not reported by driver' : `${system.gpu.vramGB} GB dedicated VRAM`, icon: TvMinimal }, { label: 'MEMORY', title: system.memory.totalGB === null ? 'RAM not reported' : `${system.memory.totalGB} GB RAM`, subtitle: system.memory.speedMHz === null ? 'Memory speed not reported' : `${system.memory.speedMHz.toLocaleString()} MHz memory speed`, icon: MemoryStick }, { label: 'STORAGE', title: system.storage.totalGB === null ? 'Storage not reported' : `${(system.storage.totalGB / 1000).toFixed(2)} TB total`, subtitle: system.storage.freeGB === null ? 'Free space not reported' : `${(system.storage.freeGB / 1000).toFixed(2)} TB available`, icon: HardDrive } ];
  const nativeRes = [...new Set(modes.map(m => `${m.width}x${m.height}`))];
  const rates = modes.filter(m => `${m.width}x${m.height}` === resolution).map(m => m.refreshRate);
  const stream = streamSettings(guidanceHardware, streamTarget, streamQuality);
  const obsSettings = stream.rows;

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => go('Overview')} aria-label="Tweakerzzz home"><span className="brand-mark"><Zap fill="currentColor" size={23}/></span><span>TWEAKER<span className="brand-zzz">ZZZ</span><small>POP. PLAY. CREATE.</small></span></button>
      <div className="workspace-label">WORKSPACE <span>01</span></div>
      <nav aria-label="Main navigation">{nav.map(({ name, icon: Icon }) => <button aria-label={name} aria-current={page === name ? 'page' : undefined} key={name} className={`nav-item ${page === name ? 'active' : ''}`} onClick={() => go(name)}><Icon size={18}/><span>{name}</span>{name === 'Optimizations' && <span className="nav-count">{tweaks.length}</span>}{name === 'Restore center' && backups.length > 0 && <span className="nav-count">{backups.length}</span>}</button>)}</nav>
      <div className="sidebar-divider"/>
      <button aria-label="How it works" className="nav-item" onClick={() => setShowAbout(true)}><CircleHelp size={18}/><span>How it works</span><ArrowUpRight className="muted" size={14}/></button>
      <button aria-label="Updates" className={`nav-item ${page === 'Updates' ? 'active' : ''}`} onClick={() => go('Updates')}><Download size={18}/><span>Updates</span></button>
      <div className="sidebar-bottom"><div className="safe-card"><ShieldCheck size={21}/><strong>Performance. With a plan.</strong><p>Review every change.<br/>Keep a way back.</p><button onClick={() => go('Restore center')}>Explore restore center <ArrowRight size={13}/></button></div><div className="machine-status"><span className="status-light"/><div><strong>{native ? 'Desktop connected' : 'Workspace preview'}</strong><small>{native ? 'Windows companion' : 'Your specs. Your starting point.'}</small></div><button className="icon-button" aria-label="App information" onClick={() => setShowAbout(true)}><Settings2 size={17}/></button></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13}/><strong>{page}</strong></div><div className="topbar-actions"><button className="search-button" onClick={() => setShowSearch(true)}><Search size={15}/><span>Find a tweak...</span><kbd>⌘ K</kbd></button><button className="build-tag" aria-label="Check app updates" onClick={() => go('Updates')}>v{version} <span>BETA</span></button><button className="avatar" aria-label="Your setup" onClick={() => go('PC scanner')}>M</button></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">{page === 'Overview' ? 'HOT PINK. HIGH STANDARDS.' : 'YOUR PERFORMANCE WORKSPACE'}</div><h1>{page === 'Overview' ? 'Make every frame pop.' : page}</h1><p>{({ Updates: 'New features and fixes, whenever you’re ready.', Overview: 'Less overhead. Smoother games. More room to create.', Optimizations: 'Small changes, considered carefully. Build a setup that works for you.', 'PC scanner': 'Know what’s under the hood before you turn things up.', 'Display studio': 'Your desktop. Your games. A different look for each.', 'Drivers & devices': 'Official software for the hardware in your PC.', Peripherals: 'A more responsive setup starts at your fingertips.', 'Streaming lab': 'Keep the game smooth and the content looking sharp.', 'FPS recorder': 'Record your games. Compare your changes. Keep the evidence.', 'Restore center': 'Experiment with confidence. Keep your original settings close.' })[page]}</p></div><div className="page-actions">{page === 'Overview' ? <button className="button secondary compact" onClick={scan}><ScanLine size={16}/>Scan my PC<ArrowUpRight size={14}/></button> : <Pill tone="subtle"><span className={`status-light ${native ? '' : 'amber'}`}/>{native ? 'Desktop connected' : 'Planning mode'}</Pill>}</div></div>

        <Diagnostics title="Saved hardware scan needs attention" error={memoryError}/>
        {(reportKind === 'cached' || savedDrivers || savedPeripherals) && <div className="notice saved-hardware-note" role="status"><History size={20}/><div><strong>Using a saved scan</strong><span>Last scanned {new Date((reportKind === 'cached' ? system.scannedAt : savedDrivers ? driverReport?.scannedAt : peripheralReport?.scannedAt) || '').toLocaleString()}. Hardware, drivers, connected devices and free space may have changed. Rescan after changes.</span></div><button className="button secondary compact" disabled={scanning || forgetting} onClick={scan}>Rescan PC</button></div>}
        {page === 'Updates' && <Updates/>}
        {page === 'FPS recorder' && <PerformanceLab hardware={reportKind === 'native' || reportKind === 'cached' ? system : null} hardwareIsSaved={reportKind === 'cached'} settings={tweakStatus.report} scanHardware={scanCurrentHardware} refreshSettings={tweakStatus.refresh} review={ids => { setSelected(ids.filter(id => !configured(id))); setShowReview(true); }} details={id => setDetail(tweaks.find(t => t.id === id) ?? null)} restore={() => go('Restore center')}/>}
        {page === 'Drivers & devices' && <DriverCenter report={driverReport} saved={savedDrivers} scanReport={scanDriverReport}/>}
        {page === 'Overview' && <>
          <section className="hero">
            <div className="hero-grid"/><div className="hero-copy"><Pill tone="lime"><Sparkles size={12}/>BUILT AROUND YOUR HARDWARE</Pill><h2>Sweet setup.<br/>Serious <span>play.</span></h2><p>A focused toolkit for smoother play and better creation.<br className="desktop-break"/> Scan. Measure. Save your settings. Then fine-tune.</p><div className="hero-actions"><button className="button primary" onClick={() => go('PC scanner')}><ScanLine size={16}/>Open PC scanner<ArrowRight size={16}/></button><button className="text-button" onClick={selectRecommended}>Build my optimization plan<ArrowUpRight size={14}/></button></div><div className="hero-foot"><ShieldCheck size={13}/><span>Reversible settings</span><i/><span>No inflated FPS promises</span></div></div>
            <div className="hero-visual" aria-label={`${auto.length} reversible tweaks available`}><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-dot one"/><div className="orbit-dot two"/><div className="gauge"><svg viewBox="0 0 220 220"><circle className="gauge-track" cx="110" cy="110" r="96"/><circle className="gauge-fill" cx="110" cy="110" r="96"/></svg><div className="gauge-content"><Zap size={22}/><strong>{auto.length}<span>+</span></strong><span>REVERSIBLE TWEAKS</span><small>Ready when you are</small></div></div><div className="visual-chip chip-top"><span className="status-light"/>SYSTEM POTENTIAL</div><div className="visual-chip chip-bottom"><Layers3 size={13}/>{tweaks.length} ways to fine-tune</div></div>
          </section>
          <div className="hardware-heading"><span><span className="status-light"/>{isScanned ? 'YOUR HARDWARE REPORT' : 'SCAN TO IDENTIFY YOUR PC'}</span><button onClick={() => go('PC scanner')}>{isScanned ? 'View scan report' : 'No hardware assumed'}<ArrowUpRight size={12}/></button></div>
          <div className="hardware-grid">{hardware.map(({ label, title, subtitle, icon: Icon }) => <button className="hardware-card" key={label} onClick={() => go('PC scanner')}><div className="hardware-label"><Icon size={17}/><span>{label}</span><ArrowUpRight size={12}/></div><strong>{title}</strong><small>{subtitle}</small><div className="hardware-line"><span/></div></button>)}</div>
          <section className="workflow-guide" aria-labelledby="workflow-heading"><h2 id="workflow-heading">Your setup workflow</h2><p>Follow these steps at your own pace. Every tool stays available.</p><ol>{workflow.map(({ page: destination, label, description }, index) => <li key={destination}><button aria-label={`Step ${index + 1}: ${label}`} onClick={() => go(destination)}><span className="workflow-number" aria-hidden="true">{index + 1}</span><span><strong>{label}</strong><small>{description}</small></span><ChevronRight size={17}/></button></li>)}</ol><div className="workflow-repeat"><Activity size={18}/><div><strong>Then measure again.</strong><p>Return to FPS recorder for an After run in the same scene. Change one thing at a time to learn what helped; keep drivers and the streaming/recording workload consistent for tweak comparisons.</p><button className="text-button" onClick={() => go('FPS recorder')}>Compare your results<ArrowRight size={15}/></button></div></div></section>
          <div className="content-columns"><div className="main-column"><SectionTitle title="How are you playing today?"><span className="quiet-label">ONE PC. DIFFERENT PRIORITIES.</span></SectionTitle><div className="profile-grid">{([{ name: 'Gaming', icon: Gamepad2, label: 'Every frame matters.', sub: 'Responsiveness comes first.' }, { name: 'Streaming', icon: Radio, label: 'Play. Connect. Go live.', sub: 'Room for your game and OBS.' }, { name: 'Recording', icon: Video, label: 'Make it worth watching.', sub: 'Quality with less overhead.' }] as const).map(({ name, icon: Icon, label, sub }) => <button className={`profile-card ${profile === name ? 'chosen' : ''}`} key={name} onClick={() => { setProfile(name); notify(`${name} profile selected. Review recommendations before applying.`); }}><div className="profile-top"><Icon size={22}/><span className="radio-circle">{profile === name && <span/>}</span></div><strong>{name}</strong><span>{label}</span><small>{sub}</small></button>)}</div><SectionTitle title="A good place to start"><button className="text-button" onClick={() => go('Optimizations')}>View all {tweaks.length}<ArrowRight size={14}/></button></SectionTitle><div className="recommendations">{suggestions.map((t, i) => <div className="recommendation" key={t.id}><span className={`recommend-icon icon-${i}`}>{i === 0 ? <Gamepad2 size={18}/> : i === 1 ? <Video size={18}/> : i === 2 ? <Mouse size={18}/> : <Layers3 size={18}/>}</span><button className="recommend-copy" onClick={() => setDetail(t)}><strong>{t.title}<ArrowUpRight size={12}/></strong><span>{t.description}</span></button><Pill>{configured(t.id) ? 'Configured' : t.impact}</Pill><Toggle on={configured(t.id) || selected.includes(t.id)} disabled={configured(t.id) || tweakStatus.checking || busy} onClick={() => toggle(t.id)} label={configured(t.id) ? `Already configured: ${t.title}` : `Select ${t.title}`}/></div>)}</div><div className="list-foot"><Info size={13}/>Toggles add changes to your plan. Nothing is applied automatically.</div></div>
          <div className="side-column"><SectionTitle title="Your selected profile"/><div className="next-move"><span className="mini-icon"><WandSparkles size={23}/></span><Pill tone="lime">{profile.toUpperCase()} PROFILE</Pill><h3>{profile === 'Gaming' ? 'Less in the background. More in the game.' : profile === 'Streaming' ? 'Your game and your stream. In sync.' : 'Great moments deserve great captures.'}</h3><p>{profile === 'Gaming' ? 'After recording your baseline and saving a snapshot, review Game Mode, capture settings, and desktop preferences.' : encoderGuidance(guidanceHardware)}</p><div className="next-details"><span><Check size={14}/>Review the tradeoffs</span><span><Check size={14}/>Back up original settings</span><span><Check size={14}/>Benchmark your results</span></div><button className="button primary full" onClick={profile === 'Gaming' ? selectRecommended : () => go('Streaming lab')}>{profile === 'Gaming' ? 'Review recommended tweaks' : 'Open streaming lab'}<ArrowRight size={15}/></button><small>Record an After run to compare your changes.</small></div><button className="display-teaser" onClick={() => go('Display studio')}><span className="color-icon"><Monitor size={23}/></span><div><strong>A fresh perspective</strong><span>Vibrance & stretched resolution</span></div><ArrowUpRight size={17}/></button></div></div>
        </>}

        {(page === 'Overview' || page === 'Optimizations') && native && <>
          <section className="windows-status-bar"><ShieldCheck size={20}/><div><strong>{tweakStatus.checking ? 'Checking saved Windows settings…' : tweakStatus.report ? `${configuredCount} of ${auto.length} automatic tweaks already configured` : 'Windows settings have not been verified'}</strong><p>{tweakStatus.report ? `Checked ${new Date(tweakStatus.report.checkedAt).toLocaleTimeString()}. Guided settings need a manual check.` : 'This reads registry values and the active power plan. It does not apply changes.'}</p></div><button className="button secondary compact" onClick={() => { void tweakStatus.refresh(); }} disabled={tweakStatus.checking || busy}>{tweakStatus.checking ? <LoaderCircle className="spin" size={14}/> : <RotateCcw size={14}/>}Check Windows settings</button></section>
          <Diagnostics title="Windows settings check failed" error={tweakStatus.error} retry={() => { void tweakStatus.refresh(); }}/>
        </>}
        {page === 'Optimizations' && <>
          <div className="summary-strip"><div><span className="mini-icon"><SlidersHorizontal size={21}/></span><strong>{tweaks.length}<small>curated tweaks</small></strong></div><div><strong>{auto.length}<small>automatically reversible</small></strong></div><div><strong>{selected.length}<small>in your plan</small></strong></div><button className="button secondary" onClick={selectRecommended}><Sparkles size={15}/>Recommended plan</button></div>
          <div className="filter-bar"><div className="tabs">{['All tweaks', ...categories].map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="filter-inputs"><label className="input-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tweaks, settings, or games..." aria-label="Search optimizations"/></label><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter settings"><option>All settings</option><option>Automatic</option><option>Recommended</option><option>Selected</option><option>Already configured</option><option>Different or unset</option><option>Unknown</option></select></div></div>
          <p className="fine-print">{isScanned ? `Guidance uses ${reportKind === 'imported' ? 'the imported report' : reportKind === 'cached' ? 'this PC’s saved scan' : 'this PC’s scan'}: ${system.gpu.name}. GPU-specific guides are shown only for identified capabilities.` : 'General Windows and device guidance is shown. Scan your PC to add matching GPU and encoder guides.'}</p><div className="result-line"><span>{filtered.length} optimizations</span><span><ShieldCheck size={13}/>Your plan stays local until you apply it</span></div>
          <div className="tweak-grid">{filtered.map(t => <article className={`tweak-card ${selected.includes(t.id) ? 'selected' : ''}`} key={t.id}><div className="tweak-top"><Pill tone={t.risk === 'Low' ? 'subtle' : 'amber-pill'}>{t.risk} impact on behavior</Pill>{t.mode === 'automatic' ? <Toggle on={configured(t.id) || selected.includes(t.id)} disabled={configured(t.id) || tweakStatus.checking || busy} onClick={() => toggle(t.id)} label={configured(t.id) ? `Already configured: ${t.title}` : `Select ${t.title}`}/> : <span className="guided-label">{reviewed.includes(t.id) ? <CheckCheck size={13}/> : <ArrowUpRight size={13}/>}Guided</span>}</div><button className="tweak-copy" onClick={() => setDetail(t)}><h3>{t.title}</h3><p>{t.description}</p></button><div className="tweak-bottom"><span>{t.category}<i/>{t.impact}</span><button aria-label={`Details for ${t.title}`} onClick={() => setDetail(t)}><Info size={16}/></button></div>{t.mode === 'automatic' && <TweakStateBadge state={states.get(t.id)} native={native} checking={tweakStatus.checking}/>}</article>)}</div>{!filtered.length && <div className="empty-state"><Search size={32}/><h3>No tweaks found</h3><p>Try a different search or category.</p><button className="button secondary" onClick={() => { setQuery(''); setCategory('All tweaks'); setFilter('All settings'); }}>Clear filters</button></div>}
        </>}

        {page === 'PC scanner' && <>
          <Diagnostics title="Hardware scan failed" error={scanError} retry={scanning ? undefined : scan}/><Diagnostics title="Hardware scan completed with warnings" warnings={system.warnings ?? []}/>
          <div className="scan-banner"><div className={`scan-graphic ${scanning ? 'scanning' : ''}`}><Cpu size={54}/><span/><span/></div><div><Pill tone="lime">{isScanned ? 'REPORT LOADED' : 'SCAN NEEDED'}</Pill><h2>{scanning ? 'Getting to know your PC…' : isScanned ? 'Your hardware, at a glance.' : 'Meet your next starting line.'}</h2><p>{isScanned ? `${reportKind === 'imported' ? 'Imported report' : reportKind === 'cached' ? 'Saved native scan' : 'Native scan'}: ${new Date(system.scannedAt).toLocaleString()}` : 'Run a scan to identify this PC’s components, storage, and peripherals. Hardware-specific guidance appears after a scan.'}</p><div className="button-row"><button className="button primary" onClick={scan} disabled={scanning}>{scanning ? <LoaderCircle className="spin" size={16}/> : <ScanLine size={16}/>} {scanning ? 'Scanning...' : 'Run hardware scan'}</button><button className="button secondary" onClick={() => importRef.current?.click()}><Plus size={15}/>Import report</button><input type="file" ref={importRef} hidden accept=".json" onChange={e => { void importReport(e.target.files?.[0]); e.target.value = ''; }}/></div></div></div>
          {native && <section className="panel hardware-memory-controls"><h3>Remember this PC</h3><p>Successful PC, driver and peripheral scans are saved locally and loaded next time. Imported reports are not saved as this PC. Rescan whenever hardware or drivers change.</p><button className="button secondary" disabled={forgetting || scanning || scanningDevices || !window.tweaker?.forgetHardwareMemory} onClick={() => setConfirmForget(true)}>Forget saved scan</button>{confirmForget && <div className="callout"><p>Forget the saved PC, driver and peripheral reports? Your tweak profiles, recordings, backups and change history will stay.</p><div className="button-row"><button className="button secondary" disabled={forgetting} onClick={() => setConfirmForget(false)}>Keep saved scan</button><button className="button secondary" disabled={forgetting} onClick={forgetHardware}>Forget this PC</button></div></div>}</section>}
          <div className="hardware-grid scanner-cards">{hardware.map(({ label, title, subtitle, icon: Icon }) => <div className="hardware-card" key={label}><div className="hardware-label"><Icon size={19}/><span>{label}</span></div><strong>{title}</strong><small>{subtitle}</small></div>)}</div><div className="two-columns"><section className="panel"><SectionTitle title="System report"><Pill>{isScanned ? 'Scanned / imported' : 'Awaiting scan'}</Pill></SectionTitle><dl className="settings-list"><div><dt>Operating system</dt><dd>{system.os.name}</dd></div><div><dt>Version / build</dt><dd>{system.os.build}</dd></div><div><dt>Processor</dt><dd>{system.cpu.name}</dd></div><div><dt>Graphics</dt><dd>{system.gpu.name}</dd></div><div><dt>Storage available</dt><dd>{system.storage.freeGB === null ? 'Not reported' : `${Math.round(system.storage.freeGB)} GB`}</dd></div></dl><button className="button secondary full" onClick={() => download('tweakerzzz-hardware.json', JSON.stringify({ source: reportKind, system }, null, 2))}><Download size={15}/>Export hardware report</button></section><section className="panel"><SectionTitle title={isScanned ? "Guidance for this hardware report" : "Scan to personalize guidance"}/><div className="insight"><TvMinimal size={20}/><div><strong>Choose an encoder for your GPU</strong><p>{encoderGuidance(guidanceHardware)}</p></div></div><div className="insight"><MemoryStick size={20}/><div><strong>Keep your memory profile in check</strong><p>{memoryGuidance(guidanceHardware)}</p></div></div><div className="insight"><Gauge size={20}/><div><strong>Measure the moments that matter</strong><p>Compare average FPS and 1% lows in the same scene. Your game, thermals, and capture workload all matter.</p></div></div><button className="text-button" onClick={() => go('Optimizations')}>Explore your recommendations<ArrowRight size={14}/></button></section></div>
        </>}

        {page === 'Display studio' && <>
          <ProgramColors/>
          <Diagnostics title="Display modes unavailable" error={displayError} retry={displayBusy || displayPending ? undefined : refreshDisplayModes}/>
          <div className="display-layout"><section className="panel display-preview-panel"><SectionTitle title="Find your look"><Pill tone="lime">LIVE PREVIEW</Pill></SectionTitle><div className="landscape" style={{ filter: `saturate(${colors.vibrance / 100}) brightness(${colors.brightness / 100}) contrast(${colors.contrast / 100}) sepia(${colors.warmth / 100})` }}><div className="sun"/><div className="mountain far"/><div className="mountain middle"/><div className="mountain near"/><div className="landscape-grid"/><span className="crosshair">+</span><div className="landscape-hud"><span>THE NEXT HORIZON</span><span>COLOR STUDY / 01</span></div></div><div className="preview-foot"><Monitor size={14}/><span>Visual preview only · your monitor settings are unchanged</span></div><div className="color-presets">{[{ name: 'Natural', vibrance: 100, contrast: 100, brightness: 100, warmth: 0 }, { name: 'Competitive', vibrance: 150, contrast: 110, brightness: 105, warmth: 0 }, { name: 'Cinema', vibrance: 115, contrast: 120, brightness: 95, warmth: 12 }].map(p => <button key={p.name} className={colors.name === p.name ? 'active' : ''} onClick={() => setColors(p)}><span className={`swatch ${p.name.toLowerCase()}`}/>{p.name}</button>)}</div></section><section className="panel"><SectionTitle title="Color profile"><button className="icon-button" aria-label="Reset color preview" onClick={() => setColors({ name: 'Natural', vibrance: 100, brightness: 100, contrast: 100, warmth: 0 })}><RotateCcw size={16}/></button></SectionTitle><label className="field-label">PROFILE NAME<input value={colors.name} maxLength={40} onChange={e => setColors({ ...colors, name: e.target.value })}/></label>{[{ key: 'vibrance', label: 'Digital vibrance', min: 0, max: 200 }, { key: 'brightness', label: 'Brightness', min: 50, max: 150 }, { key: 'contrast', label: 'Contrast', min: 50, max: 150 }, { key: 'warmth', label: 'Warmth', min: 0, max: 50 }].map(s => <label className="range-field" key={s.key}><span>{s.label}<strong>{colors[s.key as keyof Omit<ColorProfile, 'name'>]}%</strong></span><input type="range" min={s.min} max={s.max} value={colors[s.key as keyof Omit<ColorProfile, 'name'>]} onChange={e => setColors({ ...colors, [s.key]: Number(e.target.value) })}/></label>)}<button className="button primary full" onClick={() => { if (!colors.name.trim()) { notify('Give your color profile a name.'); return; } setColorProfiles(v => [...v.filter(p => p.name !== colors.name).slice(-29), { ...colors }]); notify('Preview profile saved locally. Use the detected GPU’s color controls for actual display changes.'); }}><Plus size={15}/>Save preview profile</button><p className="fine-print">Preview values are visual references, not calibrated driver values. {displayHelp.color}</p></section></div>
          {colorProfiles.length > 0 && <div className="saved-profiles"><span className="eyebrow">SAVED LOOKS</span>{colorProfiles.map(p => <button className="button secondary compact" key={p.name} onClick={() => setColors(p)}><Layers3 size={14}/>{p.name}</button>)}</div>}
          <section className="panel resolution-panel"><div><Pill tone="subtle">STRETCHED RESOLUTION</Pill><h2>A different angle on your game.</h2><p>Choose a reported mode for the Windows primary display. {displayHelp.scaling}</p><button className="text-button" onClick={() => openSettings(displayHelp.vendor === 'nvidia' ? 'nvidia' : 'display')}>{displayHelp.vendor === 'nvidia' ? 'Open NVIDIA settings' : 'Open Windows display settings'}<ArrowUpRight size={14}/></button></div><div className="resolution-controls"><div className="resolution-diagram"><div><span>{resolution.replace('x', ' × ')}</span><span>{displayAspect(resolution)}</span></div></div><div className="field-row"><label className="field-label">RESOLUTION<select aria-label="Display resolution" disabled={displayBusy || displayPending || (native && !modes.length)} value={native && !modes.length ? '' : resolution} onChange={e => { setResolution(e.target.value); const match = supportedSelection(modes.filter(m => `${m.width}x${m.height}` === e.target.value), e.target.value, rate); if (match) setRate(match.refreshRate); }}>{native && !modes.length && <option value="">{displayBusy ? 'Loading reported modes…' : 'No modes available'}</option>}{(native ? nativeRes : ['1920x1080', '1728x1080', '1440x1080', '1280x720']).map(m => <option key={m} value={m}>{m.replace('x', ' × ')}</option>)}</select></label><label className="field-label">REFRESH RATE<select aria-label="Display refresh rate" disabled={displayBusy || displayPending || (native && !modes.length)} value={native && !modes.length ? '' : rate} onChange={e => setRate(Number(e.target.value))}>{native && !modes.length && <option value="">Not reported</option>}{[...new Set(native ? rates : [60, 120, 144, 165, 240])].map(r => <option key={r} value={r}>{r} Hz</option>)}</select></label></div><button className="button secondary full" disabled={displayBusy || displayPending || (native && !modes.length)} onClick={async () => { if (!native) { notify('Resolution testing requires the Windows app. It will offer only modes reported by your display.'); return; } const selectedMode = modes.find(m => `${m.width}x${m.height}` === resolution && m.refreshRate === rate); if (!selectedMode) { setDisplayError('Refresh the display modes and choose a reported resolution and refresh rate.'); return; } setDisplayBusy(true); setDisplayError(''); try { await window.tweaker!.setDisplayMode(selectedMode); setSeconds(15); setDisplayPending(true); } catch (e) { setDisplayError(String(e)); } finally { setDisplayBusy(false); } }}><Monitor size={15}/>Test resolution <span className="button-note">15s auto-revert</span></button>{native && <button className="text-button" disabled={displayBusy || displayPending} onClick={refreshDisplayModes}>Refresh display modes</button>}<p className="fine-print">{native ? 'Check the selected resolution and refresh rate before testing. Only modes reported for the primary display are offered.' : 'Sample modes for planning only. Open the desktop app to read your display’s supported modes.'}</p></div></section>
        </>}

        {page === 'Peripherals' && <>
          <Diagnostics title="Peripheral scan failed" error={peripheralError} retry={scanningDevices ? undefined : scanDevices}/>
          <div className="notice"><Mouse size={18}/><div><strong>{devices.length ? `${devices.length} device entries in your report` : peripheralReport ? 'No supported connected peripherals reported' : 'Let’s connect the dots.'}</strong><span>{peripheralReport && !devices.length ? 'The scan completed. Windows did not report connected devices in the supported categories.' : devices.length ? 'Select a category below for practical settings. Windows does not expose every device’s DPI or polling rate.' : 'Scan devices to discover connected peripherals. You can explore recommendations now.'}</span></div><button className="button secondary compact" onClick={scanDevices} disabled={scanningDevices || scanning}>{scanningDevices ? <LoaderCircle className="spin" size={15}/> : <ScanLine size={15}/>} {scanningDevices ? 'Scanning devices…' : 'Scan devices'}</button></div>
          <PeripheralDevices devices={devices} onSelect={device => { setSelectedDevice(device); setPeripheral(device.type === 'Other' ? 'Mouse' : device.type); }} onExport={() => download('tweakerzzz-peripherals.json', JSON.stringify({ peripherals: devices, scannedAt: peripheralReport?.scannedAt ?? system.scannedAt, warnings: peripheralReport?.warnings ?? [] }, null, 2))}/>
          <PeripheralGuidance device={selectedDevice} category={peripheral} onCategory={category => { setPeripheral(category); setSelectedDevice(null); }} onSettings={openSettings} onTweaks={() => { setCategory('Peripherals'); setPage('Optimizations'); }}/>
        </>}

        {page === 'Streaming lab' && <>
          <div className="stream-hero"><span className="mini-icon"><Radio size={29}/></span><div><Pill tone="lime">{isScanned ? system.gpu.name : 'SCAN TO IDENTIFY YOUR GPU'}</Pill><h2>Good frames. Great content.</h2><p>{stream.note}</p></div><span className="waveform">{Array.from({ length: 25 }, (_, i) => <i key={i} style={{ height: `${12 + Math.sin(i * 0.8) ** 2 * 62}px` }}/>)}</span></div><div className="two-columns stream-columns"><section className="panel"><SectionTitle title="Make it your session"/><label className="field-label">DESTINATION<div className="segmented">{['Twitch', 'YouTube', 'Recording'].map(t => <button className={streamTarget === t ? 'active' : ''} key={t} onClick={() => setStreamTarget(t)}>{t}</button>)}</div></label><label className="field-label">YOUR PRIORITY<div className="priority-options">{['Competitive', 'Balanced', 'Quality'].map(q => <button className={streamQuality === q ? 'active' : ''} key={q} onClick={() => setStreamQuality(q)}><span className="radio-circle">{streamQuality === q && <span/>}</span><div><strong>{q}</strong><small>{q === 'Competitive' ? 'Lower output load. More game headroom.' : q === 'Balanced' ? 'A practical starting point for most sessions.' : 'More encoder work for better compression.'}</small></div></button>)}</div></label><div className="callout"><Info size={17}/><p>Leave GPU headroom for OBS compositing. Cap your game’s FPS, then check OBS Stats for rendering and encoding lag.</p></div><button className="text-button" onClick={() => { setCategory('Streaming'); setPage('Optimizations'); }}>More streaming recommendations<ArrowRight size={15}/></button></section><section className="panel obs-panel"><SectionTitle title="Your OBS starting settings"><Pill>{streamTarget}</Pill></SectionTitle><dl className="settings-list">{obsSettings.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><button className="button primary full" onClick={() => { download('tweakerzzz-obs-settings.txt', `TWEAKERZZZ / OBS STARTING PROFILE\nDestination: ${streamTarget}\nPriority: ${streamQuality}\nHardware source: ${reportKind}\nGPU: ${isScanned ? system.gpu.name : 'Not scanned'}\n${stream.note}\n\n${obsSettings.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nEnter these settings in OBS > Settings > Output > Advanced. This is a reference, not an importable OBS profile. Test a local recording first and watch OBS Stats. Use MKV for recording and remux to MP4. Match bitrate to platform limits and upload capacity.\n`, 'text/plain'); notify('OBS settings guide downloaded. Enter these values in OBS Advanced Output.'); }}><Download size={16}/>Export settings guide</button><p className="fine-print">{reportKind === 'imported' ? 'Based on the imported hardware report.' : reportKind === 'cached' ? 'Based on this PC’s saved hardware scan.' : isScanned ? 'Based on this PC’s hardware scan.' : 'Scan this PC to add encoder guidance.'} Encoder availability must be checked in OBS. Match bitrate to your service limits and upload capacity; validate with a test recording.</p></section></div>
        </>}

        {page === 'Restore center' && <>
          <RestoreTools report={tweakStatus.report} checking={tweakStatus.checking} refresh={tweakStatus.refresh} notify={notify} changed={async () => { setBackups(await window.tweaker!.listBackups()); }}/>
          <div className="notice"><ShieldCheck size={22}/><div><strong>A record of every automatic change.</strong><span>The Windows app saves original registry values and the active power plan before applying tweaks.</span></div><Pill tone="lime">LOCAL BACKUPS</Pill></div>{backups.length ? <div className="backup-list">{backups.map((b, i) => <div className="panel backup-row" key={b.id}><div className="mini-icon"><History size={23}/></div><div><h3>{{ snapshot: 'Settings snapshot', disable: 'Before turning off tweaks', defaults: 'Before Windows defaults' }[b.action ?? ''] ?? 'Optimization backup'}</h3><p>{new Date(b.createdAt).toLocaleString()} · {b.count} settings</p><small>{b.id}</small></div><button className="button secondary" disabled={i !== 0} title={i !== 0 ? 'Restore the most recent backup first to preserve change order.' : undefined} onClick={() => setRestore(b)}><RotateCcw size={15}/>Restore</button></div>)}</div> : <div className="empty-state restore-empty"><div className="empty-orbit"><ShieldCheck size={48}/></div><Pill tone="subtle">A CLEAN SLATE</Pill><h2>Your safety net starts here.</h2><p>Save a settings snapshot above, or apply your first plan in the Windows desktop app.<br/>You’ll find the original settings and a restore action here.</p><button className="button secondary" onClick={() => go('Optimizations')}>Explore optimizations<ArrowRight size={15}/></button></div>}<div className="two-columns"><div className="panel"><h3>What’s included</h3><p className="body-copy">Each automatic change records the existing registry value, its type, and whether it existed. Power plan changes retain the previous plan. Restore the newest backup first.</p></div><div className="panel"><h3>What needs its own backup</h3><p className="body-copy">Manual driver, BIOS, game, and OBS changes are outside this history. Save those profiles in their own tools before you adjust them.</p></div></div>
        </>}

        <footer className="footer"><span><span className="brand-dot"/>TWEAKERZZZ<span className="footer-divider">/</span>BUBBLEGUM EDITION. BUILT FOR PLAY.</span><span><ShieldCheck size={12}/>Local-first. No account required.</span></footer>
      </main>
    </div>
    {selected.length > 0 && !showReview && <div className="plan-bar"><span className="plan-number">{selected.length}</span><div><strong>Your optimization plan</strong><span>{selected.length} changes selected · review before applying</span></div><button className="text-button" onClick={() => setSelected([])}>Clear</button><button className="button primary compact" onClick={() => setShowReview(true)}>Review plan<ArrowRight size={15}/></button></div>}
    {toast && <div className="toast" role="status"><Info size={18}/><span>{toast}</span><button className="icon-button" onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
    {detail && <Modal title={detail.title} subtitle={`${detail.category} · ${detail.impact} · ${detail.mode === 'automatic' ? 'Automatic & reversible' : 'Guided setup'}`} onClose={() => setDetail(null)}><div className="modal-body"><Pill tone={detail.risk === 'Low' ? 'lime' : 'amber-pill'}>{detail.risk} impact on behavior</Pill><p>{detail.details}</p>{detail.mode === 'automatic' && <div className="state-detail"><TweakStateBadge state={states.get(detail.id)} native={native} checking={tweakStatus.checking}/><p>{states.get(detail.id)?.message ?? 'Run the Windows settings check to read this preference. Selecting a tweak is separate from its current Windows state.'}</p></div>}{detail.restart && <div className="callout"><RotateCcw size={16}/><p>Some changes may need a sign-out or restart before they take effect.</p></div>}{detail.steps && <ol className="guide-steps">{detail.steps.map(s => <li key={s}>{s}</li>)}</ol>}<div className="tag-list">{detail.tags.map(t => <Pill key={t}>{t}</Pill>)}</div><div className="modal-actions">{detail.mode === 'automatic' ? <button className="button primary" disabled={configured(detail.id) || tweakStatus.checking || busy} onClick={() => { toggle(detail.id); setDetail(null); }}>{selected.includes(detail.id) ? <Check size={16}/> : <Plus size={16}/>} {configured(detail.id) ? 'Already configured' : selected.includes(detail.id) ? 'Remove from plan' : 'Add to plan'}</button> : <button className="button primary" onClick={() => { setReviewed(v => [...new Set([...v, detail.id])]); setDetail(null); notify('Guide marked as reviewed. Apply the settings in the relevant app.'); }}><Check size={16}/>Mark guide as reviewed</button>}</div></div></Modal>}
    {showReview && <Modal title="A little review before the boost." subtitle={`${profile} profile · ${selected.length} selected changes`} onClose={() => { if (!busy) setShowReview(false); }} wide><div className="modal-body"><Diagnostics title="Could not apply the plan" error={operationError}/><BlockedTweaks blocked={blockedPlan.items.filter(item => selected.includes(item.id))} message={blockedPlan.message} busy={busy} remove={() => setSelected(ids => ids.filter(id => !blockedPlan.items.some(item => item.id === id)))}/><div className="callout"><ShieldCheck size={20}/><p>{native ? 'Original values will be backed up before changes are applied. Close active games and save your work first.' : 'You’re in the browser workspace. Export your plan, or run the Windows desktop app to apply supported changes with an automatic backup.'}</p></div><div className="review-list">{tweaks.filter(t => selected.includes(t.id)).map(t => <div key={t.id}><Check size={15}/><div><strong>{t.title}</strong><span>{t.risk} behavior impact{t.restart ? ' · Restart may be needed' : ''}</span></div><button className="icon-button" aria-label={`Remove ${t.title}`} onClick={() => toggle(t.id)} disabled={busy}><X size={15}/></button></div>)}</div>{!selected.length && <p>No changes selected. Recommended settings that already match Windows have been left out of your plan.</p>}<p className="fine-print">FPS gains vary by game and bottleneck. Compare the same scene before and after. “Reversible” covers the settings this app changes, not every system condition.</p><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setShowReview(false)}>Keep editing</button><button className="button primary" disabled={!selected.length || busy || tweakStatus.checking} onClick={apply}>{busy ? <LoaderCircle size={16} className="spin"/> : native ? <Zap size={16}/> : <ArrowDownToLine size={16}/>} {busy ? 'Applying changes...' : native ? `Back up & apply ${selected.length} changes` : 'Export my setup plan'}</button></div></div></Modal>}
    {showSearch && <Modal title="Find your next tweak" onClose={() => setShowSearch(false)}><div className="modal-body"><label className="input-search command-search"><Search size={18}/><input autoFocus placeholder="Try encoding, mouse, Game Mode..." aria-label="Find a tweak" value={query} onChange={e => setQuery(e.target.value)}/><Command size={16}/></label><div className="command-results">{tweaks.filter(t => `${t.title} ${t.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).slice(0, 7).map(t => <button key={t.id} onClick={() => { setShowSearch(false); setQuery(''); setDetail(t); }}><span><strong>{t.title}</strong><small>{t.category} · {t.mode}</small></span><ArrowUpRight size={15}/></button>)}{query && !tweaks.some(t => `${t.title} ${t.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())) && <p className="body-copy">No matching tweaks. Try another setting.</p>}</div></div></Modal>}
    {showAbout && <Modal title="A thoughtful kind of fast." subtitle={`Tweakerzzz · Windows performance workspace · v${version}`} onClose={() => setShowAbout(false)}><div className="modal-body"><ol className="workflow-help">{workflow.map(({ page: destination, label, description }) => <li key={destination}><strong>{label}</strong><p>{description}</p></li>)}</ol><p className="body-copy">Finish with an After recording of the same scene. Keep drivers, graphics settings, and streaming or recording conditions consistent when comparing Windows tweaks.</p><div className="callout"><Info size={18}/><p>Automatic per-program vibrance requires a supported NVIDIA display. Other color sliders are previews; vendor guidance follows the hardware report. Resolution testing and scanning require the Windows app. This workspace does not disable security tools or Windows updates.</p></div><button className="button primary full" onClick={() => setShowAbout(false)}>Let’s get started<ArrowRight size={15}/></button></div></Modal>}
    {restore && <Modal title="Restore original settings?" subtitle={`${restore.count} settings · ${new Date(restore.createdAt).toLocaleString()}`} onClose={() => { if (!busy) setRestore(null); }}><div className="modal-body"><Diagnostics title="Could not restore settings" error={operationError}/><p>This will restore the values saved in this backup, including any absent values. Settings you changed manually after this backup may also be replaced.</p><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setRestore(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={restoreSelected}>{busy ? <LoaderCircle className="spin" size={16}/> : <RotateCcw size={16}/>}Restore settings</button></div></div></Modal>}
    {displayPending && <Modal title="Keep this display mode?" subtitle={`Automatically restoring in ${seconds} seconds`} onClose={() => notify('Wait for the desktop app to restore the previous mode automatically.')}><div className="modal-body"><p>If everything looks good, keep these settings. If your screen is blank or distorted, wait for the automatic revert.</p><button className="button primary full" onClick={async () => { try { await window.tweaker!.confirmDisplayMode(); setDisplayPending(false); notify('Display mode confirmed.'); } catch (e) { notify(String(e)); } }}>Keep this display mode</button></div></Modal>}
  </div>;
}
