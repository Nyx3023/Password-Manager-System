import {
  entryDisplayTitle,
  entrySubtitle,
  findPerson,
  normalizeEntry,
} from "@/shared/entryUtils";
import { colorForId } from "@/shared/people";
import type { Person, VaultEntry } from "@/shared/types";
import { PersonAvatar, ServiceIcon } from "./ServiceIcon";
import { DetailRow } from "./DetailRow";

interface EntryDetailPaneProps {
  entry: VaultEntry | null;
  people: Person[];
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (label: string, value: string) => void | Promise<void>;
}

export function EntryDetailPane({
  entry,
  people,
  onEdit,
  onDelete,
  onCopy,
}: EntryDetailPaneProps) {
  if (!entry) {
    return (
      <div className="desktop-detail-empty">
        <p className="muted">Select a password to view details.</p>
      </div>
    );
  }

  const e = normalizeEntry(entry);
  const person = findPerson(people, e);
  const title = entryDisplayTitle(e, people);

  return (
    <div className="entry-detail desktop-detail-pane">
      <div className="entry-detail-header">
        <ServiceIcon
          categoryId={e.categoryId}
          subcategoryId={e.subcategoryId}
          size="lg"
        />
        <div>
          <h2 className="desktop-detail-title">{title}</h2>
          <p className="entry-detail-sub">{entrySubtitle(e)}</p>
          {person && (
            <p className="entry-detail-person">
              <PersonAvatar
                name={person.name}
                emoji={person.emoji}
                color={colorForId(person.id)}
                size="sm"
              />
              {person.name}
            </p>
          )}
        </div>
      </div>

      <div className="desktop-detail-grid">
        <div className="detail-col" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <DetailRow label="Username" value={e.username} onCopy={onCopy} />
          <DetailRow label="Password" value={e.password} secret onCopy={onCopy} />
        </div>
        <div className="detail-col" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <DetailRow label="URL" value={e.url} onCopy={onCopy} />
          {e.notes && (
            <div className="detail-row">
              <span className="detail-row-label">Notes</span>
              <p className="detail-notes">{e.notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="entry-detail-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <button type="button" className="primary" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="ghost danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
