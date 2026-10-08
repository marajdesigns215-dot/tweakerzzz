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
export interface Backup { id: string; createdAt: string; count: number; action?: string; ids?: string[] }
export interface BenchmarkConditions { experiment: string; resolution: string; graphics: string; gameBuild: string; fpsCap: number; verified: boolean }
export interface CaptureOptions { processName: string; phase: 'before' | 'after'; context: 'Gaming' | 'Streaming' | 'Recording'; seconds: number; scenario: string; telemetry?: boolean; benchmark?: BenchmarkConditions }
export interface UsageStats { samples: number; averagePercent: number | null; peakPercent: number | null }
export interface TelemetrySummary { enabled: boolean; intervalSeconds: number; cpu: UsageStats; memory: UsageStats; gpu: UsageStats & { name: string; peakTemperatureC: number | null }; cpuTemperatureC: number | null; cpuTemperatureSensor?: string | null; obs: { samples: number; renderingLagPercent: number | null; encodingLagPercent: number | null; networkDropPercent: number | null; streaming: boolean; recording: boolean }; warnings: string[] }
export interface FrameSummary { frames: number; sampledSeconds: number; averageFps: number; onePercentLow: number | null; p95FrameMs: number; processId: number; swapChain: string; otherStreamFrames: number; invalidFrames: number; streamCount: number }
export interface CaptureRecord extends CaptureOptions { version: number; id: string; startedAt: string; endedAt?: string; status: 'recording' | 'completed' | 'failed' | 'interrupted'; collector: string; settings: TweakStatusReport; settingsEnd?: TweakStatusReport | null; hardware?: SystemScan | null; hardwareKey?: string | null; telemetrySummary?: TelemetrySummary | null; summary: FrameSummary | null; error: string; collectorWarnings?: string; stopReason?: string }
export type CaptureStatus = { active: false } | (Partial<CaptureRecord> & { active: true; frames: number; stopping: boolean });
export interface DisplayMode { width: number; height: number; refreshRate: number }
declare global {
  interface Window {
    tweaker?: {
      scan(): Promise<SystemScan>;
      scanPeripherals(): Promise<PeripheralScan>;
      getTweakStatus(): Promise<TweakStatusReport>;
      applyTweaks(ids: string[]): Promise<{ backupId: string | null; applied: string[]; skipped?: string[]; message: string }>;
      restoreBackup(id: string): Promise<{ message: string }>;
      listBackups(): Promise<Backup[]>;
      changePreferences(action: 'disable' | 'defaults' | 'snapshot', ids: string[]): Promise<{ message: string; backupId: string | null }>;
      listPrograms(): Promise<string[]>;
      obsStatus(): Promise<{ connected: boolean }>;
      connectObs(input: { port: number; password: string }): Promise<{ connected: boolean }>;
      disconnectObs(): Promise<void>;
      startCapture(options: CaptureOptions): Promise<CaptureStatus>;
      stopCapture(): Promise<CaptureRecord | null>;
      captureStatus(): Promise<CaptureStatus>;
      listCaptures(): Promise<CaptureRecord[]>;
      deleteCapture(id: string): Promise<void>;
      exportCapture(id: string): Promise<void>;
      minimizeToTray(): Promise<void>;
      openSettings(target: string): Promise<void>;
      getDisplayModes(): Promise<DisplayMode[]>;
      setDisplayMode(mode: DisplayMode): Promise<{ message: string }>;
      confirmDisplayMode(): Promise<void>;
    };
  }
}
