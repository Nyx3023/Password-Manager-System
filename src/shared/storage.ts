import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

const VAULT_FILE = "vault.enc.json";
const PREFS_FILE = "app.prefs.json";

export interface AppPrefs {
  biometricsEnabled: boolean;
  /** True after first-time icon download finished. */
  iconsBootstrapped: boolean;
  setupComplete: boolean;
}

const defaultPrefs: AppPrefs = {
  biometricsEnabled: false,
  iconsBootstrapped: false,
  setupComplete: false,
};

export async function loadVaultFile(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    return localStorage.getItem(VAULT_FILE);
  }
  try {
    const result = await Filesystem.readFile({
      path: VAULT_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return typeof result.data === "string" ? result.data : null;
  } catch {
    return null;
  }
}

export async function saveVaultFile(content: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(VAULT_FILE, content);
    return;
  }
  await Filesystem.writeFile({
    path: VAULT_FILE,
    directory: Directory.Data,
    data: content,
    encoding: Encoding.UTF8,
  });
}

export async function vaultExists(): Promise<boolean> {
  return (await loadVaultFile()) !== null;
}

export async function loadPrefs(): Promise<AppPrefs> {
  if (!Capacitor.isNativePlatform()) {
    const raw = localStorage.getItem(PREFS_FILE);
    return raw ? (JSON.parse(raw) as AppPrefs) : defaultPrefs;
  }
  try {
    const result = await Filesystem.readFile({
      path: PREFS_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    if (typeof result.data !== "string") return defaultPrefs;
    return { ...defaultPrefs, ...(JSON.parse(result.data) as AppPrefs) };
  } catch {
    return defaultPrefs;
  }
}

export async function savePrefs(prefs: AppPrefs): Promise<void> {
  const content = JSON.stringify(prefs);
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(PREFS_FILE, content);
    return;
  }
  await Filesystem.writeFile({
    path: PREFS_FILE,
    directory: Directory.Data,
    data: content,
    encoding: Encoding.UTF8,
  });
}

/** Wipe vault, prefs, and cached icons (development / factory reset). */
export async function resetAllAppData(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.removeItem(VAULT_FILE);
    localStorage.removeItem(PREFS_FILE);
    localStorage.removeItem("icons_bootstrapped");
    return;
  }

  for (const path of [VAULT_FILE, PREFS_FILE]) {
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Data });
    } catch {
      /* already gone */
    }
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
