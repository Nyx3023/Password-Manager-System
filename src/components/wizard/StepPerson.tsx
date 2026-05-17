import { useState } from "react";
import { colorForId, groupPeopleByCategory, PERSON_CATEGORIES } from "@/shared/people";
import type { Person, PersonCategoryId } from "@/shared/types";
import { PersonAvatar } from "../ServiceIcon";

interface StepPersonProps {
  people: Person[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddPerson: (
    name: string,
    category: PersonCategoryId,
    emoji?: string,
  ) => Promise<Person | null>;
}

export function StepPerson({
  people,
  selectedId,
  onSelect,
  onAddPerson,
}: StepPersonProps) {
  const [adding, setAdding] = useState(people.length === 0);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PersonCategoryId>("self");

  const groups = groupPeopleByCategory(people);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const person = await onAddPerson(trimmed, category);
    if (person) {
      onSelect(person.id);
      setName("");
      setAdding(false);
    }
  };

  return (
    <div className="step-body">
      {!adding && people.length > 0 && (
        <>
          {groups.map((group) => (
            <section key={group.category.id} className="person-group">
              <h4 className="group-title">
                <span>{group.category.emoji}</span>
                {group.category.name}
              </h4>
              <div className="person-grid">
                {group.people.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className={`person-tile${selectedId === person.id ? " active" : ""}`}
                    onClick={() => onSelect(person.id)}
                  >
                    <PersonAvatar
                      name={person.name}
                      emoji={person.emoji}
                      color={colorForId(person.id)}
                      size="lg"
                    />
                    <span className="person-tile-name">{person.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <button
            type="button"
            className="ghost block"
            onClick={() => setAdding(true)}
          >
            + Add new person
          </button>
        </>
      )}

      {adding && (
        <div className="add-person stack">
          <p className="muted small">
            Add a person this account belongs to (e.g. yourself, family member,
            coworker).
          </p>
          <label>
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mom, Juan, Work"
            />
          </label>
          <label>
            Category
            <div className="category-pill-row">
              {PERSON_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`pill${category === cat.id ? " active" : ""}`}
                  onClick={() => setCategory(cat.id)}
                >
                  <span>{cat.emoji}</span>
                  {cat.name}
                </button>
              ))}
            </div>
          </label>
          <button
            type="button"
            className="primary block"
            disabled={!name.trim()}
            onClick={() => void handleAdd()}
          >
            Save person
          </button>
          {people.length > 0 && (
            <button
              type="button"
              className="ghost block"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
