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
import { mergeVaultPayloads } from "./vaultMerge";
import {
  deleteMpinWrap,
  hasMpinOnDevice,
  loadMpinWrap,
  MPIN_KDF,
  saveMpinWrap,
} from "./mpinStore";
import { UnlockRateLimiter } from "./rateLimiter";
import type {
  EncryptedVaultFile,
  ImportMode,
  KeyWrap,
  Person,
  PersonCategoryId,
  TrashEntry,
  VaultEntry,
  VaultPayload,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function emptyPayload(): VaultPayload {
  return {
    version: 2,
    vaultId: crypto.randomUUID(),
    people: [],
    entries: [],
    deletedEntries: [],
    deletedPeople: [],
    trashEntries: [],
  };
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
    // Strip legacy mpin field if present (migrated to device-local storage).
    const { mpin: _mpin, ...rest } = obj as Record<string, unknown>;
    const file = rest as unknown as EncryptedVaultFile;
    if (typeof obj.vaultId === "string") {
      file.vaultId = obj.vaultId;
    }
    if (typeof obj.ownerUid === "string") {
      file.ownerUid = obj.ownerUid;
    }
    if (typeof obj.ownerEmail === "string") {
      file.ownerEmail = obj.ownerEmail;
    }
    return file;
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
    if (file.ownerUid && !payload.ownerUid) {
      payload.ownerUid = file.ownerUid;
    }
    if (file.ownerEmail && !payload.ownerEmail) {
      payload.ownerEmail = file.ownerEmail;
    }
    return normalizePayload(payload);
  } catch {
    throw new VaultDecryptError("json", { biometric: options?.biometric });
  }
}

export class VaultService {
  private payload: VaultPayload | null = null;
  private vaultKey: Uint8Array | null = null;
  private file: EncryptedVaultFile | null = null;
  private rateLimiter = new UnlockRateLimiter();

  get isUnlocked(): boolean {
    return this.payload !== null && this.vaultKey !== null;
  }

  get vaultId(): string | undefined {
    return this.payload?.vaultId || this.file?.vaultId;
  }

  get ownerUid(): string | undefined {
    return this.payload?.ownerUid || this.file?.ownerUid;
  }

  get ownerEmail(): string | undefined {
    return this.payload?.ownerEmail || this.file?.ownerEmail;
  }

  setOwner(ownerUid: string, ownerEmail?: string): void {
    if (this.payload) {
      this.payload.ownerUid = ownerUid;
      this.payload.ownerEmail = ownerEmail;
    }
    if (this.file) {
      this.file.ownerUid = ownerUid;
      this.file.ownerEmail = ownerEmail;
    }
  }

  get entries(): VaultEntry[] {
    return this.payload?.entries ?? [];
  }

  get trashEntries(): TrashEntry[] {
    return this.payload?.trashEntries ?? [];
  }

  get people(): Person[] {
    return this.payload?.people ?? [];
  }

  async exists(): Promise<boolean> {
    return (await loadVaultFile()) !== null;
  }

  async getPrefs() {
    return loadPrefs();
  }

  /** Check whether this device has an MPIN configured. */
  async hasMpinOnDisk(): Promise<boolean> {
    return hasMpinOnDevice();
  }

  async createVault(
    masterPassword: string,
    owner?: { uid: string; email?: string },
  ): Promise<void> {
    const vId = crypto.randomUUID();
    this.vaultKey = generateVaultKey();
    this.payload = {
      ...emptyPayload(),
      vaultId: vId,
      ownerUid: owner?.uid,
      ownerEmail: owner?.email,
    };
    const master = await buildMasterWrap(masterPassword, this.vaultKey);
    const encrypted = await encryptPayload(
      this.vaultKey,
      JSON.stringify(this.payload),
    );
    this.file = {
      version: 2,
      vaultId: vId,
      ownerUid: owner?.uid,
      ownerEmail: owner?.email,
      kdf: "argon2id",
      cipher: "aes-256-gcm",
      master,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
    };
    await saveVaultFile(JSON.stringify(this.file));
  }

