import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { fromBase64, toBase64, VAULT_KEY_LENGTH } from "./crypto";
import { loadPrefs, savePrefs } from "./storage";

const BIOMETRIC_SERVER = "com.passwordmanager.vault";
const BIOMETRIC_USERNAME = "vault-key";

const BIOMETRIC_RESET_MESSAGE =
  "Biometric unlock is out of date. Use your MPIN or master password, then turn biometrics on again in Settings.";

export async function isBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

/** Clear prefs flag when secure storage no longer has valid credentials. */
export async function repairBiometricPrefsIfNeeded(): Promise<boolean> {
  const prefs = await loadPrefs();
  if (!prefs.biometricsEnabled) return false;

  const stored = await hasBiometricCredentials();
  if (stored) return false;

  prefs.biometricsEnabled = false;
  await savePrefs(prefs);
  return true;
}

async function clearBiometricState(): Promise<void> {
  await disableBiometricUnlock();
  const prefs = await loadPrefs();
  if (prefs.biometricsEnabled) {
    prefs.biometricsEnabled = false;
    await savePrefs(prefs);
  }
}

export async function enableBiometricUnlock(vaultKey: Uint8Array): Promise<void> {
  if (vaultKey.length !== VAULT_KEY_LENGTH) {
    throw new Error("Cannot enable biometrics: vault is not ready.");
  }

  await NativeBiometric.verifyIdentity({
    reason: "Enable biometric unlock for your vault",
    title: "Enable biometrics",
    subtitle: "Confirm your identity",
    description: "Use fingerprint or face unlock",
  });

  await NativeBiometric.setCredentials({
    username: BIOMETRIC_USERNAME,
    password: toBase64(vaultKey),
    server: BIOMETRIC_SERVER,
  });
}

export async function disableBiometricUnlock(): Promise<void> {
  try {
    await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
  } catch {
    // Already removed.
  }
}

export async function unlockWithBiometric(): Promise<Uint8Array> {
  try {
    await NativeBiometric.verifyIdentity({
      reason: "Unlock your password vault",
      title: "Biometric unlock",
      subtitle: "Confirm your identity",
      description: "Use fingerprint or face unlock",
    });
  } catch {
    throw new Error(BIOMETRIC_RESET_MESSAGE);
  }

  let credentials: { password: string };
  try {
    credentials = await NativeBiometric.getCredentials({
      server: BIOMETRIC_SERVER,
    });
  } catch {
    await clearBiometricState();
    throw new Error(BIOMETRIC_RESET_MESSAGE);
  }

  let vaultKey: Uint8Array;
  try {
    vaultKey = fromBase64(credentials.password);
  } catch {
    await clearBiometricState();
    throw new Error(BIOMETRIC_RESET_MESSAGE);
  }

  if (vaultKey.length !== VAULT_KEY_LENGTH) {
    await clearBiometricState();
    throw new Error(BIOMETRIC_RESET_MESSAGE);
  }

  return vaultKey;
}

export async function hasBiometricCredentials(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const credentials = await NativeBiometric.getCredentials({
      server: BIOMETRIC_SERVER,
    });
    if (!credentials.password) return false;
    const key = fromBase64(credentials.password);
    return key.length === VAULT_KEY_LENGTH;
  } catch {
    return false;
  }
}
