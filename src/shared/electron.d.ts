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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
