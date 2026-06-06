import { isDesktopApp } from "./platform";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import type { KeyWrap } from "./types";

const MPIN_FILE = "mpin-device.json";

/** Higher Argon2 cost parameters for MPIN (only 10^8 keyspace). */
export const MPIN_KDF = {
  iterations: 8,
  memorySize: 131072, // 128 MiB
  parallelism: 4,
  hashLength: 32,
};

function useElectronStorage(): boolean {
  return isDesktopApp() && !!window.electronAPI?.readDataFile;
}

async function readMpinFile(): Promise<string | null> {
  if (useElectronStorage()) {
    return window.electronAPI!.readDataFile(MPIN_FILE);
  }
  if (!Capacitor.isNativePlatform()) {
    return sessionStorage.getItem(MPIN_FILE);
  }
  try {
    const result = await Filesystem.readFile({
      path: MPIN_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return typeof result.data === "string" ? result.data : null;
  } catch {
    return null;
  }
}

async function writeMpinFile(content: string): Promise<void> {
  if (useElectronStorage()) {
    await window.electronAPI!.writeDataFile(MPIN_FILE, content);
    return;
  }
  if (!Capacitor.isNativePlatform()) {
    sessionStorage.setItem(MPIN_FILE, content);
    return;
  }
  await Filesystem.writeFile({
    path: MPIN_FILE,
    directory: Directory.Data,
    data: content,
    encoding: Encoding.UTF8,
  });
}

async function deleteMpinFile(): Promise<void> {
  if (useElectronStorage()) {
    await window.electronAPI!.deleteDataFile(MPIN_FILE);
    return;
  }
  if (!Capacitor.isNativePlatform()) {
    sessionStorage.removeItem(MPIN_FILE);
    return;
  }
  try {
    await Filesystem.deleteFile({ path: MPIN_FILE, directory: Directory.Data });
  } catch {
    /* already gone */
  }
}

/**
 * Save MPIN key-wrap to device-local storage (never synced or exported).
 */
export async function saveMpinWrap(wrap: KeyWrap): Promise<void> {
  await writeMpinFile(JSON.stringify(wrap));
}

/**
 * Load MPIN key-wrap from device-local storage.
 */
export async function loadMpinWrap(): Promise<KeyWrap | null> {
  const raw = await readMpinFile();
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as KeyWrap;
    if (
      typeof obj.salt === "string" &&
      typeof obj.wrappedKey === "string" &&
      typeof obj.wrappedKeyIv === "string"
    ) {
      return obj;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Delete MPIN key-wrap from device-local storage.
 */
export async function deleteMpinWrap(): Promise<void> {
  await deleteMpinFile();
}

/**
 * Check if an MPIN is configured on this device.
 */
export async function hasMpinOnDevice(): Promise<boolean> {
  return (await loadMpinWrap()) !== null;
}
