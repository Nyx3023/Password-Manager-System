import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { toBase64, fromBase64 } from "./crypto";

const BIOMETRIC_SERVER = "com.passwordmanager.vault";
const BIOMETRIC_USERNAME = "vault-key";

export async function isBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

export async function enableBiometricUnlock(vaultKey: Uint8Array): Promise<void> {
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
  await NativeBiometric.verifyIdentity({
    reason: "Unlock your password vault",
    title: "Biometric unlock",
    subtitle: "Confirm your identity",
    description: "Use fingerprint or face unlock",
  });

  const credentials = await NativeBiometric.getCredentials({
    server: BIOMETRIC_SERVER,
  });

  return fromBase64(credentials.password);
}

export async function hasBiometricCredentials(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER });
    return true;
  } catch {
    return false;
  }
}
