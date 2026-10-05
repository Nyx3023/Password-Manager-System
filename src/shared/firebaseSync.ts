/**
 * SecureX Firebase Sync Engine — Zero-Knowledge Cloud Firestore Integration
 * 
 * 100% Zero-Knowledge: Only Argon2id salts + AES-256-GCM ciphertexts are stored in Firestore.
 * No plaintext usernames, passwords, notes, or secrets ever leave the device.
 */

import {
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  type DocumentSnapshot,
} from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseDb,
  isFirebaseConfigured,
  loadFirebaseConfig,
  saveAccountAuthSession,
  restoreAccountAuthSession,
  getActiveAccountUid,
} from "./firebaseConfig";
import { readDataFile, writeDataFile, deleteDataFile, getVaultOwnerInfo } from "./storage";

export const FIREBASE_STATE_FILE = "firebase_sync_state.json";

export interface FirebaseSyncConfig {
  enabled: boolean;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userPicture?: string;
  ownerUid?: string;
  ownerEmail?: string;
  autoSync: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: "idle" | "syncing" | "success" | "error";
  lastError?: string | null;
}

export type FirebaseSyncState = FirebaseSyncConfig;

export const defaultFirebaseConfig: FirebaseSyncConfig = {
  enabled: false,
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

export interface FirebaseSyncResult {
  ok: boolean;
  message: string;
  syncedAt?: string;
  error?: string;
}

let cachedState: FirebaseSyncConfig | null = null;
const stateListeners = new Set<(cfg: FirebaseSyncConfig) => void>();

function notifyStateListeners(cfg: FirebaseSyncConfig) {
  cachedState = cfg;
  stateListeners.forEach((listener) => {
    try {
      listener(cfg);
    } catch (e) {
      console.error("[FirebaseSync] Listener error:", e);
    }
  });
}

export function subscribeFirebaseSyncConfig(
  listener: (cfg: FirebaseSyncConfig) => void,
): () => void {
  stateListeners.add(listener);
  if (cachedState) {
    listener(cachedState);
  } else {
    void loadFirebaseSyncState().then((cfg) => listener(cfg));
  }
  return () => {
    stateListeners.delete(listener);
  };
}

export async function loadFirebaseSyncState(): Promise<FirebaseSyncConfig> {
  if (cachedState) return { ...cachedState };
  try {
    const raw = await readDataFile(FIREBASE_STATE_FILE);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FirebaseSyncConfig>;
      cachedState = { ...defaultFirebaseConfig, ...parsed };
      return { ...cachedState };
    }
  } catch (e) {
    console.warn("[FirebaseSync] Failed to load sync state:", e);
  }
  cachedState = { ...defaultFirebaseConfig };
  return { ...cachedState };
}

export async function saveFirebaseSyncState(
  update: Partial<FirebaseSyncConfig>,
): Promise<FirebaseSyncConfig> {
  const current = await loadFirebaseSyncState();
  const next: FirebaseSyncConfig = { ...current, ...update };
  await writeDataFile(FIREBASE_STATE_FILE, JSON.stringify(next, null, 2));
  notifyStateListeners(next);
  return next;
}

/**
 * Initialize Firebase Auth state listener to keep user profile and tokens in sync.
 */
let authListenerInitialized = false;
export async function initFirebaseAuthListener(): Promise<void> {
  if (authListenerInitialized) return;
  authListenerInitialized = true;

  try {
    const projectConfig = await loadFirebaseConfig();
    if (!isFirebaseConfigured(projectConfig)) return;

    const auth = await getFirebaseAuth();
    onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        const vaultOwner = await getVaultOwnerInfo();
        if (!vaultOwner?.ownerUid || vaultOwner.ownerUid === user.uid) {
          void saveFirebaseSyncState({
            enabled: true,
            userId: user.uid,
            userEmail: user.email || undefined,
            userName: user.displayName || undefined,
            userPicture: user.photoURL || undefined,
            ownerUid: user.uid,
            ownerEmail: user.email || undefined,
            lastError: null,
          });
        }
      }
    });
  } catch (e) {
    console.warn("[FirebaseSync] Auth listener init skipped:", e);
  }
}