  async unlockWithPassword(masterPassword: string): Promise<void> {
    // Rate-limit check.
    const check = await this.rateLimiter.checkAllowed("master");
    if (!check.allowed) {
      throw new Error(
        `Too many failed attempts. Try again in ${check.waitSeconds} seconds.`,
      );
    }

    const raw = await loadVaultFile();
    if (!raw) throw new Error("No vault found on this device.");

    const file = parseEncryptedFile(raw);
    let vaultKey: Uint8Array;
    try {
      vaultKey = await unwrapVaultKey(
        masterPassword,
        fromBase64(file.master.salt),
        file.master.wrappedKeyIv,
        file.master.wrappedKey,
      );
    } catch {
      await this.rateLimiter.recordFailure("master");
      throw new Error("Incorrect master password.");
    }

    this.vaultKey = vaultKey;
    this.payload = await decryptPayloadFromFile(vaultKey, file);
    this.file = file;
    await this.rateLimiter.recordSuccess("master");
  }

  async unlockWithMpin(mpin: string): Promise<void> {
    // Rate-limit check.
    const check = await this.rateLimiter.checkAllowed("mpin");
    if (!check.allowed) {
      if (check.mpinWiped) {
        throw new Error(
          "MPIN disabled after too many failed attempts. Use your master password, then set a new MPIN in Settings.",
        );
      }
      throw new Error(
        `Too many failed attempts. Try again in ${check.waitSeconds} seconds.`,
      );
    }

    // Load MPIN wrap from device-local storage (not from vault file).
    const mpinWrap = await loadMpinWrap();
    if (!mpinWrap) throw new Error("MPIN is not set on this device.");

    const raw = await loadVaultFile();
    if (!raw) throw new Error("No vault found on this device.");
    const file = parseEncryptedFile(raw);

    let vaultKey: Uint8Array;
    try {
      vaultKey = await unwrapVaultKey(
        mpin,
        fromBase64(mpinWrap.salt),
        mpinWrap.wrappedKeyIv,
        mpinWrap.wrappedKey,
      );
    } catch {
      const wiped = await this.rateLimiter.recordFailure("mpin");
      if (wiped) {
        throw new Error(
          "MPIN disabled after too many failed attempts. Use your master password, then set a new MPIN in Settings.",
        );
      }
      throw new Error("Incorrect MPIN.");
    }

    this.vaultKey = vaultKey;
    this.payload = await decryptPayloadFromFile(vaultKey, file);
    this.file = file;
    await this.rateLimiter.recordSuccess("mpin");
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
    if (this.payload) {
      for (const e of this.payload.entries) {
        e.password = "";
        e.notes = "";
        if (e.totpSeed) e.totpSeed = "";
      }
      for (const t of this.payload.trashEntries || []) {
        t.password = "";
        t.notes = "";
        if (t.totpSeed) t.totpSeed = "";
      }
      this.payload = null;
    }
    this.file = null;
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
  // MPIN (device-local storage)
  // ============================================================
  async setMpin(mpin: string): Promise<void> {
    if (!this.vaultKey || !this.file) throw new Error("Vault is locked.");
    if (!/^\d{8}$/.test(mpin)) throw new Error("MPIN must be exactly 8 digits.");

    // Use stronger KDF parameters for MPIN.
    const wrapped = await wrapVaultKey(mpin, this.vaultKey);
    await saveMpinWrap({
      salt: toBase64(wrapped.salt),
      iterations: MPIN_KDF.iterations,
      memorySize: MPIN_KDF.memorySize,
      parallelism: MPIN_KDF.parallelism,
      hashLength: MPIN_KDF.hashLength,
      wrappedKey: wrapped.wrappedKey,
      wrappedKeyIv: wrapped.wrappedKeyIv,
    });
  }

  async removeMpin(): Promise<void> {
    await deleteMpinWrap();
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

    let passwordHistory = existing.passwordHistory ? [...existing.passwordHistory] : [];
    if (input.password && existing.password && input.password !== existing.password) {
      passwordHistory.unshift({
        password: existing.password,
        changedAt: nowIso(),
      });
      if (passwordHistory.length > 10) {
        passwordHistory = passwordHistory.slice(0, 10);
      }
    }

    this.payload!.entries[index] = {
      ...input,
      id,
      passwordHistory: input.passwordHistory || passwordHistory,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    };
  }

  deleteEntry(id: string): void {
    this.requireUnlocked();
    const index = this.payload!.entries.findIndex((e) => e.id === id);
    if (index === -1) return;
    const removed = this.payload!.entries.splice(index, 1)[0]!;
    const timestamp = nowIso();

    if (!this.payload!.trashEntries) this.payload!.trashEntries = [];
    this.payload!.trashEntries.unshift({
      ...removed,
      trashedAt: timestamp,
    });

    if (!this.payload!.deletedEntries) this.payload!.deletedEntries = [];
    this.payload!.deletedEntries.push({
      id,
      deletedAt: timestamp,
    });
  }

  restoreTrashEntry(id: string): VaultEntry {
    this.requireUnlocked();
    if (!this.payload!.trashEntries) throw new Error("Trash is empty.");
    const index = this.payload!.trashEntries.findIndex((e) => e.id === id);
    if (index === -1) throw new Error("Item not found in trash.");
    const item = this.payload!.trashEntries.splice(index, 1)[0]!;
    const { trashedAt: _trashedAt, ...cleanEntry } = item;
    cleanEntry.updatedAt = nowIso();
    this.payload!.entries.unshift(cleanEntry);

    if (this.payload!.deletedEntries) {
      this.payload!.deletedEntries = this.payload!.deletedEntries.filter((t) => t.id !== id);
    }
    return cleanEntry;
  }

  purgeTrashEntry(id: string): void {
    this.requireUnlocked();
    if (!this.payload!.trashEntries) return;
    this.payload!.trashEntries = this.payload!.trashEntries.filter((e) => e.id !== id);
    const timestamp = nowIso();
    if (!this.payload!.deletedEntries) this.payload!.deletedEntries = [];
    const existing = this.payload!.deletedEntries.find((t) => t.id === id);
    if (existing) {
      existing.deletedAt = timestamp;
    } else {
      this.payload!.deletedEntries.push({ id, deletedAt: timestamp });
    }
  }

  emptyTrash(): void {
    this.requireUnlocked();
    const timestamp = nowIso();
    if (!this.payload!.deletedEntries) this.payload!.deletedEntries = [];
    for (const item of this.payload!.trashEntries || []) {
      const existing = this.payload!.deletedEntries.find((t) => t.id === item.id);
      if (existing) {
        existing.deletedAt = timestamp;
      } else {
        this.payload!.deletedEntries.push({ id: item.id, deletedAt: timestamp });
      }
    }
    this.payload!.trashEntries = [];
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
    const timestamp = nowIso();
    this.payload!.people = this.payload!.people.filter((p) => p.id !== id);
    if (!this.payload!.deletedPeople) this.payload!.deletedPeople = [];
    this.payload!.deletedPeople.push({ id, deletedAt: timestamp });

    const before = this.payload!.entries.length;
    const removedEntries = this.payload!.entries.filter((e) => e.personId === id);
    if (!this.payload!.deletedEntries) this.payload!.deletedEntries = [];
    for (const e of removedEntries) {
      this.payload!.deletedEntries.push({ id: e.id, deletedAt: timestamp });
    }
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
    if (!this.payload.vaultId) {
      this.payload.vaultId = this.file.vaultId || crypto.randomUUID();
    }
    const encrypted = await encryptPayload(
      this.vaultKey,
      JSON.stringify(this.payload),
    );
    this.file = {
      ...this.file,
      vaultId: this.payload.vaultId,
      ownerUid: this.payload.ownerUid || this.file.ownerUid,
      ownerEmail: this.payload.ownerEmail || this.file.ownerEmail,
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

  async mergeUnlockedFromRaw(fileContent: string): Promise<void> {
    this.requireUnlocked();
    const incoming = parseEncryptedFile(fileContent);
    const incomingPayload = await decryptPayloadFromFile(this.vaultKey!, incoming);
    this.payload = mergeVaultPayloads(this.payload!, incomingPayload);
    if (!this.payload.ownerUid && incoming.ownerUid) {
      this.payload.ownerUid = incoming.ownerUid;
      this.payload.ownerEmail = incoming.ownerEmail;
    }
    await this.save();
  }

  /** Load encrypted vault from disk and merge into the unlocked session. */
  async mergeFromDiskAfterSync(): Promise<void> {
    this.requireUnlocked();
    const raw = await loadVaultFile();
    if (!raw) {
      throw new Error("No vault found on this device.");
    }
    await this.mergeUnlockedFromRaw(raw);
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
      if (incoming.ownerUid && !this.payload.ownerUid) {
        this.payload.ownerUid = incoming.ownerUid;
        this.payload.ownerEmail = incoming.ownerEmail;
      }
      this.file = incoming;
      await saveVaultFile(fileContent);
      await deleteMpinWrap();
      await this.disableBiometrics();
      return;
    }

    this.requireUnlocked();
    this.payload = mergeVaultPayloads(this.payload, incomingPayload);
    if (!this.payload.ownerUid && incoming.ownerUid) {
      this.payload.ownerUid = incoming.ownerUid;
      this.payload.ownerEmail = incoming.ownerEmail;
    }
    await this.save();
  }

  async verifyVaultBackup(fileContent: string, masterPassword: string): Promise<void> {
    const incoming = parseEncryptedFile(fileContent);
    const vaultKey = await unwrapVaultKey(
      masterPassword,
      fromBase64(incoming.master.salt),
      incoming.master.wrappedKeyIv,
      incoming.master.wrappedKey,
    );
    await decryptPayloadFromFile(vaultKey, incoming);
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

  /**
   * Import 2FA/TOTP authenticator accounts (e.g. Google Authenticator, Aegis, 2FAS).
   * Matches existing entries by name/service or creates new entries.
   */
  async importTotpAccounts(
    accounts: { name: string; issuer?: string; secret: string; digits?: number; period?: number }[],
    personId: string,
  ): Promise<number> {
    this.requireUnlocked();
    const timestamp = nowIso();
    let count = 0;

    for (const acc of accounts) {
      if (!acc.secret) continue;
      const targetName = (acc.issuer || acc.name).toLowerCase();
      const existing = this.payload!.entries.find(
        (e) =>
          (e.title && e.title.toLowerCase().includes(targetName)) ||
          (e.url && e.url.toLowerCase().includes(targetName)),
      );

      if (existing && !existing.totpSeed) {
        existing.totpSeed = acc.secret;
        existing.updatedAt = timestamp;
        count++;
      } else {
        const newEntry: VaultEntry = {
          id: crypto.randomUUID(),
          title: acc.issuer ? `${acc.issuer} (${acc.name})` : acc.name,
          personId,
          categoryId: "other",
          subcategoryId: "other",
          username: acc.name.includes("@") ? acc.name : "",
          password: "",
          url: "",
          notes: "Imported 2FA authenticator account",
          totpSeed: acc.secret,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        this.payload!.entries.unshift(newEntry);
        count++;
      }
    }

    if (count > 0) {
      await this.save();
    }
    return count;
  }

  private requireUnlocked(): void {
    if (!this.payload || !this.vaultKey) {
      throw new Error("Vault is locked.");
    }
  }
}
