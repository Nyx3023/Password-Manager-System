import { Capacitor, registerPlugin } from "@capacitor/core";

export interface AutofillCredentialPayload {
  id: string;
  username: string;
  password: string;
  url: string;
  title: string;
  /** Hostnames from entry URL + service catalog (for browser autofill matching). */
  matchHosts: string[];
}

export interface VaultAutofillPlugin {
  syncCredentials(options: {
    credentials: AutofillCredentialPayload[];
  }): Promise<void>;
  setSessionActive(options: { active: boolean }): Promise<void>;
  notifyUnlocked(): Promise<void>;
  clearSession(): Promise<void>;
  isEnabled(): Promise<{ enabled: boolean }>;
  openSettings(): Promise<void>;
  getPendingAuthentication(): Promise<{ pending: boolean }>;
  addListener(
    eventName: "autofillUnlockRequired",
    listenerFunc: () => void,
  ): Promise<import("@capacitor/core").PluginListenerHandle>;
}

const VaultAutofill = registerPlugin<VaultAutofillPlugin>("VaultAutofill");

export function autofillSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export { VaultAutofill };