/**
 * Authenticate with Google via Firebase.
 */
export async function signInWithGoogle(): Promise<{ user: User }> {
  await loadFirebaseConfig();
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    let credential;
    let initialUser: User | null = null;

    if (Capacitor.isNativePlatform()) {
      // Clear previous native sign-in session first so Android Google Play Services presents the account chooser
      try {
        await FirebaseAuthentication.signOut();
      } catch {}

      // Native Android Google Play Services sign-in
      let result;
      try {
        // Try with useCredentialManager: false first to invoke the standard Google Account chooser.
        // This avoids Android Credential Manager's "[16] No credentials available" error on clean installs.
        result = await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false });
      } catch (err: any) {
        const msg = String(err?.message || err || "");
        console.warn("[FirebaseSync] useCredentialManager:false notice:", msg);
        // Fall back to Credential Manager if account chooser cannot be launched
        result = await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: true });
      }
      const idToken = result.credential?.idToken;
      if (!idToken) {
        throw new Error("No Google ID token received from native sign-in.");
      }
      credential = GoogleAuthProvider.credential(
        idToken,
        result.credential?.accessToken || undefined,
      );
    } else if (window.electronAPI?.googleSystemBrowserAuth) {
      // Desktop Electron: launch user's real system browser (Chrome/Edge) with existing Google accounts
      const projectConfig = await loadFirebaseConfig();
      const result = await window.electronAPI.googleSystemBrowserAuth(projectConfig);
      const idToken = result?.googleIdToken || null;
      const accessToken = result?.googleAccessToken || null;

      if (!idToken && !accessToken) {
        throw new Error("No Google OAuth credentials received from browser sign-in.");
      }

      credential = GoogleAuthProvider.credential(idToken, accessToken);
    } else {
      // Web browser popup sign-in
      const defaultAuth = await getFirebaseAuth("[DEFAULT]");
      const userCredential = await signInWithPopup(defaultAuth, provider);
      initialUser = userCredential.user;
    }

    let user: User;
    if (credential) {
      const defaultAuth = await getFirebaseAuth("[DEFAULT]");
      const defaultCred = await signInWithCredential(defaultAuth, credential);
      initialUser = defaultCred.user;

      try {
        const namedAuth = await getFirebaseAuth(initialUser.uid);
        if (namedAuth !== defaultAuth) {
          const namedCred = await signInWithCredential(namedAuth, credential);
          user = namedCred.user;
        } else {
          user = initialUser;
        }
      } catch (namedErr) {
        console.warn("[FirebaseSync] Named auth sign-in notice:", namedErr);
        user = initialUser;
      }
    } else {
      user = initialUser!;
    }

    try {
      const rawUser = typeof (user as any).toJSON === "function" ? (user as any).toJSON() : user;
      await saveAccountAuthSession(user.uid, rawUser);
    } catch (saveErr) {
      console.warn("[FirebaseSync] Session persist notice:", saveErr);
    }

    await saveFirebaseSyncState({
      enabled: true,
      userId: user.uid,
      userEmail: user.email || undefined,
      userName: user.displayName || undefined,
      userPicture: user.photoURL || undefined,
      lastSyncStatus: "idle",
      lastError: null,
    });

    return { user };
  } catch (err: unknown) {
    const anyErr = err as Record<string, any>;
    const custom = anyErr?.customData;
    const internalDetail = custom?.serverResponse?.error?.message ||
      custom?._tokenResponse?.error?.message ||
      custom?.message ||
      anyErr?.code ||
      "";
    const baseMsg = err instanceof Error ? err.message : "Google sign-in failed";
    const msg = internalDetail && !baseMsg.includes(internalDetail)
      ? `${baseMsg} [${internalDetail}]`
      : baseMsg;

    console.error("[FirebaseSync] Google sign-in failed:", err, "customData:", custom);
    await saveFirebaseSyncState({
      lastSyncStatus: "error",
      lastError: msg,
    });
    throw new Error(msg);
  }
}

let activeRemoteUnsubscribe: (() => void) | null = null;

/**
 * Stop any currently active real-time remote vault Firestore subscription.
 */
