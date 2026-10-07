export interface SystemScan {
  cpu: { name: string; cores: number | null; threads: number | null };
  gpu: { name: string; vramGB: number | null };
  memory: { totalGB: number | null; speedMHz: number | null };
  os: { name: string; build: string };
  storage: { totalGB: number | null; freeGB: number | null };
  peripherals: { name: string; type: 'Mouse' | 'Keyboard' | 'Audio' | 'Controller' | 'Other'; connection: string }[];
  scannedAt: string;
  warnings?: ScanWarning[];
}
export interface ScanWarning { component: string; message: string }
export interface PeripheralScan { peripherals: SystemScan['peripherals']; scannedAt: string; warnings: ScanWarning[] }
export type TweakState = 'enabled' | 'not-enabled' | 'not-configured' | 'unknown';
export interface TweakStatus { id: string; status: TweakState; message: string }
export interface TweakStatusReport { checkedAt: string; tweaks: TweakStatus[] }
export interface Backup { id: string; createdAt: string; count: number }
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
      openSettings(target: string): Promise<void>;
      getDisplayModes(): Promise<DisplayMode[]>;
      setDisplayMode(mode: DisplayMode): Promise<{ message: string }>;
      confirmDisplayMode(): Promise<void>;
    };
  }
}
