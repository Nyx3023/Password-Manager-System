import { useMemo, useState } from "react";
import { entryDisplayTitle, normalizeEntry } from "@/shared/entryUtils";
import { CategoryFilter } from "@/components/CategoryFilter";
import { EntryDetailPane } from "@/components/EntryDetailPane";
import { EntryForm } from "@/components/EntryForm";
import { EntryList } from "@/components/EntryList";
import { Modal } from "@/components/Modal";
import { PersonAvatar } from "@/components/ServiceIcon";
import { AddEntryWizard } from "@/components/wizard/AddEntryWizard";
import { colorForId } from "@/shared/people";
import type { Person, PersonCategoryId, VaultEntry } from "@/shared/types";

export interface DesktopVaultViewProps {
  entries: VaultEntry[];
  people: Person[];
  adding: boolean;
  onAddingChange: (open: boolean) => void;
  onAdd: (
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onUpdate: (
    id: string,
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCopy: (label: string, value: string) => void;
  onAddPerson: (
    name: string,
    category: PersonCategoryId,
    emoji?: string,
  ) => Promise<Person | null>;
  onMessage: (message: string) => void;
}

export function DesktopVaultView(props: DesktopVaultViewProps) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<VaultEntry | null>(null);
  const [editing, setEditing] = useState(false);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of props.entries) {
      const id = normalizeEntry(entry).categoryId;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [props.entries]);

  return (
    <>
      <div className="desktop-vault-layout">
        <div className="desktop-list-pane">
          <input
            type="search"
            className="search"
            placeholder="Search name, person, service..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <CategoryFilter
            active={categoryFilter}
            counts={categoryCounts}
            onChange={setCategoryFilter}
          />

          {props.people.length > 0 && (
            <div className="category-filter desktop-filter-row">
              <button
                type="button"
                className={`filter-chip${personFilter === null ? " active" : ""}`}
                onClick={() => setPersonFilter(null)}
              >
                Everyone
              </button>
              {props.people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={`filter-chip${personFilter === person.id ? " active" : ""}`}
                  onClick={() => setPersonFilter(person.id)}
                >
                  <PersonAvatar
                    name={person.name}
                    emoji={person.emoji}
                    color={colorForId(person.id)}
                    size="sm"
                  />
                  {person.name}
                </button>
              ))}
            </div>
          )}

          <EntryList
            entries={props.entries}
            people={props.people}
            query={query}
            categoryFilter={categoryFilter}
            personFilter={personFilter}
            selectedId={selected?.id ?? null}
            onSelect={(entry) => setSelected(entry)}
          />
        </div>

        <div className="desktop-detail-pane-wrap">
          <EntryDetailPane
            entry={selected}
            people={props.people}
            onEdit={() => setEditing(true)}
            onDelete={() => {
              if (!selected) return;
              const label = entryDisplayTitle(
                normalizeEntry(selected),
                props.people,
              );
              if (confirm(`Delete "${label}"?`)) {
                void props.onDelete(selected.id);
                setSelected(null);
                props.onMessage("Deleted.");
              }
            }}
            onCopy={props.onCopy}
          />
        </div>
      </div>

      <Modal
        title="Add password"
        open={props.adding}
        onClose={() => props.onAddingChange(false)}
      >
        <AddEntryWizard
          people={props.people}
          onCancel={() => props.onAddingChange(false)}
          onAddPerson={props.onAddPerson}
          onSave={async (data) => {
            await props.onAdd(data);
            props.onAddingChange(false);
            props.onMessage("Saved.");
          }}
        />
      </Modal>

      <Modal
        title="Edit password"
        open={editing && !!selected}
        onClose={() => setEditing(false)}
      >
        {selected && (
          <EntryForm
            initial={selected}
            people={props.people}
            onCancel={() => setEditing(false)}
            onSave={async (data) => {
              await props.onUpdate(selected.id, data);
              setEditing(false);
              setSelected(null);
              props.onMessage("Updated.");
            }}
          />
        )}
      </Modal>
    </>
  );
}
