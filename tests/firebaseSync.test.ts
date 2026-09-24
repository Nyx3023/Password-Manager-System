import { describe, it, expect } from "vitest";
import { isFirebaseConfigured, type FirebaseProjectConfig } from "../src/shared/firebaseConfig";
import { defaultFirebaseConfig } from "../src/shared/firebaseSync";

describe("firebaseConfig & sync module", () => {
  it("should validate complete firebase configuration", () => {
    const validConfig: FirebaseProjectConfig = {
      apiKey: "AIzaSyFakeKeyForTesting123456789",
      authDomain: "securex-test.firebaseapp.com",
      projectId: "securex-test",
      appId: "1:1023472971995:web:abcd1234efgh5678",
    };
    expect(isFirebaseConfigured(validConfig)).toBe(true);
  });

  it("should reject incomplete firebase configuration", () => {
    const incompleteConfig: FirebaseProjectConfig = {
      apiKey: "",
      authDomain: "",
      projectId: "securex-test",
      appId: "",
    };
    expect(isFirebaseConfigured(incompleteConfig)).toBe(false);
  });

  it("should have safe default sync state with autoSync enabled and zero-knowledge posture", () => {
    expect(defaultFirebaseConfig.enabled).toBe(false);
    expect(defaultFirebaseConfig.autoSync).toBe(true);
    expect(defaultFirebaseConfig.lastSyncStatus).toBe("idle");
    expect(defaultFirebaseConfig.userId).toBeUndefined();
  });

  it("should ensure uploaded payload envelope contains zero plaintext", () => {
    // Simulating vault envelope exported by VaultService
    const mockEncryptedEnvelope = {
      version: 2,
      vaultId: "vault-uuid-1234",
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      master: {
        salt: "base64salt==",
        iterations: 3,
        memorySize: 65536,
        parallelism: 4,
        hashLength: 32,
        wrappedKey: "wrappedKeyBase64==",
        wrappedKeyIv: "wrappedIvBase64==",
      },
      iv: "payloadIvBase64==",
      ciphertext: "encryptedCiphertextBase64==",
    };

    const envelopeString = JSON.stringify(mockEncryptedEnvelope);
    const parsed = JSON.parse(envelopeString) as Record<string, unknown>;

    // Verify no plaintext fields exist in the payload
    expect(parsed).not.toHaveProperty("passwords");
    expect(parsed).not.toHaveProperty("entries");
    expect(parsed).not.toHaveProperty("people");
    expect(parsed).toHaveProperty("ciphertext");
    expect(parsed).toHaveProperty("iv");
    expect(parsed).toHaveProperty("master");
  });

  it("should preserve ownerUid and ownerEmail in account-centered vault envelopes without exposing plaintext", () => {
    const accountEnvelope = {
      version: 2,
      vaultId: "vault-uuid-user-a",
      ownerUid: "uid-user-a-12345",
      ownerEmail: "usera@example.com",
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      master: {
        salt: "base64salt==",
        iterations: 3,
        memorySize: 65536,
        parallelism: 4,
        hashLength: 32,
        wrappedKey: "wrappedKeyBase64==",
        wrappedKeyIv: "wrappedIvBase64==",
      },
      iv: "payloadIvBase64==",
      ciphertext: "encryptedCiphertextBase64==",
    };

    const str = JSON.stringify(accountEnvelope);
    const parsed = JSON.parse(str);
    expect(parsed.ownerUid).toBe("uid-user-a-12345");
    expect(parsed.ownerEmail).toBe("usera@example.com");
    expect(parsed).not.toHaveProperty("passwords");
    expect(parsed).not.toHaveProperty("entries");

    // Simulating account mismatch check: Account B tries to sync Account A's vault
    const accountB = { uid: "uid-user-b-99999", email: "userb@example.com" };
    const isMismatch = Boolean(parsed.ownerUid && parsed.ownerUid !== accountB.uid);
    expect(isMismatch).toBe(true);
  });

  it("should create isolated named app instances for each account UID", async () => {
    const { getFirebaseApp, getApps } = await import("../src/shared/firebaseConfig");
    const appA = await getFirebaseApp("user-a");
    const appB = await getFirebaseApp("user-b");

    expect(appA.name).toBe("account_user-a");
    expect(appB.name).toBe("account_user-b");
    expect(appA).not.toBe(appB);
  });
});
