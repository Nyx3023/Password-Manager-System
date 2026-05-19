import {
  decryptPayload,
  encryptPayload,
  fromBase64,
  generateVaultKey,
  toBase64,
  unwrapVaultKey,
  VAULT_KEY_LENGTH,
  wrapVaultKey,
} from "./crypto";
import {
  disableBiometricUnlock,
  enableBiometricUnlock,
} from "./biometrics";
import { VaultDecryptError } from "./vaultErrors";
import { loadPrefs, loadVaultFile, savePrefs, saveVaultFile } from "./storage";
import { normalizePayload } from "./entryUtils";
import type {
  EncryptedVaultFile,
  ImportMode,
  KeyWrap,
  Person,
  PersonCategoryId,
  VaultEntry,
  VaultPayload,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function emptyPayload(): VaultPayload {
  return { version: 2, people: [], entries: [] };
}

const DEFAULT_KDF = {
  iterations: 3,
  memorySize: 65536,
  parallelism: 4,
  hashLength: 32,
};

/**
 * Parse encrypted file. Accepts legacy v1 (master-password only) and v2.
 */
function parseEncryptedFile(raw: string): EncryptedVaultFile {
  const obj = JSON.parse(raw) as Record<string, unknown>;
  if (obj.kdf !== "argon2id" || obj.cipher !== "aes-256-gcm") {
    throw new Error("Unsupported vault file.");
  }

  if (obj.version === 2 && typeof obj.master === "object") {
    return obj as unknown as EncryptedVaultFile;
  }

  if (obj.version === 1) {
    const params = obj.kdfParams as KeyWrap & {
      salt: string;
    };
    return {
      version: 2,
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      master: {
        salt: params.salt,
        iterations: params.iterations,
        memorySize: params.memorySize,
        parallelism: params.parallelism,
        hashLength: params.hashLength,
        wrappedKey: obj.wrappedKey as string,
        wrappedKeyIv: obj.wrappedKeyIv as string,
      },
      iv: obj.iv as string,
      ciphertext: obj.ciphertext as string,
    };
  }

  throw new Error("Unsupported vault file.");
}

async function buildMasterWrap(
  masterPassword: string,
  vaultKey: Uint8Array,
  existingSalt?: Uint8Array,
): Promise<KeyWrap> {
  const wrapped = await wrapVaultKey(masterPassword, vaultKey, existingSalt);
  return {
    salt: toBase64(wrapped.salt),
    iterations: DEFAULT_KDF.iterations,
    memorySize: DEFAULT_KDF.memorySize,
    parallelism: DEFAULT_KDF.parallelism,
    hashLength: DEFAULT_KDF.hashLength,
    wrappedKey: wrapped.wrappedKey,
    wrappedKeyIv: wrapped.wrappedKeyIv,
  };
}

async function decryptPayloadFromFile(
  vaultKey: Uint8Array,
  file: EncryptedVaultFile,
  options?: { biometric?: boolean },
): Promise<VaultPayload> {
  let json: string;
  try {
    json = await decryptPayload(vaultKey, file.iv, file.ciphertext);
  } catch {
    throw new VaultDecryptError("payload", { biometric: options?.biometric });
  }

  try {
    const payload = JSON.parse(json) as VaultPayload;
    return normalizePayload(payload);
  } catch {
    throw new VaultDecryptError("json", { biometric: options?.biometric });
  }
}

export class VaultService {
  private payload: VaultPayload | null = null;
  private vaultKey: Uint8Array | null = null;
  private file: EncryptedVaultFile | null = null;

  get isUnlocked(): boolean {
    return this.payload !== null && this.vaultKey !== null;
  }

  get entries(): VaultEntry[] {
    return this.payload?.entries ?? [];
  }

  get people(): Person[] {
    return this.payload?.people ?? [];
  }

  get hasMpin(): boolean {
    return !!this.file?.mpin;
  }

  async exists(): Promise<boolean> {
    return (await loadVaultFile()) !== null;
  }

  async getPrefs() {
    return loadPrefs();
  }

  /** Check whether the on-disk vault has an MPIN configured. */
  async hasMpinOnDisk(): Promise<boolean> {
    const raw = await loadVaultFile();
    if (!raw) return false;
    try {
      return !!parseEncryptedFile(raw).mpin;
    } catch {
      return false;
    }
  }

  async createVault(masterPassword: string): Promise<void> {
    this.vaultKey = generateVaultKey();
    this.payload = emptyPayload();
    const master = await buildMasterWrap(masterPassword, this.vaultKey);
    const encrypted = await encryptPayload(
      this.vaultKey,
      JSON.stringify(this.payload),
    );
    this.file = {
      version: 2,
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      master,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
    };
    await saveVaultFile(JSON.stringify(this.file));
  }

  async unlockWithPassword(masterPassword: string): Promise<void> {
    const raw = await loadVaultFile();
    if (!raw) throw new Error("No vault found on this device.");

    const file = parseEncryptedFile(raw);
    const vaultKey = await unwrapVaultKey(
      masterPassword,
      fromBase64(file.master.salt),
      file.master.wrappedKeyIv,
      file.master.wrappedKey,
    );

    this.vaultKey = vaultKey;
    this.payload = await decryptPayloadFromFile(vaultKey, file);
    this.file = file;
  }

  async unlockWithMpin(mpin: string): Promise<void> {
    const raw = await loadVaultFile();
    if (!raw) throw new Error("No vault found on this device.");

    const file = parseEncryptedFile(raw);
    if (!file.mpin) throw new Error("MPIN is not set on this vault.");

    let vaultKey: Uint8Array;
    try {
      vaultKey = await unwrapVaultKey(
        mpin,
        fromBase64(file.mpin.salt),
        file.mpin.wrappedKeyIv,
        file.mpin.wrappedKey,
      );
    } catch {
      throw new Error("Incorrect MPIN.");
    }

    this.vaultKey = vaultKey;
    this.payload = await decryptPayloadFromFile(vaultKey, file);
    this.file = file;
  }

  async unlockWithVaultKey(
    vaultKey: Uint8Array,
    options?: { biometric?: boolean },
  ): Promise<void> {
    if (vaultKey.length !== VAULT_KEY_LENGTH) {
      if (options?.biometric) {
        await this.disableBiometrics();
      }
      throw new VaultDecryptError("payload", { biometric: options?.biometric });
    }

    const raw = await loadVaultFile();
    if (!raw) throw new Error("No vault found on this device.");
    const file = parseEncryptedFile(raw);

    try {
      this.vaultKey = vaultKey;
      this.payload = await decryptPayloadFromFile(vaultKey, file, options);
      this.file = file;
    } catch (e) {
      this.vaultKey = null;
      this.payload = null;
      this.file = null;
      if (options?.biometric && e instanceof VaultDecryptError) {
        await this.disableBiometrics();
      }
      throw e;
    }
  }

  lock(): void {
    if (this.vaultKey) this.vaultKey.fill(0);
    this.vaultKey = null;
    this.payload = null;
    this.file = null;
  }

  getVaultKey(): Uint8Array | null {
    return this.vaultKey;
  }

  // ============================================================
  // Biometrics
  // ============================================================
  async enableBiometrics(): Promise<void> {
    if (!this.vaultKey) throw new Error("Vault is locked.");
    await enableBiometricUnlock(this.vaultKey);
    const prefs = await loadPrefs();
    prefs.biometricsEnabled = true;
    await savePrefs(prefs);
  }

  async disableBiometrics(): Promise<void> {
    await disableBiometricUnlock();
    const prefs = await loadPrefs();
    prefs.biometricsEnabled = false;
    await savePrefs(prefs);
  }

  // ============================================================
  // MPIN
  // ============================================================
  async setMpin(mpin: string): Promise<void> {
    if (!this.vaultKey || !this.file) throw new Error("Vault is locked.");
    if (!/^\d{8}$/.test(mpin)) throw new Error("MPIN must be exactly 8 digits.");

    const wrapped = await wrapVaultKey(mpin, this.vaultKey);
    this.file = {
      ...this.file,
      mpin: {
        salt: toBase64(wrapped.salt),
        iterations: DEFAULT_KDF.iterations,
        memorySize: DEFAULT_KDF.memorySize,
        parallelism: DEFAULT_KDF.parallelism,
        hashLength: DEFAULT_KDF.hashLength,
        wrappedKey: wrapped.wrappedKey,
        wrappedKeyIv: wrapped.wrappedKeyIv,
      },
    };
    await saveVaultFile(JSON.stringify(this.file));
  }

  async removeMpin(): Promise<void> {
    if (!this.file) throw new Error("Vault is locked.");
    const { mpin: _mpin, ...rest } = this.file;
    this.file = rest as EncryptedVaultFile;
    await saveVaultFile(JSON.stringify(this.file));
  }

  // ============================================================
  // Master password change
  // ============================================================
  async changeMasterPassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!this.vaultKey || !this.payload || !this.file) {
      throw new Error("Vault is locked.");
    }
    // verify current password
    await unwrapVaultKey(
      currentPassword,
      fromBase64(this.file.master.salt),
      this.file.master.wrappedKeyIv,
      this.file.master.wrappedKey,
    );

    const master = await buildMasterWrap(newPassword, this.vaultKey);
    this.file = { ...this.file, master };
    await saveVaultFile(JSON.stringify(this.file));

    const prefs = await loadPrefs();
    if (prefs.biometricsEnabled) {
      await enableBiometricUnlock(this.vaultKey);
    }
  }

  // ============================================================
  // Entries
  // ============================================================
  addEntry(input: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">): VaultEntry {
    this.requireUnlocked();
    const timestamp = nowIso();
    const entry: VaultEntry = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.payload!.entries.unshift(entry);
    return entry;
  }

  updateEntry(
    id: string,
    input: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ): void {
    this.requireUnlocked();
    const index = this.payload!.entries.findIndex((e) => e.id === id);
    if (index === -1) throw new Error("Entry not found.");
    const existing = this.payload!.entries[index]!;
    this.payload!.entries[index] = {
      ...input,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    };
  }

  deleteEntry(id: string): void {
    this.requireUnlocked();
    this.payload!.entries = this.payload!.entries.filter((e) => e.id !== id);
  }

  // ============================================================
  // People
  // ============================================================
  addPerson(
    name: string,
    category: PersonCategoryId,
    emoji?: string,
  ): Person {
    this.requireUnlocked();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name cannot be empty.");
    const timestamp = nowIso();
    const person: Person = {
      id: crypto.randomUUID(),
      name: trimmed,
      category,
      emoji,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.payload!.people = [...this.payload!.people, person];
    return person;
  }

  updatePerson(
    id: string,
    update: { name?: string; category?: PersonCategoryId; emoji?: string },
  ): void {
    this.requireUnlocked();
    const index = this.payload!.people.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Person not found.");
    const existing = this.payload!.people[index]!;
    this.payload!.people[index] = {
      ...existing,
      ...(update.name !== undefined ? { name: update.name.trim() } : {}),
      ...(update.category !== undefined ? { category: update.category } : {}),
      ...(update.emoji !== undefined ? { emoji: update.emoji } : {}),
      updatedAt: nowIso(),
    };
  }

  deletePerson(id: string): { entriesRemoved: number } {
    this.requireUnlocked();
    this.payload!.people = this.payload!.people.filter((p) => p.id !== id);
    const before = this.payload!.entries.length;
    this.payload!.entries = this.payload!.entries.filter(
      (e) => e.personId !== id,
    );
    return { entriesRemoved: before - this.payload!.entries.length };
  }

  // ============================================================
  // Persistence
  // ============================================================
  async save(): Promise<void> {
    if (!this.vaultKey || !this.payload || !this.file) {
      throw new Error("Vault is locked.");
    }
    const encrypted = await encryptPayload(
      this.vaultKey,
      JSON.stringify(this.payload),
    );
    this.file = {
      ...this.file,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
    };
    await saveVaultFile(JSON.stringify(this.file));
  }

  async reloadUnlockedFromDisk(): Promise<void> {
    this.requireUnlocked();
    const raw = await loadVaultFile();
    if (!raw) {
      throw new Error("No vault found on this device.");
    }
    const file = parseEncryptedFile(raw);
    const payload = await decryptPayloadFromFile(this.vaultKey!, file);
    this.file = file;
    this.payload = payload;
  }

  async replaceUnlockedFromRaw(fileContent: string): Promise<void> {
    this.requireUnlocked();
    const incoming = parseEncryptedFile(fileContent);
    const payload = await decryptPayloadFromFile(this.vaultKey!, incoming);
    this.file = incoming;
    this.payload = payload;
    await saveVaultFile(fileContent);
  }

  // ============================================================
  // Backup export / import
  // ============================================================
  async exportVault(): Promise<string> {
    const raw = await loadVaultFile();
    if (!raw) throw new Error("No vault to export.");
    return raw;
  }

  async importVault(
    fileContent: string,
    masterPassword: string,
    mode: ImportMode,
  ): Promise<void> {
    const incoming = parseEncryptedFile(fileContent);
    const vaultKey = await unwrapVaultKey(
      masterPassword,
      fromBase64(incoming.master.salt),
      incoming.master.wrappedKeyIv,
      incoming.master.wrappedKey,
    );
    const incomingPayload = await decryptPayloadFromFile(vaultKey, incoming);

    if (mode === "replace" || !this.payload) {
      this.vaultKey = vaultKey;
      this.payload = incomingPayload;
      this.file = incoming;
      await saveVaultFile(fileContent);
      return;
    }

    this.requireUnlocked();
    // Merge people by id (incoming wins for duplicates).
    const peopleMap = new Map<string, Person>();
    for (const p of this.payload.people) peopleMap.set(p.id, p);
    for (const p of incomingPayload.people) peopleMap.set(p.id, p);
    this.payload.people = [...peopleMap.values()];

    const entryMap = new Map<string, VaultEntry>();
    for (const entry of this.payload.entries) entryMap.set(entry.id, entry);
    for (const entry of incomingPayload.entries) entryMap.set(entry.id, entry);
    this.payload.entries = [...entryMap.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    await this.save();
  }

  /**
   * Append a batch of entries (e.g. from Chrome CSV import) under a chosen person.
   */
  async importEntriesBulk(
    personId: string,
    entries: Omit<VaultEntry, "id" | "createdAt" | "updatedAt" | "personId">[],
  ): Promise<number> {
    this.requireUnlocked();
    const timestamp = nowIso();
    for (const entry of entries) {
      this.payload!.entries.unshift({
        ...entry,
        personId,
        id: crypto.randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    await this.save();
    return entries.length;
  }

  private requireUnlocked(): void {
    if (!this.payload || !this.vaultKey) {
      throw new Error("Vault is locked.");
    }
  }
}
