/**
 * SecureX Cloud Sync Engine — Zero-Knowledge Google Drive Integration
 */

import {
  downloadDriveVaultFile,
  findDriveVaultFile,
  refreshGoogleAccessToken,
  uploadDriveVaultFile,
  type DriveVaultFile,
} from "./googleDrive";
import { deleteDataFile, readDataFile, writeDataFile } from "./storage";
import {
  BUILTIN_GOOGLE_CLIENT_ID,
  BUILTIN_GOOGLE_CLIENT_SECRET,
} from "./googleDriveConfig";

export const CLOUD_CONFIG_FILE = "google_drive_config.json";

export interface GoogleDriveConfig {
  enabled: boolean;
  clientId: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch timestamp ms
  userEmail?: string;
  userName?: string;
  userPicture?: string;
  autoSync: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: "idle" | "syncing" | "success" | "error";
  lastError?: string | null;
  vaultFileId?: string;
}

export const defaultCloudConfig: GoogleDriveConfig = {
  enabled: false,
  clientId: "",
  autoSync: true,
  lastSyncStatus: "idle",
  lastSyncAt: null,
  lastError: null,
};

export interface VaultSyncTarget {
  unlocked: boolean;
  exportVault: () => Promise<string>;
  mergeUnlockedFromRaw: (raw: string) => Promise<void>;
}

export interface CloudSyncResult {
  ok: boolean;
  message: string;
  syncedAt?: string;
  error?: string;
}

let cachedConfig: GoogleDriveConfig | null = null;
const listeners = new Set<(cfg: GoogleDriveConfig) => void>();

function notifyListeners(cfg: GoogleDriveConfig) {
  cachedConfig = cfg;
  listeners.forEach((l) => {
    try {
      l(cfg);
    } catch (e) {
      console.error("[CloudSync] Listener error:", e);
    }
  });
}

