export interface Peripheral {
  name: string;
  type: 'Mouse' | 'Keyboard' | 'Audio' | 'Controller' | 'Camera' | 'Other';
  connection: string;
  identification?: 'reported' | 'usb-id' | 'vendor-only' | 'generic';
  manufacturer?: string;
  usbId?: string;
  interfaceCount?: number;
  interfaces?: string[];
}
export interface SystemScan {
  cpu: { name: string; cores: number | null; threads: number | null };
  gpu: { name: string; vramGB: number | null; driverVersion?: string };
  memory: { totalGB: number | null; speedMHz: number | null };
  os: { name: string; build: string };
  storage: { totalGB: number | null; freeGB: number | null };
  peripherals: Peripheral[];
  scannedAt: string;
  warnings?: ScanWarning[];
}
export interface ScanWarning { component: string; message: string }
export interface PeripheralScan { peripherals: SystemScan['peripherals']; scannedAt: string; warnings: ScanWarning[] }
export type TweakState = 'enabled' | 'not-enabled' | 'not-configured' | 'unknown';
export interface TweakStatus { id: string; status: TweakState; message: string; fingerprint?: string }
export interface TweakStatusReport { checkedAt: string; tweaks: TweakStatus[] }
export interface BlockedPreference { id: string; message: string }
export interface PreferenceResult { message: string; backupId: string | null; applied?: string[]; skipped?: string[]; blocked?: BlockedPreference[] }
export interface Backup { id: string; createdAt: string; count: number; action?: string; ids?: string[] }
export interface BenchmarkConditions { experiment: string; resolution: string; graphics: string; gameBuild: string; fpsCap: number; verified: boolean }
export interface CaptureOptions { processName: string; phase: 'before' | 'after'; context: 'Gaming' | 'Streaming' | 'Recording'; seconds: number; scenario: string; telemetry?: boolean; displayTracking?: boolean; benchmark?: BenchmarkConditions }
export interface UsageStats { samples: number; averagePercent: number | null; peakPercent: number | null }
export interface TelemetrySummary { enabled: boolean; intervalSeconds: number; cpu: UsageStats; memory: UsageStats; gpu: UsageStats & { name: string; peakTemperatureC: number | null }; cpuTemperatureC: number | null; cpuTemperatureSensor?: string | null; busiestCore?: UsageStats; minimumAvailableMemoryMB?: number | null; gpuMemory?: { samples: number; peakUsedMB: number | null; totalMB: number | null; peakPercent: number | null }; obs: { enabled?: boolean; samples: number; renderingLagPercent: number | null; encodingLagPercent: number | null; networkDropPercent: number | null; streaming: boolean; recording: boolean }; warnings: string[] }
export interface FrameWindow { startSecond: number; endSecond: number; frames: number; averageFps: number }
export interface FrameDistribution {
  frames: number; sampledSeconds: number; averageFps: number; onePercentLow: number | null; p95FrameMs: number;
  highestFps?: number | null; lowestFps?: number | null; pointOnePercentLow?: number | null;
  medianFps?: number; meanFrameMs?: number; p99FrameMs?: number; worstFrameMs?: number; frameTimeStdDevMs?: number;
  slowFrames50ms?: number; slowFrames100ms?: number; spikeThresholdMs?: number; spikeFrames?: number; timeline?: FrameWindow[];
}
export interface FrameSummary extends FrameDistribution {
  processId: number; swapChain: string; otherStreamFrames: number; invalidFrames: number; streamCount: number;
  metricsVersion?: 2; measurementBasis?: 'cpu-start-interval' | 'legacy-frame-time'; qualityIssues?: string[];
  duplicateRows?: number; zeroFrameRows?: number; generatedFrameRows?: number;
  displayTracking?: boolean; displayed?: FrameDistribution | null; notDisplayedFrames?: number | null; displayUnknownRows?: number;
  runtimes?: string[]; presentModes?: string[];
  streams?: { processId: number; swapChain: string; frames: number; duplicateRows: number; sampledSeconds: number }[];
}
export interface CaptureRecord extends CaptureOptions { version: number; id: string; startedAt: string; endedAt?: string; targetCheckedAt?: string; reanalyzedAt?: string; captureMethod?: 'presentmon-display-v2' | 'presentmon-application'; status: 'recording' | 'completed' | 'failed' | 'interrupted'; collector: string; settings: TweakStatusReport; settingsEnd?: TweakStatusReport | null; hardware?: SystemScan | null; hardwareKey?: string | null; telemetrySummary?: TelemetrySummary | null; summary: FrameSummary | null; error: string; collectorWarnings?: string; stopReason?: string }
export type CaptureStatus = ({ active: false } | (Partial<CaptureRecord> & { active: true; frames: number; stopping: boolean })) & { historyWarnings?: string[] };
export interface DisplayMode { width: number; height: number; refreshRate: number }
export interface ProgramColorConfig { displayId: string; desktop: number; sdrConfirmed: boolean; profiles: { processName: string; vibrance: number }[] }
export interface ColorStatus { active: boolean; activeProgram: string; supported: boolean; recoveryPending: boolean; displays: { id: string; label: string; vibrance: number }[]; config: ProgramColorConfig; error: string }
export interface DriverDevice {
  id: string; instanceId: string; name: string; category: string; manufacturer: string;
  hardwareIds: string[]; compatibleIds: string[]; classGuid: string; service: string;
  status: string; present: boolean | null; problemCode: number | null;
  provider: string; version: string; driverDate: string; infName: string;
  signed: boolean | null; signer: string; driverReported: boolean;
  source: string | null; sourceName: string;
}
export interface DriverChange {
  id: string; deviceId: string; instanceId: string; name: string; category: string;
  kind: 'first-seen' | 'not-reported' | 'driver-changed' | 'device-changed' | 'firmware-changed' | 'component-changed'; observedAt: string; previousScanAt: string;
  fields: { field: string; before: string | number | boolean | null; after: string | number | boolean | null }[];
}
export interface DriverHistory {
  monitorEnabled: boolean; baselineAt: string | null; lastScanAt: string | null; scans: number;
  deviceCount: number; changes: DriverChange[]; limit: number; message: string;
}
export interface DriverInstallLog {
  available: boolean; source: string; readAt: string; truncated: boolean; message: string;
  entries: { id: string; deviceId: string | null; instanceId: string; operation: string; localTime: string; result: 'success' | 'failed' | 'unknown'; detail: string }[];
}
export interface DriverReport {
  hardware: SystemScan; scannedAt: string; warnings: ScanWarning[];
  board: { manufacturer: string; product: string; version: string };
  computer: { manufacturer: string; model: string; portable?: boolean | null; architecture?: 'x64' | 'arm64' | 'x86' | null }; bios: { manufacturer: string; version: string };
  disks: { model: string; firmware: string }[];
  devices: DriverDevice[]; inventoryComplete?: boolean; inventoryScannedAt?: string; history?: DriverHistory;
  components: HardwareComponent[]; componentsComplete: boolean;
  recommendations: { id: string; category: string; title: string; device: string; source: string | null; sourceName: string; reason: string; note: string; confidence: string }[];
}
export interface HardwareMemory { system: SystemScan | null; drivers: DriverReport | null; peripherals: PeripheralScan | null; warning: string }
export interface HardwareComponent { id: string; category: string; name: string; values: Record<string, string>; source: string | null; sourceName: string; note: string; deviceIds: string[] }
export interface DriverUpdateOffers {
  checkedAt: string; complete: boolean; source: string; message: string;
  packages: { id: string; title: string; version?: string; description: string; manufacturer: string; model: string; driverClass: string; hardwareId: string; driverDate: string; catalogDate: string; links: { url: string; label: string }[] }[];
}
export interface ComponentUpdateItem {
  componentId: string; installedVersion: string; installedRaw: string; latestVersion: string;
  status: 'current' | 'newer' | 'ahead' | 'different' | 'unverified' | 'not-applicable' | 'offered';
  source: string; date: string; url: string; notes: string; message: string;
  packages: { deviceId: string; name: string; installedVersion: string; latestVersion: string; title: string; source: string; date: string; url: string; offerId: string; notes: string; comparison: number | null }[];
}
export interface ComponentUpdateReport { checkedAt: string; scannedAt: string; branch: 'game-ready' | 'studio'; items: ComponentUpdateItem[]; windowsUpdateError: string }
export interface UpdateStatus {
  supported: boolean; currentVersion: string;
  phase: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'cancelling' | 'downloaded' | 'installing' | 'error';
  availableVersion: string | null; releaseNotes: string; publishedAt: string | null; checkedAt: string | null;
  progress: { percent: number; transferred: number; total: number } | null; error: string;
}
declare global {
  interface Window {
    tweaker?: {
      updateStatus(): Promise<UpdateStatus>;
      checkForUpdates(): Promise<UpdateStatus>;
      downloadUpdate(): Promise<UpdateStatus>;
      cancelUpdate(): Promise<UpdateStatus>;
      installUpdate(): Promise<UpdateStatus>;
      openUpdateRelease(): Promise<void>;
      getHardwareMemory(): Promise<HardwareMemory>;
      forgetHardwareMemory(): Promise<HardwareMemory>;
      scanDrivers(): Promise<DriverReport>;
      checkComponentUpdates(branch: 'game-ready' | 'studio'): Promise<ComponentUpdateReport>;
      getComponentUpdateStatus(): Promise<{ checking: boolean; result: ComponentUpdateReport | null }>;
      cancelComponentUpdates(): Promise<void>;
      openComponentRelease(id: string): Promise<void>;
      getDriverHistory(): Promise<DriverHistory>;
      setDriverMonitoring(enabled: boolean): Promise<DriverHistory>;
      clearDriverHistory(): Promise<DriverHistory>;
      getDriverInstallLog(): Promise<DriverInstallLog>;
      checkDriverUpdates(): Promise<DriverUpdateOffers>;
      getDriverUpdateStatus(): Promise<{ checking: boolean; result: DriverUpdateOffers | null }>;
      cancelDriverUpdateCheck(): Promise<void>;
      openDriverUpdateLink(id: string, index: number): Promise<void>;
      openDriverSource(id: string): Promise<void>;
      colorStatus(): Promise<ColorStatus>;
      saveColorProfiles(config: ProgramColorConfig): Promise<ColorStatus>;
      startColorProfiles(): Promise<ColorStatus>;
      stopColorProfiles(): Promise<ColorStatus>;
      scan(): Promise<SystemScan>;
      scanPeripherals(): Promise<PeripheralScan>;
      getTweakStatus(): Promise<TweakStatusReport>;
      applyTweaks(ids: string[]): Promise<PreferenceResult>;
      restoreBackup(id: string): Promise<{ message: string }>;
      listBackups(): Promise<Backup[]>;
      changePreferences(action: 'disable' | 'defaults' | 'snapshot', ids: string[]): Promise<PreferenceResult>;
      listPrograms(): Promise<string[]>;
      obsStatus(): Promise<{ connected: boolean }>;
      connectObs(input: { port: number; password: string }): Promise<{ connected: boolean }>;
      disconnectObs(): Promise<void>;
      startCapture(options: CaptureOptions): Promise<CaptureStatus>;
      stopCapture(): Promise<CaptureRecord | null>;
      captureStatus(): Promise<CaptureStatus>;
      listCaptures(): Promise<CaptureRecord[]>;
      deleteCapture(id: string): Promise<void>;
      reanalyzeCapture(id: string): Promise<CaptureRecord>;
      exportCapture(id: string): Promise<void>;
      minimizeToTray(): Promise<void>;
      openSettings(target: string): Promise<void>;
      getDisplayModes(): Promise<DisplayMode[]>;
      setDisplayMode(mode: DisplayMode): Promise<{ message: string }>;
      confirmDisplayMode(): Promise<void>;
    };
  }
}
