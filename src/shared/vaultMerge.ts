import type { Person, VaultEntry, VaultPayload } from "./types";

function pickNewerPerson(a: Person, b: Person): Person {
  return a.updatedAt >= b.updatedAt ? a : b;
}

function pickNewerEntry(a: VaultEntry, b: VaultEntry): VaultEntry {
  return a.updatedAt >= b.updatedAt ? a : b;
}

/** Merge vault payloads; for duplicate ids the newer `updatedAt` wins. */
export function mergeVaultPayloads(
  local: VaultPayload,
  incoming: VaultPayload,
): VaultPayload {
  const peopleMap = new Map<string, Person>();
  for (const p of local.people) peopleMap.set(p.id, p);
  for (const p of incoming.people) {
    const prev = peopleMap.get(p.id);
    peopleMap.set(p.id, prev ? pickNewerPerson(prev, p) : p);
  }

  const entryMap = new Map<string, VaultEntry>();
  for (const e of local.entries) entryMap.set(e.id, e);
  for (const e of incoming.entries) {
    const prev = entryMap.get(e.id);
    entryMap.set(e.id, prev ? pickNewerEntry(prev, e) : e);
  }

  return {
    version: 2,
    people: [...peopleMap.values()],
    entries: [...entryMap.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
  };
}