export function subscribeCloudSyncConfig(
  listener: (cfg: GoogleDriveConfig) => void
): () => void {
  listeners.add(listener);
  if (cachedConfig) {
    listener(cachedConfig);
  } else {
    void loadCloudConfig().then((cfg) => listener(cfg));
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Load Google Drive Cloud configuration from device storage.
 */
export async function loadCloudConfig(): Promise<GoogleDriveConfig> {
  if (cachedConfig) return { ...cachedConfig };
  try {
    const raw = await readDataFile(CLOUD_CONFIG_FILE);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GoogleDriveConfig>;
      cachedConfig = { ...defaultCloudConfig, ...parsed };
      return { ...cachedConfig };
    }
  } catch (e) {
    console.warn("[CloudSync] Failed to load config:", e);
  }
  cachedConfig = { ...defaultCloudConfig };
  return { ...cachedConfig };
}

/**
 * Save Google Drive Cloud configuration to device storage and notify subscribers.
 */
export async function saveCloudConfig(
  update: Partial<GoogleDriveConfig>
): Promise<GoogleDriveConfig> {
  const current = await loadCloudConfig();
  const next: GoogleDriveConfig = { ...current, ...update };
  await writeDataFile(CLOUD_CONFIG_FILE, JSON.stringify(next, null, 2));
  notifyListeners(next);
  return next;
}

/**
 * Disconnect Google Drive and remove saved tokens.
 */
export async function disconnectCloudSync(): Promise<void> {
  await deleteDataFile(CLOUD_CONFIG_FILE);
  const resetConfig = { ...defaultCloudConfig };
  notifyListeners(resetConfig);
}

/**
 * Ensure the access token is valid, refreshing it if within 2 minutes of expiry.
 */
export async function getValidAccessToken(
  currentConfig?: GoogleDriveConfig
): Promise<{ config: GoogleDriveConfig; token: string }> {
  const cfg = currentConfig || (await loadCloudConfig());

  if (!cfg.accessToken && !cfg.refreshToken) {
    throw new Error("Google Drive is not linked. Please sign in.");
  }

  const now = Date.now();
  const expiry = cfg.expiresAt || 0;
  // If token is valid for at least another 60 seconds, use it
  if (cfg.accessToken && expiry > now + 60_000) {
    return { config: cfg, token: cfg.accessToken };
  }

  // Need refresh
  if (!cfg.refreshToken) {
    throw new Error("Access token expired and no refresh token available. Please sign in again.");
  }

  const effectiveClientId = cfg.clientId || BUILTIN_GOOGLE_CLIENT_ID;
  const effectiveClientSecret = cfg.clientSecret || BUILTIN_GOOGLE_CLIENT_SECRET;

  if (!effectiveClientId) {
    throw new Error("Missing Google OAuth Client ID.");
  }

  try {
    const refreshed = await refreshGoogleAccessToken({
      clientId: effectiveClientId,
      clientSecret: effectiveClientSecret || undefined,
      refreshToken: cfg.refreshToken,
    });

    const updated = await saveCloudConfig({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || cfg.refreshToken,
      expiresAt: Date.now() + (refreshed.expiresIn || 3600) * 1000,
    });

    return { config: updated, token: refreshed.accessToken };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token refresh failed";
    await saveCloudConfig({
      lastSyncStatus: "error",
      lastError: `Authentication expired: ${msg}`,
    });
    throw new Error(`Google Drive authentication expired: ${msg}`);
  }
}

/**
 * Download remote vault without merging (used for SetupWizard / initial device restore).
 */
export async function fetchRemoteVaultForImport(
  config?: GoogleDriveConfig
): Promise<string | null> {
  const { token } = await getValidAccessToken(config);
  const file = await findDriveVaultFile(token);
  if (!file) return null;

  const content = await downloadDriveVaultFile(token, file.id);
  await saveCloudConfig({ vaultFileId: file.id });
  return content;
}

/**
 * Full zero-knowledge bidirectional sync with Google Drive:
 * 1. Finds remote `securex_vault.enc.json`.
 * 2. If none exists, uploads current local vault.
 * 3. If exists, downloads and decrypts into local session (tombstone-aware merge).
 * 4. Pushes the reconciled merged state back up to Google Drive.
 */
export async function syncVaultWithGoogleDrive(
  vault: VaultSyncTarget
): Promise<CloudSyncResult> {
  if (!vault.unlocked) {
    return {
      ok: false,
      message: "Vault must be unlocked to perform sync.",
      error: "VAULT_LOCKED",
    };
  }

  let cfg = await loadCloudConfig();
  if (!cfg.enabled) {
    return {
      ok: false,
      message: "Google Drive sync is not enabled.",
      error: "SYNC_DISABLED",
    };
  }

  await saveCloudConfig({ lastSyncStatus: "syncing", lastError: null });

  try {
    const { token } = await getValidAccessToken(cfg);

    // 1. Locate remote vault file
    let remoteFile: DriveVaultFile | null = null;
    if (cfg.vaultFileId) {
      // Fast check or search
      remoteFile = await findDriveVaultFile(token);
    } else {
      remoteFile = await findDriveVaultFile(token);
    }

    const localRaw = await vault.exportVault();

    if (!remoteFile) {
      // 2. Initial upload
      const uploaded = await uploadDriveVaultFile(token, localRaw);
      const syncedAt = new Date().toISOString();
      await saveCloudConfig({
        vaultFileId: uploaded.id,
        lastSyncStatus: "success",
        lastSyncAt: syncedAt,
        lastError: null,
      });

      return {
        ok: true,
        message: "Vault uploaded to Google Drive successfully.",
        syncedAt,
      };
    }

    // 3. Download remote vault
    const remoteRaw = await downloadDriveVaultFile(token, remoteFile.id);

    // If identical, just update timestamp
    if (remoteRaw === localRaw) {
      const syncedAt = new Date().toISOString();
      await saveCloudConfig({
        vaultFileId: remoteFile.id,
        lastSyncStatus: "success",
        lastSyncAt: syncedAt,
        lastError: null,
      });
      return {
        ok: true,
        message: "Vault is already up to date with Google Drive.",
        syncedAt,
      };
    }

    // 4. Merge remote into local unlocked session
    await vault.mergeUnlockedFromRaw(remoteRaw);

    // 5. Export merged state and update remote file
    const mergedRaw = await vault.exportVault();
    await uploadDriveVaultFile(token, mergedRaw, remoteFile.id);

    const syncedAt = new Date().toISOString();
    await saveCloudConfig({
      vaultFileId: remoteFile.id,
      lastSyncStatus: "success",
      lastSyncAt: syncedAt,
      lastError: null,
    });

    return {
      ok: true,
      message: "Synced and merged changes with Google Drive.",
      syncedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[CloudSync] Error:", err);
    await saveCloudConfig({
      lastSyncStatus: "error",
      lastError: message,
    });
    return {
      ok: false,
      message,
      error: message,
    };
  }
}
