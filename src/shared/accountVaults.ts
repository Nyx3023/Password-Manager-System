import {
  readDataFile,
  writeDataFile,
  deleteDataFile,
  loadVaultFile,
  saveVaultFile,
  loadPrefs,
  savePrefs,
} from "./storage";
import { loadMpinWrap, saveMpinWrap, deleteMpinWrap } from "./mpinStore";
import { saveFirebaseSyncState } from "./firebaseSync";
import {
  saveAccountAuthSession,
  restoreAccountAuthSession,
  getFirebaseAuth,
} from "./firebaseConfig";

export interface CachedAccount {
  uid: string;
  email?: string;
  lastUsedAt: string;
}

export const CACHED_ACCOUNTS_FILE = "cached_accounts.json";

export async function listCachedAccounts(): Promise<CachedAccount[]> {
  try {
    const raw = await readDataFile(CACHED_ACCOUNTS_FILE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Archive the current active vault and device MPIN for the given account UID.
 * This preserves offline access to this vault when switching to another account.
 */
export async function archiveCurrentVault(ownerUid?: string, ownerEmail?: string): Promise<void> {
  const currentVaultRaw = await loadVaultFile();
  if (!currentVaultRaw) return;

  const targetUid = ownerUid || "offline";
  const targetEmail = ownerEmail || (targetUid === "offline" ? "Offline Vault" : undefined);

  // Save vault archive for this account
  await writeDataFile(`vault_${targetUid}.enc.json`, currentVaultRaw);

  // Archive MPIN if present on this device
  const mpin = await loadMpinWrap();
  if (mpin) {
    await writeDataFile(`mpin_${targetUid}.json`, JSON.stringify(mpin));
  } else {
    try {
      await deleteDataFile(`mpin_${targetUid}.json`);
    } catch {}
  }

  // Archive auth session if signed in
  if (targetUid !== "offline") {
    try {
      const auth = await getFirebaseAuth(targetUid);
      let user = auth.currentUser;
      if (!user) {
        const defaultAuth = await getFirebaseAuth("[DEFAULT]");
        if (defaultAuth.currentUser?.uid === targetUid) {
          user = defaultAuth.currentUser;
        }
      }
      if (user) {
        const rawUser =
          typeof (user as any).toJSON === "function"
            ? (user as any).toJSON()
            : user;
        await saveAccountAuthSession(targetUid, rawUser);
      }
    } catch {}
  }

  // Update cached accounts list
  await upsertCachedAccount({
    uid: targetUid,
    email: targetEmail,
    lastUsedAt: new Date().toISOString(),
  });
}

/**
 * Add or update an entry in the cached accounts registry.
 */
export async function upsertCachedAccount(account: CachedAccount): Promise<void> {
  const accounts = await listCachedAccounts();
  const existingIdx = accounts.findIndex((a) => a.uid === account.uid);
  if (existingIdx >= 0) {
    accounts[existingIdx] = { ...accounts[existingIdx], ...account, lastUsedAt: new Date().toISOString() };
  } else {
    accounts.push(account);
  }
  await writeDataFile(CACHED_ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

/**
 * Restore an archived vault for the target account UID into the active vault working slot.
 * Returns true if an archived vault was restored, or false if no archive was found.
 */
export async function restoreArchivedVault(targetUid: string): Promise<boolean> {
  const archivedRaw = await readDataFile(`vault_${targetUid}.enc.json`);
  if (!archivedRaw) return false;

  // Restore into active vault.enc.json
  await saveVaultFile(archivedRaw);

  // Restore MPIN
  const archivedMpin = await readDataFile(`mpin_${targetUid}.json`);
  if (archivedMpin) {
    try {
      const parsedMpin = JSON.parse(archivedMpin);
      await saveMpinWrap(parsedMpin);
    } catch {
      await deleteMpinWrap();
    }
  } else {
    await deleteMpinWrap();
  }

  // Mark setup complete
  try {
    const prefs = await loadPrefs();
    prefs.setupComplete = true;
    await savePrefs(prefs);
  } catch {}

  // Sync state & restore auth session
  const accounts = await listCachedAccounts();
  const acc = accounts.find((a) => a.uid === targetUid);
  if (targetUid !== "offline") {
    await saveFirebaseSyncState({
      enabled: true,
      userId: targetUid,
      userEmail: acc?.email,
      ownerUid: targetUid,
      ownerEmail: acc?.email,
      lastSyncStatus: "idle",
      lastError: null,
    });
    // Seamlessly restore Google auth session without popup
    try {
      await restoreAccountAuthSession(targetUid);
    } catch (e) {
      console.warn("[accountVaults] Failed to restore auth session:", e);
    }
  } else {
    await saveFirebaseSyncState({
      enabled: false,
      userId: undefined,
      userEmail: undefined,
      ownerUid: undefined,
      ownerEmail: undefined,
    });
  }

  // Update last used timestamp
  if (acc) {
    acc.lastUsedAt = new Date().toISOString();
    await writeDataFile(CACHED_ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  }

  return true;
}

/**
 * Permanently remove any local archives and index entry for a deleted account.
 */
export async function removeArchivedVault(uid: string): Promise<void> {
  try {
    await deleteDataFile(`vault_${uid}.enc.json`);
  } catch {}
  try {
    await deleteDataFile(`mpin_${uid}.json`);
  } catch {}
  const accounts = await listCachedAccounts();
  const filtered = accounts.filter((a) => a.uid !== uid);
  await writeDataFile(CACHED_ACCOUNTS_FILE, JSON.stringify(filtered, null, 2));
}
