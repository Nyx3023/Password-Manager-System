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
  /** Whether a device is currently paired via token auth. */
  paired?: boolean;
  /** Whether pairing mode is active (showing code). */
  pairingActive?: boolean;
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
  /** Start pairing mode — returns the pairing code to display to the user. */
  startLanPairing: () => Promise<{ code: string }>;
  /** Stop pairing mode. */
  stopLanPairing: () => Promise<void>;
  /** Get the currently active pairing code (null if not pairing). */
  getLanPairingCode: () => Promise<{ code: string | null }>;
  /** Remove the stored pairing token (unpair all devices). */
  unpairLan: () => Promise<void>;
  openSettings: () => void;
  openExtensionFolder: () => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  onLockRequested: (handler: () => void) => () => void;
  onLanVaultUpdated: (handler: () => void) => () => void;
  onRequestAutofill: (handler: (data: { id: number; url: string }) => void) => () => void;
  sendAutofillResponse: (id: number, result: any) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
