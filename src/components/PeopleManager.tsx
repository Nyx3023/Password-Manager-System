import { useState } from "react";
import {
  colorForId,
  groupPeopleByCategory,
  PERSON_CATEGORIES,
} from "@/shared/people";
import type { Person, PersonCategoryId } from "@/shared/types";
import { AddPersonForm } from "./AddPersonForm";
import { Modal } from "./Modal";
import { ConfirmModal } from "./ConfirmModal";
import { PersonAvatar } from "./ServiceIcon";

interface PeopleManagerProps {
  embedded?: boolean;
  people: Person[];
  onAdd: (
    name: string,
    category: PersonCategoryId,
    emoji?: string,
  ) => Promise<Person | null>;
  onUpdate: (
    id: string,
    update: { name?: string; category?: PersonCategoryId; emoji?: string },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<{ entriesRemoved: number }>;
  onMessage: (message: string) => void;
}

export function PeopleManager({
  embedded = false,
  people,
  onAdd,
  onUpdate,
  onDelete,
  onMessage,
}: PeopleManagerProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<PersonCategoryId>("self");
  const [deletingPerson, setDeletingPerson] = useState<Person | null>(null);
  const [animatingPersonId, setAnimatingPersonId] = useState<string | null>(null);

  const groups = groupPeopleByCategory(people);

  const startEdit = (person: Person) => {
    setEditingId(person.id);
    setEditName(person.name);
    setEditCategory(person.category);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await onUpdate(editingId, { name: editName, category: editCategory });
    setEditingId(null);
    onMessage("Person updated.");
  };

  const handleDeleteClick = (person: Person) => {
    setDeletingPerson(person);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPerson) return;
    const person = deletingPerson;
    setDeletingPerson(null);
    setAnimatingPersonId(person.id);
    
    setTimeout(() => {
      void onDelete(person.id).then((result) => {
        setAnimatingPersonId(null);
        onMessage(
          result.entriesRemoved
            ? `Deleted ${person.name} and ${result.entriesRemoved} linked entries.`
            : `Deleted ${person.name}.`,
        );
      });
    }, 600);
  };

  return (
    <section className={embedded ? "people-embedded" : "panel"}>
      {!embedded && <h3>People</h3>}
      {!embedded && (
        <p className="muted small">
          Names are saved here so each password knows whose account it is.
        </p>
      )}

      <button
        type="button"
        className="primary block people-add-btn"
        onClick={() => setShowAdd(true)}
      >
        + Add person
      </button>

      {people.length === 0 ? (
        <p className="muted small">No people yet.</p>
      ) : (
        groups.map((group) => (
          <div key={group.category.id} className="person-group">
            <h4 className="group-title">
              <span>{group.category.emoji}</span>
              {group.category.name}
            </h4>
            <ul className="people-list">
              {group.people.map((person) => (
                <li key={person.id} className={`person-row${animatingPersonId === person.id ? " is-deleting" : ""}`}>
                  {editingId === person.id ? (
                    <div className="stack person-edit">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <div className="category-pill-row">
                        {PERSON_CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            className={`pill${editCategory === cat.id ? " active" : ""}`}
                            onClick={() => setEditCategory(cat.id)}
                          >
                            <span>{cat.emoji}</span>
                            {cat.name}
                          </button>
                        ))}
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="primary small"
                          onClick={() => void saveEdit()}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <PersonAvatar
                        name={person.name}
                        emoji={person.emoji}
                        color={colorForId(person.id)}
                        size="md"
                      />
                      <span className="person-row-name">{person.name}</span>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() => startEdit(person)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost small danger"
                          onClick={() => handleDeleteClick(person)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <Modal
        title="Add person"
        open={showAdd}
        onClose={() => setShowAdd(false)}
      >
        <AddPersonForm
          onCancel={() => setShowAdd(false)}
          onSave={async (name, category) => {
            const person = await onAdd(name, category);
            if (person) {
              setShowAdd(false);
              onMessage(`Added ${person.name}.`);
            }
          }}
        />
      </Modal>

      <ConfirmModal
        open={deletingPerson !== null}
        title="Delete Person"
        message={deletingPerson ? `Delete "${deletingPerson.name}"? All passwords saved under this name will also be deleted.` : ""}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
        onCancel={() => setDeletingPerson(null)}
        danger
      />
    </section>
  );
}
