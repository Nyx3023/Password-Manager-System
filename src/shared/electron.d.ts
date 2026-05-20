export interface LanAddressCandidate {
  label: string;
  address: string;
  ip: string;
  virtual: boolean;
  privateRange: boolean;
}

export interface TrayStatus {
  running: boolean;
  port: number;
  address: string;
  addresses?: LanAddressCandidate[];
  vaultEtag?: string | null;
  lastSyncAt: string | null;
  error?: string | null;
}

export interface ElectronAPI {
  isDesktop: boolean;
  readDataFile: (name: string) => Promise<string | null>;
  writeDataFile: (name: string, content: string) => Promise<boolean>;
  deleteDataFile: (name: string) => Promise<boolean>;
  getVaultDirectory: () => Promise<string>;
  lockApp: () => void;
  getTrayStatus: () => Promise<TrayStatus>;
  startLanServer: () => Promise<TrayStatus>;
  stopLanServer: () => Promise<TrayStatus>;
  openSettings: () => void;
  onLockRequested: (handler: () => void) => () => void;
  onLanVaultUpdated: (handler: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