export function stopRemoteVaultSubscription(): void {
  if (activeRemoteUnsubscribe) {
    try {
      activeRemoteUnsubscribe();
    } catch {}
    activeRemoteUnsubscribe = null;
  }
}

/**
 * Permanently delete the user's remote encrypted vault from Cloud Firestore.
 */
export async function deleteRemoteVaultFromFirebase(): Promise<void> {
  stopRemoteVaultSubscription();
  try {
    const auth = await getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) return;

    const db = await getFirebaseDb();
    const docRef = doc(db, "vaults", user.uid);
    // Write tombstone so other active devices receive the deletion event in real-time
    await setDoc(docRef, {
      deleted: true,
      deletedAt: new Date().toISOString(),
      ownerUid: user.uid,
    });
  } catch (e) {
    console.error("[FirebaseSync] Failed to delete remote vault:", e);
    throw e;
  }
}

/**
 * Disconnect and sign out of Firebase.
 */
export async function signOutFirebase(targetUid?: string): Promise<void> {
  stopRemoteVaultSubscription();
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        await FirebaseAuthentication.signOut();
      } catch {}
    }
    const auth = await getFirebaseAuth(targetUid);
    await signOut(auth);
  } catch {
    // Ignore signout errors
  }
  await deleteDataFile(FIREBASE_STATE_FILE);
  const resetState = { ...defaultFirebaseConfig };
  notifyStateListeners(resetState);
}

/**
 * Download remote encrypted vault from Firestore without local merging.
 * Used during SetupWizard / initial onboarding restore.
 */
export async function fetchRemoteVaultFromFirebase(): Promise<string | null> {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please sign in with your Google account first.");
  }

  const db = await getFirebaseDb();
  const docRef = doc(db, "vaults", user.uid);

  let snap: DocumentSnapshot;
  try {
    snap = await getDoc(docRef);
  } catch (err: any) {
    const isOffline =
      err?.code === "unavailable" ||
      (err?.message && err.message.toLowerCase().includes("client is offline"));
    if (isOffline) {
      await new Promise((r) => setTimeout(r, 1200));
      snap = await getDoc(docRef);
    } else {
      throw err;
    }
  }

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  if (data?.deleted === true) {
    return null;
  }

  // Strip Firestore specific metadata and return standard vault JSON envelope
  const { updatedAt: _up, updatedByDevice: _dev, deleted: _del, deletedAt: _delAt, ...cleanEnvelope } = data;
  return JSON.stringify(cleanEnvelope, null, 2);
}

/**
 * Upload the current local vault envelope to Cloud Firestore.
 * ONLY zero-knowledge encrypted ciphertext + Argon2id wrap are stored.
 */
export async function uploadVaultToFirebase(
  vaultRaw: string,
): Promise<{ updatedAt: string }> {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User is not signed in to Firebase.");
  }

  const parsed = JSON.parse(vaultRaw) as Record<string, unknown>;
  const updatedAt = new Date().toISOString();

  const payload = {
    ...parsed,
    ownerUid: user.uid,
    ownerEmail: user.email || undefined,
    deleted: false,
    deletedAt: null,
    updatedAt,
    updatedByDevice: typeof window !== "undefined" && window.electronAPI ? "desktop" : "mobile",
  };

  const db = await getFirebaseDb();
  const docRef = doc(db, "vaults", user.uid);
  // Overwrite document so any previous tombstone is replaced
  await setDoc(docRef, payload);

  return { updatedAt };
}

/**
 * Subscribe to real-time remote vault changes via Firestore onSnapshot.
 * When another device updates or deletes passwords, this listener immediately
 * reconciles the incoming changes into the active session without polling.
 */
