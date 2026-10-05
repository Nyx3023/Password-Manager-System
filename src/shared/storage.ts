import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { isDesktopApp } from "./platform";

const VAULT_FILE = "vault.enc.json";
const VAULT_BACKUP_FILE = "vault.enc.json.bak";
const VAULT_TEMP_FILE = "vault.enc.json.tmp";
const PREFS_FILE = "app.prefs.json";

export interface AppPrefs {
  biometricsEnabled: boolean;
  setupComplete: boolean;
}

const defaultPrefs: AppPrefs = {
  biometricsEnabled: false,
  setupComplete: false,
};

function isValidVaultEnvelope(raw: string): boolean {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return (
      obj.kdf === "argon2id" &&
      obj.cipher === "aes-256-gcm" &&
      typeof obj.ciphertext === "string" &&
      typeof obj.iv === "string" &&
      (obj.version === 1 || obj.version === 2)
    );
  } catch {
    return false;
  }
}

const memoryStorage = new Map<string, string>();

function useElectronStorage(): boolean {
  return isDesktopApp() && !!window.electronAPI?.readDataFile;
}

export async function readDataFile(path: string): Promise<string | null> {
  if (useElectronStorage()) {
    return window.electronAPI!.readDataFile(path);
  }
  if (!Capacitor.isNativePlatform()) {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem(path);
    }
    return memoryStorage.get(path) ?? null;
  }
  try {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return typeof result.data === "string" ? result.data : null;
  } catch {
    return null;
  }
}

export async function writeDataFile(path: string, content: string): Promise<void> {
  if (useElectronStorage()) {
    await window.electronAPI!.writeDataFile(path, content);
    return;
  }
  if (!Capacitor.isNativePlatform()) {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(path, content);
    } else {
      memoryStorage.set(path, content);
    }
    return;
  }
  await Filesystem.writeFile({
    path,
    directory: Directory.Data,
    data: content,
    encoding: Encoding.UTF8,
  });
}

export async function deleteDataFile(path: string): Promise<void> {
  if (useElectronStorage()) {
    await window.electronAPI!.deleteDataFile(path);
    return;
  }
  if (!Capacitor.isNativePlatform()) {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(path);
    } else {
      memoryStorage.delete(path);
    }
    return;
  }
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch {
    /* already gone */
  }
}

export async function loadVaultFile(): Promise<string | null> {
  const primary = await readDataFile(VAULT_FILE);
  if (primary && isValidVaultEnvelope(primary)) {
    return primary;
  }

  const backup = await readDataFile(VAULT_BACKUP_FILE);
  if (backup && isValidVaultEnvelope(backup)) {
    await writeDataFile(VAULT_FILE, backup);
    return backup;
  }

  const temp = await readDataFile(VAULT_TEMP_FILE);
  if (temp && isValidVaultEnvelope(temp)) {
    await writeDataFile(VAULT_FILE, temp);
    await deleteDataFile(VAULT_TEMP_FILE);
    return temp;
  }

  return primary;
}

export async function saveVaultFile(content: string): Promise<void> {
  if (!isValidVaultEnvelope(content)) {
    throw new Error("Refusing to save an invalid vault file.");
  }

  if (useElectronStorage()) {
    await window.electronAPI!.writeDataFile(VAULT_FILE, content);
    return;
  }

  const current = await readDataFile(VAULT_FILE);
  if (current && isValidVaultEnvelope(current)) {
    await writeDataFile(VAULT_BACKUP_FILE, current);
  }

  await writeDataFile(VAULT_TEMP_FILE, content);
  await writeDataFile(VAULT_FILE, content);
  await deleteDataFile(VAULT_TEMP_FILE);
}

export async function vaultExists(): Promise<boolean> {
  return (await loadVaultFile()) !== null;
}

/**
 * Retrieve account ownership info from vault envelope header without decrypting payload.
 * Returns null if no vault exists on disk.
 */
export async function getVaultOwnerInfo(): Promise<{
  ownerUid?: string;
  ownerEmail?: string;
  vaultId?: string;
} | null> {
  const raw = await loadVaultFile();
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      ownerUid: typeof obj.ownerUid === "string" ? obj.ownerUid : undefined,
      ownerEmail: typeof obj.ownerEmail === "string" ? obj.ownerEmail : undefined,
      vaultId: typeof obj.vaultId === "string" ? obj.vaultId : undefined,
    };
  } catch {
    return null;
  }
}

export async function loadPrefs(): Promise<AppPrefs> {
  const raw = await readDataFile(PREFS_FILE);
  return raw ? { ...defaultPrefs, ...(JSON.parse(raw) as AppPrefs) } : defaultPrefs;
}

export async function savePrefs(prefs: AppPrefs): Promise<void> {
  await writeDataFile(PREFS_FILE, JSON.stringify(prefs));
}

const ALL_DATA_FILES = [
  VAULT_FILE,
  VAULT_BACKUP_FILE,
  "vault.enc.json.bak.1",
  "vault.enc.json.bak.2",
  "vault.enc.json.bak.3",
  VAULT_TEMP_FILE,
  PREFS_FILE,
  "mpin-device.json",
  "unlock-attempts.json",
  "firebase_sync_state.json",
];

/**
 * Clear only the active vault working slot files without factory-resetting the entire app.
 * Keeps cached accounts, custom settings, and persistent Google auth storage intact.
 */
export async function clearActiveVaultSlot(): Promise<void> {
  const activeSlotFiles = [
    VAULT_FILE,
    VAULT_BACKUP_FILE,
    "vault.enc.json.bak.1",
    "vault.enc.json.bak.2",
    "vault.enc.json.bak.3",
    VAULT_TEMP_FILE,
    "mpin-device.json",
    "unlock-attempts.json",
    "firebase_sync_state.json",
  ];
  for (const path of activeSlotFiles) {
    try {
      await deleteDataFile(path);
    } catch {}
  }
}

/** Wipe vault, backups, MPIN, sync state, prefs, and cached icons (factory reset). */
export async function resetAllAppData(): Promise<void> {
  if (useElectronStorage()) {
    for (const path of ALL_DATA_FILES) {
      await deleteDataFile(path);
    }
    return;
  }

  if (!Capacitor.isNativePlatform()) {
    try {
      sessionStorage.clear();
    } catch {}
    try {
      localStorage.clear();
    } catch {}
    for (const path of ALL_DATA_FILES) {
      memoryStorage.delete(path);
    }
    return;
  }

  for (const path of ALL_DATA_FILES) {
    await deleteDataFile(path);
  }

  try {
    const listing = await Filesystem.readdir({
      path: "icons",
      directory: Directory.Data,
    });
    for (const entry of listing.files) {
      if (entry.type === "file" && entry.name) {
        await Filesystem.deleteFile({
          path: `icons/${entry.name}`,
          directory: Directory.Data,
        });
      }
    }
  } catch {
    /* no icon cache */
  }
}
