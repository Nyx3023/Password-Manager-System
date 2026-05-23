import { PERSON_CATEGORIES } from "@/shared/people";
import type { PersonCategoryId } from "@/shared/types";
import { RestoreBackup } from "../RestoreBackup";
import type { SetupPerson } from "./SetupWizard";

interface StepPeopleProps {
  people: SetupPerson[];
  setPeople: React.Dispatch<React.SetStateAction<SetupPerson[]>>;
  nameInput: string;
  setNameInput: (val: string) => void;
  nameCategory: PersonCategoryId;
  setNameCategory: (val: PersonCategoryId) => void;
  addPerson: () => void;
  busy: boolean;
  onNext: () => void;
  onLanSyncOpen: () => void;
  onRestoreBackup: (content: string, password: string) => Promise<boolean>;
}

export function StepPeople({
  people,
  setPeople,
  nameInput,
  setNameInput,
  nameCategory,
  setNameCategory,
  addPerson,
  busy,
  onNext,
  onLanSyncOpen,
  onRestoreBackup,
}: StepPeopleProps) {
  return (
    <>
      <h1 className="setup-title">Who uses this vault?</h1>
      <p className="setup-sub">
        Add everyone you want to save passwords for: family, friends, work, yourself.
      </p>

      <div className="setup-card stack">
        <label>
          Name
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. Me, Mom, John"
            onKeyDown={(e) => e.key === "Enter" && addPerson()}
          />
        </label>
        <div className="category-pill-row">
          {PERSON_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`pill${nameCategory === cat.id ? " active" : ""}`}
              onClick={() => setNameCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ghost block"
          onClick={addPerson}
          disabled={!nameInput.trim()}
        >
          + Add to list
        </button>
      </div>

      {people.length > 0 && (
        <ul className="setup-people-list">
          {people.map((p, i) => (
            <li key={`${p.name}-${i}`}>
              <span>{p.name}</span>
              <span className="muted small">
                {PERSON_CATEGORIES.find((c) => c.id === p.category)?.name}
              </span>
              <button
                type="button"
                className="ghost small"
                onClick={() =>
                  setPeople((list) => list.filter((_, j) => j !== i))
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="primary block"
        disabled={people.length === 0}
        onClick={onNext}
      >
        Continue
      </button>
      <button
        type="button"
        className="ghost restore-link"
        disabled={busy}
        onClick={onLanSyncOpen}
      >
        Setup from existing device (LAN)
      </button>
      <RestoreBackup busy={busy} onRestore={onRestoreBackup} />
    </>
  );
}
