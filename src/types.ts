export interface SystemScan {
  cpu: { name: string; cores: number; threads: number };
  gpu: { name: string; vramGB: number | null };
  memory: { totalGB: number; speedMHz: number };
  os: { name: string; build: string };
  storage: { totalGB: number; freeGB: number };
  peripherals: { name: string; type: 'Mouse' | 'Keyboard' | 'Audio' | 'Controller' | 'Other'; connection: string }[];
  scannedAt: string;
}
export interface Backup { id: string; createdAt: string; count: number }
export interface DisplayMode { width: number; height: number; refreshRate: number }
declare global {
  interface Window {
    tweaker?: {
      scan(): Promise<SystemScan>;
      applyTweaks(ids: string[]): Promise<{ backupId: string; applied: string[]; message: string }>;
      restoreBackup(id: string): Promise<{ message: string }>;
      listBackups(): Promise<Backup[]>;
      openSettings(target: string): Promise<void>;
      getDisplayModes(): Promise<DisplayMode[]>;
      setDisplayMode(mode: DisplayMode): Promise<{ message: string }>;
      confirmDisplayMode(): Promise<void>;
    };
  }
}
