export class VaultDecryptError extends Error {
  readonly code: "payload" | "json";

  constructor(code: "payload" | "json", options?: { biometric?: boolean }) {
    const biometric = options?.biometric ?? false;
    super(
      biometric
        ? "Biometric unlock is out of date (for example after changing fingerprints). Use your MPIN or master password, then turn biometrics on again in Settings."
        : code === "payload"
          ? "Could not decrypt the vault. Try your MPIN or master password. If you have a .pms backup, import it from the unlock screen."
          : "Vault data is unreadable. Restore from a .pms backup if you have one.",
    );
    this.name = "VaultDecryptError";
    this.code = code;
  }
}

export function isVaultDecryptError(e: unknown): e is VaultDecryptError {
  return e instanceof VaultDecryptError;
}
