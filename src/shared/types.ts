export type PersonCategoryId =
  | "self"
  | "family"
  | "friend"
  | "work"
  | "other";

export interface Person {
  id: string;
  name: string;
  category: PersonCategoryId;
  /** Optional emoji avatar (e.g. "👩"). Falls back to initial. */
  emoji?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
  type?: "text" | "hidden";
}

export interface PasswordHistoryItem {
  password: string;
  changedAt: string;
}

export interface DeletedEntryTombstone {
  id: string;
  deletedAt: string;
}

export interface DeletedPersonTombstone {
  id: string;
  deletedAt: string;
}

export interface TrashEntry extends VaultEntry {
  trashedAt: string;
}

export interface VaultEntry {
  id: string;
  /** Auto-generated label (e.g. "Instagram — Mom"). Optional override allowed. */
  title: string;
  /** Reference to Person.id. Legacy entries may have empty string. */
  personId: string;
  /** Legacy / migration field — used if personId is empty. */
  personName?: string;
  categoryId: string;
  subcategoryId: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  totpSeed?: string;
  customFields?: CustomField[];
  passwordHistory?: PasswordHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultPayload {
  version: 2;
  vaultId?: string;
  ownerUid?: string;
  ownerEmail?: string;
  people: Person[];
  entries: VaultEntry[];
  deletedEntries?: DeletedEntryTombstone[];
  deletedPeople?: DeletedPersonTombstone[];
  trashEntries?: TrashEntry[];
}

/** Wrapping data for one unlock method (master password or MPIN). */
export interface KeyWrap {
  salt: string;
  iterations: number;
  memorySize: number;
  parallelism: number;
  hashLength: number;
  wrappedKey: string;
  wrappedKeyIv: string;
}

/** On-disk encrypted vault (safe to export/import as-is). */
export interface EncryptedVaultFile {
  version: 2;
  vaultId?: string;
  ownerUid?: string;
  ownerEmail?: string;
  kdf: "argon2id";
  cipher: "aes-256-gcm";
  /** Master password wrap (always present). */
  master: KeyWrap;
  iv: string;
  ciphertext: string;
}

export type ImportMode = "replace" | "merge";
