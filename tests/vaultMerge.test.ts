import { describe, it, expect } from "vitest";
import { mergeVaultPayloads } from "../src/shared/vaultMerge";
import type { VaultPayload, VaultEntry, TrashEntry } from "../src/shared/types";

describe("vaultMerge module", () => {
  const baseEntry1: VaultEntry = {
    id: "entry-1",
    title: "GitHub",
    username: "dev1",
    password: "old-password",
    category: "login",
    personId: "p1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const baseEntry2: VaultEntry = {
    id: "entry-2",
    title: "Google",
    username: "user@gmail.com",
    password: "g-pass",
    category: "login",
    personId: "p1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("should preserve vaultId and merge newer entries", () => {
    const local: VaultPayload = {
      version: 2,
      vaultId: "vault-abc-123",
      people: [{ id: "p1", name: "Alice", category: "personal", createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
      entries: [baseEntry1],
    };

    const updatedEntry1: VaultEntry = {
      ...baseEntry1,
      password: "new-shiny-password",
      updatedAt: "2026-01-02T10:00:00.000Z",
    };

    const remote: VaultPayload = {
      version: 2,
      vaultId: "vault-abc-123",
      people: [{ id: "p1", name: "Alice", category: "personal", createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
      entries: [updatedEntry1, baseEntry2],
    };

    const merged = mergeVaultPayloads(local, remote);
    expect(merged.vaultId).toBe("vault-abc-123");
    expect(merged.entries).toHaveLength(2);

    const mergedE1 = merged.entries.find((e) => e.id === "entry-1");
    expect(mergedE1?.password).toBe("new-shiny-password");
  });

  it("should prevent deleted entries from resurrecting when remote is stale (tombstones)", () => {
    // Local deleted entry-1 at 2026-01-05
    const local: VaultPayload = {
      version: 2,
      vaultId: "vault-abc-123",
      people: [],
      entries: [],
      deletedEntries: [{ id: "entry-1", deletedAt: "2026-01-05T12:00:00.000Z" }],
    };

    // Remote still has entry-1 updated at 2026-01-02
    const remote: VaultPayload = {
      version: 2,
      vaultId: "vault-abc-123",
      people: [],
      entries: [
        {
          ...baseEntry1,
          updatedAt: "2026-01-02T10:00:00.000Z",
        },
      ],
      deletedEntries: [],
    };

    const merged = mergeVaultPayloads(local, remote);
    // entry-1 must NOT resurrect!
    expect(merged.entries).toHaveLength(0);
    expect(merged.deletedEntries).toHaveLength(1);
    expect(merged.deletedEntries?.[0].id).toBe("entry-1");
  });

  it("should resurrect entry if modified or re-created after tombstone timestamp", () => {
    const local: VaultPayload = {
      version: 2,
      vaultId: "vault-abc-123",
      people: [],
      entries: [],
      deletedEntries: [{ id: "entry-1", deletedAt: "2026-01-05T12:00:00.000Z" }],
    };

    // Remote edited entry-1 at 2026-01-06 (after local deletion)
    const remote: VaultPayload = {
      version: 2,
      vaultId: "vault-abc-123",
      people: [],
      entries: [
        {
          ...baseEntry1,
          password: "edited-after-delete",
          updatedAt: "2026-01-06T00:00:00.000Z",
        },
      ],
      deletedEntries: [],
    };

    const merged = mergeVaultPayloads(local, remote);
    expect(merged.entries).toHaveLength(1);
    expect(merged.entries[0].password).toBe("edited-after-delete");
    // Tombstone should be removed since entry is newer
    expect(merged.deletedEntries?.find((t) => t.id === "entry-1")).toBeUndefined();
  });

  it("should merge trash entries correctly without duplicating active entries", () => {
    const trash1: TrashEntry = {
      ...baseEntry1,
      trashedAt: "2026-01-05T12:00:00.000Z",
    };

    const local: VaultPayload = {
      version: 2,
      vaultId: "v1",
      people: [],
      entries: [],
      trashEntries: [trash1],
    };

    const remote: VaultPayload = {
      version: 2,
      vaultId: "v1",
      people: [],
      entries: [baseEntry2],
      trashEntries: [],
    };

    const merged = mergeVaultPayloads(local, remote);
    expect(merged.entries).toHaveLength(1);
    expect(merged.entries[0].id).toBe("entry-2");
    expect(merged.trashEntries).toHaveLength(1);
    expect(merged.trashEntries?.[0].id).toBe("entry-1");
  });

  it("should preserve tombstones through normalizePayload", async () => {
    const { normalizePayload } = await import("../src/shared/entryUtils");
    const payload: VaultPayload = {
      version: 2,
      vaultId: "v-test",
      people: [{ id: "p1", name: "Alice", category: "self", createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
      entries: [baseEntry1],
      deletedEntries: [{ id: "entry-deleted-1", deletedAt: "2026-01-05T12:00:00.000Z" }],
      deletedPeople: [{ id: "p-deleted-1", deletedAt: "2026-01-05T12:00:00.000Z" }],
      trashEntries: [{ ...baseEntry2, trashedAt: "2026-01-05T12:00:00.000Z" }],
    };

    const normalized = normalizePayload(payload);
    expect(normalized.vaultId).toBe("v-test");
    expect(normalized.deletedEntries).toHaveLength(1);
    expect(normalized.deletedEntries?.[0].id).toBe("entry-deleted-1");
    expect(normalized.deletedPeople).toHaveLength(1);
    expect(normalized.deletedPeople?.[0].id).toBe("p-deleted-1");
    expect(normalized.trashEntries).toHaveLength(1);
    expect(normalized.trashEntries?.[0].id).toBe("entry-2");
  });

  it("should prevent deleted person from resurrecting with deletedPeople tombstones", () => {
    const local: VaultPayload = {
      version: 2,
      vaultId: "v1",
      people: [],
      deletedPeople: [{ id: "p1", deletedAt: "2026-01-05T12:00:00.000Z" }],
      entries: [],
    };

    const remote: VaultPayload = {
      version: 2,
      vaultId: "v1",
      people: [{ id: "p1", name: "Alice", category: "self", createdAt: "2026-01-01", updatedAt: "2026-01-02" }],
      entries: [],
    };

    const merged = mergeVaultPayloads(local, remote);
    expect(merged.people).toHaveLength(0);
    expect(merged.deletedPeople).toHaveLength(1);
    expect(merged.deletedPeople?.[0].id).toBe("p1");
  });

  it("should remove purged trash when tombstone deletedAt is newer than trashedAt", () => {
    const local: VaultPayload = {
      version: 2,
      vaultId: "v1",
      people: [],
      entries: [],
      // Purged at 2026-01-06 (newer than trashedAt 2026-01-05)
      deletedEntries: [{ id: "entry-1", deletedAt: "2026-01-06T12:00:00.000Z" }],
      trashEntries: [],
    };

    const remote: VaultPayload = {
      version: 2,
      vaultId: "v1",
      people: [],
      entries: [],
      trashEntries: [
        {
          ...baseEntry1,
          trashedAt: "2026-01-05T12:00:00.000Z",
        },
      ],
    };

    const merged = mergeVaultPayloads(local, remote);
    expect(merged.trashEntries).toHaveLength(0);
  });
});
