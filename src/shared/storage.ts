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

function useElectronStorage(): boolean {
  return isDesktopApp() && !!window.electronAPI?.readDataFile;
}

async function readDataFile(path: string): Promise<string | null> {
  if (useElectronStorage()) {
    return window.electronAPI!.readDataFile(path);
  }
  if (!Capacitor.isNativePlatform()) {
    return localStorage.getItem(path);
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

async function writeDataFile(path: string, content: string): Promise<void> {
  if (useElectronStorage()) {
    await window.electronAPI!.writeDataFile(path, content);
    return;
  }
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(path, content);
    return;
  }
  await Filesystem.writeFile({
    path,
    directory: Directory.Data,
    data: content,
    encoding: Encoding.UTF8,
  });
}

async function deleteDataFile(path: string): Promise<void> {
  if (useElectronStorage()) {
    await window.electronAPI!.deleteDataFile(path);
    return;
  }
  if (!Capacitor.isNativePlatform()) {
    localStorage.removeItem(path);
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

export async function loadPrefs(): Promise<AppPrefs> {
  const raw = await readDataFile(PREFS_FILE);
  return raw ? { ...defaultPrefs, ...(JSON.parse(raw) as AppPrefs) } : defaultPrefs;
}

export async function savePrefs(prefs: AppPrefs): Promise<void> {
  await writeDataFile(PREFS_FILE, JSON.stringify(prefs));
}

/** Wipe vault, prefs, and cached icons (development / factory reset). */
export async function resetAllAppData(): Promise<void> {
  if (useElectronStorage()) {
    for (const path of [VAULT_FILE, VAULT_BACKUP_FILE, VAULT_TEMP_FILE, PREFS_FILE]) {
      await deleteDataFile(path);
    }
    return;
  }

  if (!Capacitor.isNativePlatform()) {
    localStorage.removeItem(VAULT_FILE);
    localStorage.removeItem(VAULT_BACKUP_FILE);
    localStorage.removeItem(VAULT_TEMP_FILE);
    localStorage.removeItem(PREFS_FILE);
    return;
  }

  for (const path of [VAULT_FILE, VAULT_BACKUP_FILE, VAULT_TEMP_FILE, PREFS_FILE]) {
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
