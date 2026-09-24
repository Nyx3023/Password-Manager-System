/**
 * SecureX Firebase Initialization & Configuration Module
 */

import { initializeApp, getApps, getApp, deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, type Auth } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import {
  initializeFirestore,
  getFirestore,
  enableNetwork,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  type Firestore,
} from "firebase/firestore";
import { readDataFile, writeDataFile, deleteDataFile, getVaultOwnerInfo } from "./storage";

export const FIREBASE_CONFIG_FILE = "firebase_project_config.json";

export interface FirebaseProjectConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

const envConfig: FirebaseProjectConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || "",
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || "",
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || "",
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || "",
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || "",
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || "",
};

const authMap = new Map<string, Auth>();
const dbMap = new Map<string, Firestore>();
let cachedConfig: FirebaseProjectConfig | null = null;

export async function loadFirebaseConfig(): Promise<FirebaseProjectConfig> {
  if (cachedConfig) return cachedConfig;

  // 1. Try local storage override
  try {
    const raw = await readDataFile(FIREBASE_CONFIG_FILE);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FirebaseProjectConfig>;
      if (parsed.apiKey && parsed.projectId) {
        cachedConfig = {
          apiKey: parsed.apiKey || "",
          authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
          projectId: parsed.projectId || "",
          storageBucket: parsed.storageBucket || `${parsed.projectId}.appspot.com`,
          messagingSenderId: parsed.messagingSenderId || "",
          appId: parsed.appId || "",
        };
        return cachedConfig;
      }
    }
  } catch (e) {
    console.warn("[FirebaseConfig] Failed to load stored config:", e);
  }

  // 2. Fall back to environment config
  cachedConfig = { ...envConfig };
  return cachedConfig;
}

export async function saveCustomFirebaseConfig(
  config: FirebaseProjectConfig,
): Promise<void> {
  await writeDataFile(FIREBASE_CONFIG_FILE, JSON.stringify(config, null, 2));
  cachedConfig = { ...config };
  authMap.clear();
  dbMap.clear();
}

export async function resetCustomFirebaseConfig(): Promise<void> {
  await deleteDataFile(FIREBASE_CONFIG_FILE);
  cachedConfig = { ...envConfig };
  authMap.clear();
  dbMap.clear();
}

export function isFirebaseConfigured(config?: FirebaseProjectConfig): boolean {
  const cfg = config || cachedConfig || envConfig;
  return Boolean(cfg.apiKey && cfg.projectId && cfg.appId);
}

export async function getActiveAccountUid(): Promise<string | undefined> {
  try {
    const owner = await getVaultOwnerInfo();
    if (owner?.ownerUid) return owner.ownerUid;
    const rawState = await readDataFile("firebase_sync_state.json");
    if (rawState) {
      const parsed = JSON.parse(rawState) as Record<string, any>;
      if (parsed.ownerUid) return parsed.ownerUid;
      if (parsed.userId) return parsed.userId;
    }
  } catch {}
  return undefined;
}

/**
 * Initialize or retrieve the active Firebase App.
 * When targetUid is provided (or resolved from active vault), uses a dedicated named
 * app instance (`account_${targetUid}`) so multiple Google accounts maintain separate,
 * persistent sessions without expiring or overwriting each other.
 */
export async function getFirebaseApp(targetUid?: string): Promise<FirebaseApp> {
  const config = await loadFirebaseConfig();
  if (!isFirebaseConfigured(config)) {
    throw new Error(
      "Firebase is not configured. Please provide Firebase credentials in Settings or .env.",
    );
  }

  const resolvedUid = targetUid || (await getActiveAccountUid());
  const appName = resolvedUid && resolvedUid !== "[DEFAULT]" ? `account_${resolvedUid}` : "[DEFAULT]";

  const existing = getApps().find((a) => a.name === appName);
  if (existing) return existing;

  if (appName === "[DEFAULT]") {
    try {
      return getApp();
    } catch {
      return initializeApp(config);
    }
  }
  return initializeApp(config, appName);
}

