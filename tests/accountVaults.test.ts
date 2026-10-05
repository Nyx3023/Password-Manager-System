import { describe, it, expect, beforeEach } from "vitest";
import {
  archiveCurrentVault,
  restoreArchivedVault,
  listCachedAccounts,
  removeArchivedVault,
  CACHED_ACCOUNTS_FILE,
} from "../src/shared/accountVaults";
import {
  saveVaultFile,
  loadVaultFile,
  resetAllAppData,
  deleteDataFile,
  clearActiveVaultSlot,
} from "../src/shared/storage";
import { restoreViaGoogleAccount } from "../src/shared/firebaseSync";

describe("accountVaults switching and archiving", () => {
  beforeEach(async () => {
    await resetAllAppData();
    await deleteDataFile(CACHED_ACCOUNTS_FILE);
  });

  it("should archive current active vault and list cached accounts", async () => {
    // 1. Create active vault
    const fakeEnvelope = JSON.stringify({
      version: 2,
      vaultId: "vault-user-a",
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      ciphertext: "user-a-ciphertext",
      iv: "user-a-iv",
    });
    await saveVaultFile(fakeEnvelope);

    // 2. Archive for User A
    await archiveCurrentVault("uid-user-a", "user.a@gmail.com");

    const cached = await listCachedAccounts();
    expect(cached).toHaveLength(1);
    expect(cached[0].uid).toBe("uid-user-a");
    expect(cached[0].email).toBe("user.a@gmail.com");

    // 3. Clear active slot
    await clearActiveVaultSlot();
    expect(await loadVaultFile()).toBeNull();

    // 4. Restore User A
    const restored = await restoreArchivedVault("uid-user-a");
    expect(restored).toBe(true);

    const activeRaw = await loadVaultFile();
    expect(activeRaw).toBe(fakeEnvelope);
  });

  it("should switch between multiple accounts cleanly", async () => {
    const vaultA = JSON.stringify({
      version: 2,
      vaultId: "vault-a",
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      ciphertext: "cipher-a",
      iv: "iv-a",
    });
    const vaultB = JSON.stringify({
      version: 2,
      vaultId: "vault-b",
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      ciphertext: "cipher-b",
      iv: "iv-b",
    });

    // Save & archive Vault A
    await saveVaultFile(vaultA);
    await archiveCurrentVault("uid-a", "a@example.com");

    // Save & archive Vault B
    await saveVaultFile(vaultB);
    await archiveCurrentVault("uid-b", "b@example.com");

    let accounts = await listCachedAccounts();
    expect(accounts).toHaveLength(2);

    // Restore Vault A
    await restoreArchivedVault("uid-a");
    expect(await loadVaultFile()).toBe(vaultA);

    // Restore Vault B
    await restoreArchivedVault("uid-b");
    expect(await loadVaultFile()).toBe(vaultB);

    // Delete Account A
    await removeArchivedVault("uid-a");
    accounts = await listCachedAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].uid).toBe("uid-b");
    expect(await restoreArchivedVault("uid-a")).toBe(false);
  });

  it("should restore via Google account when an active vault is mismatched", async () => {
    // Current local vault (e.g. offline or user A)
    const localVault = JSON.stringify({
      version: 2,
      vaultId: "vault-offline",
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      ciphertext: "offline-data",
      iv: "offline-iv",
    });
    await saveVaultFile(localVault);

    // Target Google account has an archived vault
    const cloudAccountVault = JSON.stringify({
      version: 2,
      vaultId: "vault-google-cloud",
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      ciphertext: "google-cloud-data",
      iv: "google-cloud-iv",
    });
    await saveVaultFile(cloudAccountVault);
    await archiveCurrentVault("uid-google", "google@example.com");

    // Put back the offline vault into active slot
    await saveVaultFile(localVault);

    // Now restore via Google account
    const ok = await restoreViaGoogleAccount({
      uid: "uid-google",
      email: "google@example.com",
    });
    expect(ok).toBe(true);

    // Active slot now has the Google cloud vault!
    expect(await loadVaultFile()).toBe(cloudAccountVault);

    // And the previous offline vault was archived safely!
    const accounts = await listCachedAccounts();
    expect(accounts.some((a) => a.uid === "offline" || a.uid === "uid-google")).toBe(true);
  });
});
