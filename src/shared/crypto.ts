import { argon2id } from "hash-wasm";

const ARGON2_MEMORY_KIB = 65536;
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 4;
const ARGON2_HASH_LENGTH = 32;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveKey(
  masterPassword: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const hash = await argon2id({
    password: masterPassword,
    salt,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: "binary",
  });
  return new Uint8Array(hash);
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    asBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function aesEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  iv?: Uint8Array,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const usedIv = iv ?? randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBuffer(usedIv) },
    key,
    asBuffer(plaintext),
  );
  return { iv: usedIv, ciphertext: new Uint8Array(ciphertext) };
}

async function aesDecrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBuffer(iv) },
    key,
    asBuffer(ciphertext),
  );
  return new Uint8Array(decrypted);
}

export async function wrapVaultKey(
  masterPassword: string,
  vaultKey: Uint8Array,
  salt?: Uint8Array,
): Promise<{ salt: Uint8Array; wrappedKey: string; wrappedKeyIv: string }> {
  const usedSalt = salt ?? randomBytes(16);
  const derived = await deriveKey(masterPassword, usedSalt);
  const wrappingKey = await importAesKey(derived);
  const { iv, ciphertext } = await aesEncrypt(wrappingKey, vaultKey);
  derived.fill(0);
  return {
    salt: usedSalt,
    wrappedKey: toBase64(ciphertext),
    wrappedKeyIv: toBase64(iv),
  };
}

export async function unwrapVaultKey(
  masterPassword: string,
  salt: Uint8Array,
  wrappedKeyIv: string,
  wrappedKey: string,
): Promise<Uint8Array> {
  const derived = await deriveKey(masterPassword, salt);
  const wrappingKey = await importAesKey(derived);
  try {
    const vaultKey = await aesDecrypt(
      wrappingKey,
      fromBase64(wrappedKeyIv),
      fromBase64(wrappedKey),
    );
    derived.fill(0);
    return vaultKey;
  } catch {
    derived.fill(0);
    throw new Error("Incorrect master password.");
  }
}

export async function encryptPayload(
  vaultKey: Uint8Array,
  payload: string,
): Promise<{ iv: string; ciphertext: string }> {
  const key = await importAesKey(vaultKey);
  const { iv, ciphertext } = await aesEncrypt(
    key,
    new TextEncoder().encode(payload),
  );
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

export async function decryptPayload(
  vaultKey: Uint8Array,
  iv: string,
  ciphertext: string,
): Promise<string> {
  const key = await importAesKey(vaultKey);
  try {
    const decrypted = await aesDecrypt(
      key,
      fromBase64(iv),
      fromBase64(ciphertext),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("Vault data is corrupted.");
  }
}

export function generateVaultKey(): Uint8Array {
  return randomBytes(32);
}