async function writeIndexedDBStorage(
  dbName: string,
  storeName: string,
  key: string,
  value: any,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "fbase_key" });
        }
      };
      req.onerror = () => resolve();
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            return resolve();
          }
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);
          store.put({ fbase_key: key, value });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          db.close();
          resolve();
        }
      };
    } catch {
      resolve();
    }
  });
}

/**
 * Persist an account's authenticated Firebase user session to disk and IndexedDB.
 * This guarantees the user's refresh token and credentials survive account switches.
 */
export async function saveAccountAuthSession(uid: string, rawUser: any): Promise<void> {
  if (!uid || !rawUser) return;
  try {
    const config = await loadFirebaseConfig();
    const cleanUser = typeof rawUser === "object" ? { ...rawUser } : JSON.parse(rawUser);

    await writeDataFile(`auth_session_${uid}.json`, JSON.stringify(cleanUser, null, 2));

    if (config.apiKey) {
      const namedRecord = {
        ...cleanUser,
        apiKey: config.apiKey,
        appName: `account_${uid}`,
      };
      const namedKey = `firebase:authUser:${config.apiKey}:account_${uid}`;
      await writeIndexedDBStorage("firebaseLocalStorageDb", "firebaseLocalStorage", namedKey, namedRecord);

      const defaultRecord = {
        ...cleanUser,
        apiKey: config.apiKey,
        appName: "[DEFAULT]",
      };
      const defaultKey = `firebase:authUser:${config.apiKey}:[DEFAULT]`;
      await writeIndexedDBStorage("firebaseLocalStorageDb", "firebaseLocalStorage", defaultKey, defaultRecord);

      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(namedKey, JSON.stringify(namedRecord));
          localStorage.setItem(defaultKey, JSON.stringify(defaultRecord));
        }
      } catch {}
    }
  } catch (e) {
    console.warn("[FirebaseConfig] Failed to save account auth session:", e);
  }
}

/**
 * Restore an archived account's Firebase session from disk into IndexedDB and refresh tokens via STS.
 */
