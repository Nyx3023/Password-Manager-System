import type {
  DeletedEntryTombstone,
  DeletedPersonTombstone,
  Person,
  TrashEntry,
  VaultEntry,
  VaultPayload,
} from "./types";

function pickNewerPerson(a: Person, b: Person): Person {
  return a.updatedAt >= b.updatedAt ? a : b;
}

function pickNewerEntry(a: VaultEntry, b: VaultEntry): VaultEntry {
  return a.updatedAt >= b.updatedAt ? a : b;
}

function pickNewerTrash(a: TrashEntry, b: TrashEntry): TrashEntry {
  return a.trashedAt >= b.trashedAt ? a : b;
}

/**
 * Merge vault payloads with tombstone-aware deletion resolution.
 * - If an entry has a tombstone with deletedAt >= entry.updatedAt, it remains deleted.
 * - If a trash entry has a tombstone with deletedAt > trash.trashedAt, it was permanently purged.
 * - If a person has a tombstone with deletedAt >= person.updatedAt, it remains deleted.
 */
export function mergeVaultPayloads(
  local: VaultPayload,
  incoming: VaultPayload,
): VaultPayload {
  // 1. Merge person tombstones (deletedPeople)
  const personTombstoneMap = new Map<string, string>();
  for (const t of local.deletedPeople || []) {
    personTombstoneMap.set(t.id, t.deletedAt);
  }
  for (const t of incoming.deletedPeople || []) {
    const existing = personTombstoneMap.get(t.id);
    if (!existing || t.deletedAt > existing) {
      personTombstoneMap.set(t.id, t.deletedAt);
    }
  }

  // Merge people with tombstone filtering
  const peopleMap = new Map<string, Person>();
  const considerPerson = (p: Person) => {
    const deletedAt = personTombstoneMap.get(p.id);
    if (deletedAt && deletedAt >= p.updatedAt) {
      return;
    }
    if (deletedAt && p.updatedAt > deletedAt) {
      personTombstoneMap.delete(p.id);
    }
    const prev = peopleMap.get(p.id);
    peopleMap.set(p.id, prev ? pickNewerPerson(prev, p) : p);
  };

  for (const p of local.people) considerPerson(p);
  for (const p of incoming.people) considerPerson(p);

  // 2. Merge entry tombstones (deletedEntries)
  const tombstoneMap = new Map<string, string>(); // id -> deletedAt
  for (const t of local.deletedEntries || []) {
    tombstoneMap.set(t.id, t.deletedAt);
  }
  for (const t of incoming.deletedEntries || []) {
    const existing = tombstoneMap.get(t.id);
    if (!existing || t.deletedAt > existing) {
      tombstoneMap.set(t.id, t.deletedAt);
    }
  }

  // 3. Merge entries with tombstone filtering
  const entryMap = new Map<string, VaultEntry>();

  const considerEntry = (e: VaultEntry) => {
    const deletedAt = tombstoneMap.get(e.id);
    // If tombstone is equal or newer than entry update, entry is deleted!
    if (deletedAt && deletedAt >= e.updatedAt) {
      return;
    }
    // If entry is newer than tombstone, the entry wins (e.g. re-created or updated after deletion)
    if (deletedAt && e.updatedAt > deletedAt) {
      tombstoneMap.delete(e.id);
    }

    const prev = entryMap.get(e.id);
    entryMap.set(e.id, prev ? pickNewerEntry(prev, e) : e);
  };

  for (const e of local.entries) considerEntry(e);
  for (const e of incoming.entries) considerEntry(e);

  // 4. Merge trash entries with purge filtering
  const trashMap = new Map<string, TrashEntry>();
  const considerTrash = (t: TrashEntry) => {
    if (entryMap.has(t.id)) return;
    const deletedAt = tombstoneMap.get(t.id);
    // If tombstone timestamp is strictly newer than when it was trashed,
    // it was permanently purged after being trashed.
    if (deletedAt && deletedAt > t.trashedAt) {
      return;
    }
    const prev = trashMap.get(t.id);
    trashMap.set(t.id, prev ? pickNewerTrash(prev, t) : t);
  };

  for (const t of local.trashEntries || []) considerTrash(t);
  for (const t of incoming.trashEntries || []) considerTrash(t);

  const mergedTombstones: DeletedEntryTombstone[] = [...tombstoneMap.entries()].map(
    ([id, deletedAt]) => ({ id, deletedAt }),
  );

  const mergedPersonTombstones: DeletedPersonTombstone[] = [
    ...personTombstoneMap.entries(),
  ].map(([id, deletedAt]) => ({ id, deletedAt }));

  return {
    version: 2,
    vaultId: local.vaultId || incoming.vaultId,
    people: [...peopleMap.values()],
    entries: [...entryMap.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
    deletedEntries: mergedTombstones,
    deletedPeople: mergedPersonTombstones,
    trashEntries: [...trashMap.values()].sort((a, b) =>
      b.trashedAt.localeCompare(a.trashedAt),
    ),
  };
}
