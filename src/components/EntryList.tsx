import { useEffect, useMemo, useState } from "react";
import {
  entryDisplayTitle,
  entrySearchText,
  entrySubtitle,
  findPerson,
  normalizeEntry,
} from "@/shared/entryUtils";
import { colorForId } from "@/shared/people";
import type { Person, VaultEntry } from "@/shared/types";
import { PersonAvatar, ServiceIcon } from "./ServiceIcon";

const PAGE_SIZE = 12;

interface EntryListProps {
  entries: VaultEntry[];
  people: Person[];
  query: string;
  categoryFilter: string | null;
  personFilter: string | null;
  selectedId: string | null;
  onSelect: (entry: VaultEntry) => void;
  columns?: number;
  deletingId?: string | null;
}

export function EntryList({
  entries,
  people,
  query,
  categoryFilter,
  personFilter,
  selectedId,
  onSelect,
  columns,
  deletingId,
}: EntryListProps) {
  const [page, setPage] = useState(1);
  const normalized = query.trim().toLowerCase();

  const passwordCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      const p = entry.password;
      if (p) {
        counts[p] = (counts[p] ?? 0) + 1;
      }
    }
    return counts;
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      const e = normalizeEntry(entry);
      if (categoryFilter && e.categoryId !== categoryFilter) return false;
      if (personFilter && e.personId !== personFilter) return false;
      if (!normalized) return true;
      return entrySearchText(e, people).includes(normalized);
    });
  }, [entries, people, categoryFilter, personFilter, normalized]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [query, categoryFilter, personFilter, entries.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  if (filtered.length === 0) {
    return (
      <p className="muted empty-state">
        {entries.length === 0
          ? "No passwords yet. Tap + to add one."
          : "No matches."}
      </p>
    );
  }

  return (
    <>
      <ul 
        className="entry-list" 
        style={columns ? { 
          display: "grid", 
          gridTemplateColumns: `repeat(${columns}, 1fr)`, 
          gap: "10px",
          alignContent: "start"
        } : undefined}
      >
        {pageItems.map((entry) => {
          const e = normalizeEntry(entry);
          const person = findPerson(people, e);
          const isDuplicate = entry.password && passwordCounts[entry.password] > 1;
          return (
            <li
              key={entry.id}
              className={deletingId === entry.id ? "is-deleting" : ""}
              style={columns ? { marginBottom: 0 } : undefined}
            >
              <button
                type="button"
                className={`entry-card${selectedId === entry.id ? " active" : ""}`}
                onClick={() => onSelect(entry)}
              >
                <ServiceIcon
                  categoryId={e.categoryId}
                  subcategoryId={e.subcategoryId}
                  size="md"
                />
                <div className="entry-card-text">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <strong>{entryDisplayTitle(e, people)}</strong>
                    {isDuplicate && (
                      <span className="warning-icon" title="Duplicate password used elsewhere">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                          <line x1="12" y1="9" x2="12" y2="13"></line>
                          <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                      </span>
                    )}
                  </div>
                  <span className="muted">{entrySubtitle(e)}</span>
                </div>
                {person && (
                  <PersonAvatar
                    name={person.name}
                    emoji={person.emoji}
                    color={colorForId(person.id)}
                    size="sm"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {totalPages > 1 && (
        <nav className="vault-pagination" aria-label="Vault pages">
          <button
            type="button"
            className="ghost small"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="vault-pagination-meta">
            Page {page} of {totalPages}
            <span className="muted">
              {" "}
              ({filtered.length} entries)
            </span>
          </span>
          <button
            type="button"
            className="ghost small"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}