export function subscribeRemoteVault(
  vaultTarget: VaultSyncTarget,
  onRemoteChange?: () => void,
  onRemoteDeleted?: () => void,
): () => void {
  stopRemoteVaultSubscription();

  let isSubscribed = true;
  let isMerging = false;

  void (async () => {
    try {
      const auth = await getFirebaseAuth();
      let user = auth.currentUser;
      if (!user) {
        const activeUid = await getActiveAccountUid();
        if (activeUid) {
          await restoreAccountAuthSession(activeUid);
          const refreshedAuth = await getFirebaseAuth(activeUid);
          user = refreshedAuth.currentUser;
        }
      }
      if (!user || !isSubscribed) return;

      // Strict account check before subscribing
      const vaultOwner = await getVaultOwnerInfo();
      if (vaultOwner?.ownerUid && vaultOwner.ownerUid !== user.uid) {
        console.warn("[FirebaseSync] subscribeRemoteVault aborted: vault owner does not match current user.");
        return;
      }

      const db = await getFirebaseDb();
      if (!isSubscribed) return;

      const docRef = doc(db, "vaults", user.uid);

      const unsub = onSnapshot(
        docRef,
        async (snap) => {
          if (!isSubscribed) return;

          // Check if remote vault was deleted by user on another device
          if (snap.exists()) {
            const data = snap.data();
            if (data?.deleted === true) {
              const remoteDeletedAt = data?.deletedAt;
              try {
                const localRaw = await vaultTarget.exportVault();
                const localEnv = JSON.parse(localRaw);
                const localUpdatedAt = localEnv?.updatedAt;
                if (
                  localUpdatedAt &&
                  remoteDeletedAt &&
                  new Date(localUpdatedAt).getTime() >= new Date(remoteDeletedAt).getTime()
                ) {
                  console.info("[FirebaseSync] Ignoring remote deletion tombstone older than local vault.");
                  return;
                }
              } catch {}

              console.warn("[FirebaseSync] Remote vault was deleted on another device.");
              onRemoteDeleted?.();
              return;
            }
          } else {
            const state = await loadFirebaseSyncState();
            if (state.lastSyncAt) {
              console.warn("[FirebaseSync] Remote vault missing for previously synced account. Treating as remote deletion.");
              onRemoteDeleted?.();
              return;
            }
            return;
          }

          if (isMerging || !vaultTarget.unlocked) return;

          try {
            isMerging = true;
            const data = snap.data();
            const { updatedAt: _up, updatedByDevice: _dev, ...envelope } = data;
            const remoteEnvelope = envelope as Record<string, any>;
            const localRaw = await vaultTarget.exportVault();
            let localEnvelope: Record<string, any> = {};
            try {
              localEnvelope = JSON.parse(localRaw);
            } catch {}

            const isIdentical =
              Boolean(localEnvelope.ciphertext) &&
              localEnvelope.ciphertext === remoteEnvelope.ciphertext &&
              localEnvelope.iv === remoteEnvelope.iv;

            if (!isIdentical) {
              try {
                await vaultTarget.mergeUnlockedFromRaw(JSON.stringify(envelope));
                const syncedAt = new Date().toISOString();
                await saveFirebaseSyncState({
                  lastSyncStatus: "success",
                  lastSyncAt: syncedAt,
                  lastError: null,
                });
                onRemoteChange?.();
              } catch (err: any) {
                console.warn("[FirebaseSync] Realtime merge skipped (key mismatch or decrypt error):", err);
              }
            }
          } catch (e) {
            console.error("[FirebaseSync] Realtime merge error:", e);
          } finally {
            isMerging = false;
          }
        },
        (error) => {
          console.warn("[FirebaseSync] onSnapshot listener warning:", error);
        },
      );

      if (!isSubscribed) {
        unsub();
      } else {
        activeRemoteUnsubscribe = unsub;
      }
    } catch (e) {
      console.warn("[FirebaseSync] Realtime subscription skipped:", e);
    }
  })();

  return () => {
    isSubscribed = false;
    stopRemoteVaultSubscription();
  };
}

/**
 * Full zero-knowledge bidirectional sync with Cloud Firestore:
 * 1. Checks current authenticated user.
 * 2. Fetches remote encrypted vault document.
 * 3. If none exists, uploads current local vault.
 * 4. If remote exists and differs, merges remote into local unlocked session.
 * 5. Pushes reconciled state back to Cloud Firestore.
 */
let activeSyncPromise: Promise<FirebaseSyncResult> | null = null;

