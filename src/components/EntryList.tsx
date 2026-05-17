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

interface EntryListProps {
  entries: VaultEntry[];
  people: Person[];
  query: string;
  categoryFilter: string | null;
  personFilter: string | null;
  selectedId: string | null;
  onSelect: (entry: VaultEntry) => void;
}

export function EntryList({
  entries,
  people,
  query,
  categoryFilter,
  personFilter,
  selectedId,
  onSelect,
}: EntryListProps) {
  const normalized = query.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    const e = normalizeEntry(entry);
    if (categoryFilter && e.categoryId !== categoryFilter) return false;
    if (personFilter && e.personId !== personFilter) return false;
    if (!normalized) return true;
    return entrySearchText(e, people).includes(normalized);
  });

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
    <ul className="entry-list">
      {filtered.map((entry) => {
        const e = normalizeEntry(entry);
        const person = findPerson(people, e);
        return (
          <li key={entry.id}>
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
  );
}
