import { useState } from "react";
import { PERSON_CATEGORIES } from "@/shared/people";
import type { PersonCategoryId } from "@/shared/types";

interface AddPersonFormProps {
  busy?: boolean;
  onCancel: () => void;
  onSave: (
    name: string,
    category: PersonCategoryId,
  ) => Promise<void>;
}

export function AddPersonForm({ busy, onCancel, onSave }: AddPersonFormProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PersonCategoryId>("self");

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSave(trimmed, category);
    setName("");
    setCategory("self");
  };

  return (
    <div className="stack add-person-form">
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Me, Mom, Work"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
        />
      </label>
      <div>
        <p className="label-mono">Category</p>
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
      </div>
      <button
        type="button"
        className="primary block"
        disabled={busy || !name.trim()}
        onClick={() => void handleSubmit()}
      >
        Save person
      </button>
      <button type="button" className="ghost block" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
