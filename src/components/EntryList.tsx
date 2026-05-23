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
}: EntryListProps) {
  const [page, setPage] = useState(1);
  const normalized = query.trim().toLowerCase();

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
          return (
            <li key={entry.id} style={columns ? { marginBottom: 0 } : undefined}>
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
                  <strong>{entryDisplayTitle(e, people)}</strong>
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
