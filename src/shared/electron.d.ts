export interface ElectronAPI {
  isDesktop: boolean;
  readDataFile: (name: string) => Promise<string | null>;
  writeDataFile: (name: string, content: string) => Promise<boolean>;
  deleteDataFile: (name: string) => Promise<boolean>;
  getVaultDirectory: () => Promise<string>;
  lockApp: () => void;
  openSettings: () => void;
  openExtensionFolder: () => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  getAutoStart: () => Promise<boolean>;
  setAutoStart: (enable: boolean) => Promise<boolean>;
  onLockRequested: (handler: () => void) => () => void;
  onRequestAutofill: (handler: (data: { id: number; url: string }) => void) => () => void;
  onSaveCredential: (handler: (data: { id: number; credential: { url: string; username?: string; password?: string; title?: string } }) => void) => () => void;
  onToggleQuickAccess: (handler: () => void) => () => void;
  sendAutofillResponse: (id: number, result: any) => void;
  googleStartAuth: (authUrlTemplate: string) => Promise<{ ok: boolean; code: string; redirectUri: string }>;
  googleSystemBrowserAuth?: (firebaseConfig: any) => Promise<{
    ok: boolean;
    googleIdToken?: string | null;
    googleAccessToken?: string | null;
    email?: string;
    displayName?: string;
    photoURL?: string;
    uid?: string;
  }>;
  netFetch?: (
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    data?: any;
    text?: string;
    error?: string;
  }>;
  checkForUpdates?: (channel?: "release" | "beta") => Promise<{
    status: "update-available" | "up-to-date" | "error";
    version?: string;
    releaseNotes?: string;
    downloadUrl?: string;
    error?: string;
  }>;
  downloadUpdate?: () => Promise<{ ok: boolean; error?: string }>;
  quitAndInstall?: () => void;
  onUpdateAvailable?: (
    handler: (info: { version: string; releaseNotes?: string }) => void,
  ) => () => void;
  onUpdateProgress?: (
    handler: (progress: {
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }) => void,
  ) => () => void;
  onUpdateDownloaded?: (
    handler: (info: { version: string }) => void,
  ) => () => void;
  onUpdateError?: (handler: (error: string) => void) => () => void;
  clearClipboard?: () => Promise<boolean>;
  writeSecureClipboard?: (text: string) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