export async function restoreAccountAuthSession(uid: string): Promise<boolean> {
  if (!uid || uid === "offline") return false;
  try {
    const raw = await readDataFile(`auth_session_${uid}.json`);
    if (!raw) return false;
    const userData = JSON.parse(raw) as Record<string, any>;
    const config = await loadFirebaseConfig();

    if (!userData.stsTokenManager?.refreshToken) return false;

    // If access token is expired or expiring in next 2 minutes, refresh it via Google STS
    const expTime = Number(userData.stsTokenManager.expirationTime) || 0;
    if (expTime <= Date.now() + 120000 && config.apiKey) {
      try {
        const resp = await fetch(
          `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: userData.stsTokenManager.refreshToken,
            }),
          },
        );
        if (resp.ok) {
          const fresh = await resp.json();
          userData.stsTokenManager.accessToken = fresh.access_token;
          userData.stsTokenManager.refreshToken = fresh.refresh_token || userData.stsTokenManager.refreshToken;
          userData.stsTokenManager.expirationTime = Date.now() + (parseInt(fresh.expires_in, 10) || 3600) * 1000;
          await writeDataFile(`auth_session_${uid}.json`, JSON.stringify(userData, null, 2));
        }
      } catch (refreshErr) {
        console.warn("[FirebaseConfig] STS token refresh attempt notice:", refreshErr);
      }
    }

    if (userData.stsTokenManager?.expirationTime) {
      userData.stsTokenManager.expirationTime = Number(userData.stsTokenManager.expirationTime);
    }

    if (config.apiKey) {
      const namedRecord = {
        ...userData,
        apiKey: config.apiKey,
        appName: `account_${uid}`,
      };
      const namedKey = `firebase:authUser:${config.apiKey}:account_${uid}`;
      await writeIndexedDBStorage("firebaseLocalStorageDb", "firebaseLocalStorage", namedKey, namedRecord);

      const defaultRecord = {
        ...userData,
        apiKey: config.apiKey,
        appName: "[DEFAULT]",
      };
      const defaultKey = `firebase:authUser:${config.apiKey}:[DEFAULT]`;
      await writeIndexedDBStorage("firebaseLocalStorageDb", "firebaseLocalStorage", defaultKey, defaultRecord);

      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(namedKey, JSON.stringify(namedRecord));
          localStorage.setItem(defaultKey, JSON.stringify(defaultRecord));
        }
      } catch {}
    }

    // Delete existing FirebaseApp instances so fresh ones are created and reloaded from IndexedDB
    for (const app of getApps()) {
      if (app.name === `account_${uid}` || app.name === "[DEFAULT]") {
        try {
          await deleteApp(app);
        } catch {}
      }
    }
    authMap.clear();
    dbMap.clear();
    return true;
  } catch (e) {
    console.warn("[FirebaseConfig] Failed to restore account auth session:", e);
    return false;
  }
}

/**
 * Initialize or retrieve the Firebase Auth instance for the active or specified account.
 */
export async function getFirebaseAuth(targetUid?: string): Promise<Auth> {
  const resolvedUid = targetUid || (await getActiveAccountUid());
  const app = await getFirebaseApp(resolvedUid);
  const appName = app.name;

  let auth = authMap.get(appName);
  if (!auth) {
    if (Capacitor.isNativePlatform()) {
      try {
        auth = initializeAuth(app, {
          persistence: indexedDBLocalPersistence,
        });
      } catch {
        auth = getAuth(app);
      }
    } else {
      auth = getAuth(app);
    }
    authMap.set(appName, auth);
  }

  // Ensure initial auth state has been restored from persistence
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }

  // Fallback 1: If named app has no user yet, check if [DEFAULT] app is signed in as this user
  if (resolvedUid && !auth.currentUser) {
    const defaultApp = getApps().find((a) => a.name === "[DEFAULT]");
    if (defaultApp) {
      let defaultAuth = authMap.get("[DEFAULT]");
      if (!defaultAuth) {
        defaultAuth = getAuth(defaultApp);
        authMap.set("[DEFAULT]", defaultAuth);
      }
      if (typeof defaultAuth.authStateReady === "function") {
        await defaultAuth.authStateReady();
      }
      if (defaultAuth.currentUser?.uid === resolvedUid) {
        return defaultAuth;
      }
    }
  }

  // Fallback 2: If still no user, restore session from disk and refresh via STS
  if (resolvedUid && !auth.currentUser) {
    const restored = await restoreAccountAuthSession(resolvedUid);
    if (restored) {
      // Re-acquire fresh auth instance after storage update
      const freshApp = await getFirebaseApp(resolvedUid);
      const freshAuth = getAuth(freshApp);
      authMap.set(appName, freshAuth);
      if (typeof freshAuth.authStateReady === "function") {
        await freshAuth.authStateReady();
      }
      if (freshAuth.currentUser) {
        return freshAuth;
      }
    }
  }

  return auth;
}

/**
 * Initialize or retrieve the Cloud Firestore instance with offline persistence.
 */
export async function getFirebaseDb(targetUid?: string): Promise<Firestore> {
  const auth = await getFirebaseAuth(targetUid);
  const app = auth.app;
  const appName = app.name;

  let db = dbMap.get(appName);
  if (db) return db;

  const isNative = Capacitor.isNativePlatform();
  try {
    const firestoreSettings: any = {
      localCache: persistentLocalCache({
        tabManager: isNative
          ? persistentSingleTabManager({ forceOwnership: true })
          : persistentMultipleTabManager(),
      }),
    };
    if (isNative) {
      firestoreSettings.experimentalForceLongPolling = true;
    } else {
      firestoreSettings.experimentalAutoDetectLongPolling = true;
    }
    db = initializeFirestore(app, firestoreSettings);
  } catch {
    db = getFirestore(app);
  }

  dbMap.set(appName, db);
  return db;
}

/**
 * Explicitly reconnect the Firestore network transport if idle or offline.
 */
export async function reconnectFirebaseDb(targetUid?: string): Promise<void> {
  try {
    const db = await getFirebaseDb(targetUid);
    await enableNetwork(db);
  } catch {
    // Ignore errors if network is already enabled
  }
}