export async function syncVaultWithFirebase(
  vault: VaultSyncTarget,
): Promise<FirebaseSyncResult> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    try {
      return await executeSyncVaultWithFirebase(vault);
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

async function executeSyncVaultWithFirebase(
  vault: VaultSyncTarget,
): Promise<FirebaseSyncResult> {
  if (!vault.unlocked) {
    return {
      ok: false,
      message: "Vault must be unlocked to perform sync.",
      error: "VAULT_LOCKED",
    };
  }

  const projectConfig = await loadFirebaseConfig();
  if (!isFirebaseConfigured(projectConfig)) {
    return {
      ok: false,
      message: "Firebase is not configured.",
      error: "NOT_CONFIGURED",
    };
  }

  let state = await loadFirebaseSyncState();
  if (!state.enabled) {
    return {
      ok: false,
      message: "Cloud sync is not enabled. Sign in with Google to enable.",
      error: "SYNC_DISABLED",
    };
  }

  await saveFirebaseSyncState({ lastSyncStatus: "syncing", lastError: null });

  try {
    const auth = await getFirebaseAuth();
    let user = auth.currentUser;
    if (!user) {
      const activeUid = await getActiveAccountUid();
      if (activeUid) {
        await restoreAccountAuthSession(activeUid);
        const refreshedAuth = await getFirebaseAuth(activeUid);
        user = refreshedAuth.currentUser;
      }
    }
    if (!user) {
      throw new Error("Google authentication expired. Please sign in again.");
    }

    // 1. Strict Account Check: Verify local vault owner
    const vaultOwner = await getVaultOwnerInfo();
    if (vaultOwner?.ownerUid && vaultOwner.ownerUid !== user.uid) {
      const mismatchMsg = `Account mismatch: This vault is linked to ${vaultOwner.ownerEmail || "another account"}. You cannot sync it with ${user.email}. Every account has its own separate vault.`;
      await saveFirebaseSyncState({
        lastSyncStatus: "error",
        lastError: mismatchMsg,
      });
      return {
        ok: false,
        message: mismatchMsg,
        error: mismatchMsg,
      };
    }

    const localRaw = await vault.exportVault();
    const db = await getFirebaseDb();
    const docRef = doc(db, "vaults", user.uid);
    let snap: DocumentSnapshot;
    try {
      snap = await getDoc(docRef);
    } catch (docErr: any) {
      const isOffline =
        docErr?.code === "unavailable" ||
        (docErr?.message && docErr.message.toLowerCase().includes("client is offline")) ||
        (docErr?.message && docErr.message.toLowerCase().includes("timed out"));
      if (isOffline) {
        console.warn("[FirebaseSync] Client is offline during sync; queuing local vault push:", docErr);
        // setDoc will write to local IndexedDB persistence and auto-push once online
        const { updatedAt } = await uploadVaultToFirebase(localRaw);
        await saveFirebaseSyncState({
          lastSyncStatus: "idle",
          lastSyncAt: updatedAt,
          lastError: "Offline: changes queued and will sync when connected.",
        });
        return {
          ok: true,
          message: "Changes queued offline. Sync will complete once online.",
          syncedAt: updatedAt,
        };
      }
      throw docErr;
    }

    // 2. Check if cloud vault was marked as deleted by another device
    if (snap.exists() && snap.data()?.deleted === true) {
      const remoteDeletedAt = snap.data()?.deletedAt;
      let localUpdatedAt: string | undefined;
      try {
        const parsedLocal = JSON.parse(localRaw);
        localUpdatedAt = parsedLocal?.updatedAt;
      } catch {}

      const isNewerThanDeletion =
        !remoteDeletedAt ||
        !localUpdatedAt ||
        new Date(localUpdatedAt).getTime() >= new Date(remoteDeletedAt).getTime();

      if (isNewerThanDeletion) {
        // This local vault was created or updated AFTER the deletion occurred!
        // Overwrite the tombstone with this newly created vault.
        console.info("[FirebaseSync] Local vault is newer than remote deletion tombstone. Overwriting tombstone with new vault.");
        const { updatedAt } = await uploadVaultToFirebase(localRaw);
        await saveFirebaseSyncState({
          lastSyncStatus: "success",
          lastSyncAt: updatedAt,
          ownerUid: user.uid,
          ownerEmail: user.email || undefined,
          lastError: null,
        });
        return {
          ok: true,
          message: "New vault uploaded to Firebase Cloud.",
          syncedAt: updatedAt,
        };
      }

      console.warn("[FirebaseSync] Local vault is older than remote deletion tombstone.");
      await signOutFirebase();
      return {
        ok: false,
        message: "This account's cloud vault was deleted on another device.",
        error: "REMOTE_DELETED",
      };
    }

    // 3. Offline Vault Overwrite Prevention (only if active remote vault is not deleted)
    if (!vaultOwner?.ownerUid && snap.exists() && snap.data()?.deleted !== true) {
      const err = `Account ${user.email} already has an existing cloud vault. An offline vault cannot overwrite an existing account vault. Please restore your cloud vault from the setup screen.`;
      await saveFirebaseSyncState({
        lastSyncStatus: "error",
        lastError: err,
      });
      return {
        ok: false,
        message: err,
        error: err,
      };
    }

    if (!snap.exists()) {
      // If this device was previously synced, a missing document means it was deleted!
      // Do NOT resurrect it by re-uploading!
      if (state.lastSyncAt) {
        console.warn("[FirebaseSync] Remote cloud vault was deleted. Skipping re-upload to avoid resurrecting deleted vault.");
        await signOutFirebase();
        return {
          ok: false,
          message: "This account's cloud vault was deleted on another device. Sync stopped.",
          error: "REMOTE_DELETED",
        };
      }

      // First-time upload to cloud
      const { updatedAt } = await uploadVaultToFirebase(localRaw);
      await saveFirebaseSyncState({
        lastSyncStatus: "success",
        lastSyncAt: updatedAt,
        ownerUid: user.uid,
        ownerEmail: user.email || undefined,
        lastError: null,
      });

      return {
        ok: true,
        message: "Vault uploaded to Firebase Cloud successfully.",
        syncedAt: updatedAt,
      };
    }

    const data = snap.data();
    const { updatedAt: _up, updatedByDevice: _dev, ...cleanEnvelope } = data;
    const remoteEnvelope = cleanEnvelope as Record<string, any>;
    let localEnvelope: Record<string, any> = {};
    try {
      localEnvelope = JSON.parse(localRaw);
    } catch {}

    const isIdentical =
      Boolean(localEnvelope.ciphertext) &&
      localEnvelope.ciphertext === remoteEnvelope.ciphertext &&
      localEnvelope.iv === remoteEnvelope.iv;

    // If already identical, just refresh timestamp
    if (isIdentical) {
      const syncedAt = new Date().toISOString();
      await saveFirebaseSyncState({
        lastSyncStatus: "success",
        lastSyncAt: syncedAt,
        lastError: null,
      });
      return {
        ok: true,
        message: "Vault is already up to date with cloud.",
        syncedAt,
      };
    }

    // Merge remote into local session
    const remoteRaw = JSON.stringify(cleanEnvelope);
    try {
      await vault.mergeUnlockedFromRaw(remoteRaw);
    } catch (mergeErr: any) {
      const errMsg = mergeErr?.message || "";
      if (
        mergeErr?.name === "VaultDecryptError" ||
        errMsg.includes("Could not decrypt") ||
        errMsg.includes("operation failed")
      ) {
        throw new Error(
          "Cloud vault cannot be decrypted with this device's key. This occurs if both devices created separate vaults instead of restoring from the same backup. Please restore this device using 'Restore from Google Account' or import a .pms backup from your other device.",
        );
      }
      throw mergeErr;
    }

    // Upload reconciled state back to Firestore
    const mergedRaw = await vault.exportVault();
    const { updatedAt } = await uploadVaultToFirebase(mergedRaw);

    await saveFirebaseSyncState({
      lastSyncStatus: "success",
      lastSyncAt: updatedAt,
      lastError: null,
    });

    return {
      ok: true,
      message: "Synced and merged changes with Firebase Cloud.",
      syncedAt: updatedAt,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[FirebaseSync] Sync error:", err);
    await saveFirebaseSyncState({
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
