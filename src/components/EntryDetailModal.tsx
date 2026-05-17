import { useState } from "react";
import {
  entryDisplayTitle,
  entrySubtitle,
  findPerson,
  normalizeEntry,
} from "@/shared/entryUtils";
import { colorForId } from "@/shared/people";
import type { Person, VaultEntry } from "@/shared/types";
import { Modal } from "./Modal";
import { PersonAvatar, ServiceIcon } from "./ServiceIcon";

interface EntryDetailModalProps {
  entry: VaultEntry | null;
  people: Person[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (label: string, value: string) => void;
}

function DetailRow({
  label,
  value,
  secret,
  onCopy,
}: {
  label: string;
  value: string;
  secret?: boolean;
  onCopy: (label: string, value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  if (!value) return null;

  return (
    <div className="detail-row">
      <span className="detail-row-label">{label}</span>
      <div className="detail-row-value">
        <span className={secret && !visible ? "detail-secret" : ""}>
          {secret && !visible ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : value}
        </span>
        <div className="detail-row-actions">
          {secret && (
            <button
              type="button"
              className="ghost small"
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? "Hide" : "Show"}
            </button>
          )}
          <button
            type="button"
            className="ghost small"
            onClick={() => onCopy(label, value)}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

export function EntryDetailModal({
  entry,
  people,
  onClose,
  onEdit,
  onDelete,
  onCopy,
}: EntryDetailModalProps) {
  if (!entry) return null;

  const e = normalizeEntry(entry);
  const person = findPerson(people, e);
  const title = entryDisplayTitle(e, people);

  return (
    <Modal title={title} open onClose={onClose}>
      <div className="entry-detail">
        <div className="entry-detail-header">
          <ServiceIcon
            categoryId={e.categoryId}
            subcategoryId={e.subcategoryId}
            size="lg"
          />
          <div>
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

        <DetailRow label="Username" value={e.username} onCopy={onCopy} />
        <DetailRow
          label="Password"
          value={e.password}
          secret
          onCopy={onCopy}
        />
        <DetailRow label="URL" value={e.url} onCopy={onCopy} />
        {e.notes && (
          <div className="detail-row">
            <span className="detail-row-label">Notes</span>
            <p className="detail-notes">{e.notes}</p>
          </div>
        )}

        <div className="entry-detail-actions">
          <button type="button" className="primary block" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="ghost block" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </Modal>
  );
}
