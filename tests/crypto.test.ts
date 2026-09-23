import { describe, it, expect } from "vitest";
import {
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  encryptPayload,
  decryptPayload,
} from "../src/shared/crypto";

describe("crypto module", () => {
  it("should wrap and unwrap vault key with correct master password", async () => {
    const key = generateVaultKey();
    expect(key.length).toBe(32);

    const masterPassword = "CorrectHorseBatteryStaple123!";
    const wrapped = await wrapVaultKey(masterPassword, key);

    expect(wrapped.wrappedKey).toBeDefined();
    expect(wrapped.wrappedKeyIv).toBeDefined();
    expect(wrapped.salt.length).toBe(16);

    const unwrapped = await unwrapVaultKey(
      masterPassword,
      wrapped.salt,
      wrapped.wrappedKeyIv,
      wrapped.wrappedKey,
    );

    expect(unwrapped).toEqual(key);
  });

  it("should fail to unwrap vault key with wrong master password", async () => {
    const key = generateVaultKey();
    const wrapped = await wrapVaultKey("MySecret123!", key);

    await expect(
      unwrapVaultKey(
        "WrongSecret999!",
        wrapped.salt,
        wrapped.wrappedKeyIv,
        wrapped.wrappedKey,
      ),
    ).rejects.toThrow("Incorrect master password.");
  });

  it("should encrypt and decrypt string payload cleanly", async () => {
    const key = generateVaultKey();
    const secretData = JSON.stringify({
      entries: [{ id: "e1", title: "GitHub", password: "super-secret" }],
    });

    const encrypted = await encryptPayload(key, secretData);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();

    const decrypted = await decryptPayload(key, encrypted.iv, encrypted.ciphertext);
    expect(decrypted).toBe(secretData);
  });

  it("should fail decryptPayload when key is wrong length", async () => {
    const badKey = new Uint8Array(16);
    await expect(decryptPayload(badKey, "iv", "cipher")).rejects.toThrow(
      "Invalid vault key length.",
    );
  });
});
