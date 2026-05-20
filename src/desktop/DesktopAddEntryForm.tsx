import { useState, useEffect, FormEvent } from "react";
import {
  CATEGORIES,
  getSubcategory,
  DEFAULT_CATEGORY_ID,
  DEFAULT_SUBCATEGORY_ID,
} from "@/shared/catalog";
import { suggestedTitle } from "@/shared/entryUtils";
import { colorForId, groupPeopleByCategory } from "@/shared/people";
import type { Person, PersonCategoryId, VaultEntry } from "@/shared/types";
import { PersonAvatar, ServiceIcon } from "@/components/ServiceIcon";
import { PasswordGeneratorPanel } from "@/components/PasswordGeneratorPanel";

interface DesktopAddEntryFormProps {
  people: Person[];
  onCancel: () => void;
  onAddPerson: (
    name: string,
    category: PersonCategoryId,
    emoji?: string,
  ) => Promise<Person | null>;
  onSave: (
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
}

export function DesktopAddEntryForm({
  people,
  onCancel,
  onSave,
}: DesktopAddEntryFormProps) {
  const [personId, setPersonId] = useState("");
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY_ID);
  const [subcategoryId, setSubcategoryId] = useState(DEFAULT_SUBCATEGORY_ID);

  const [form, setForm] = useState({
    title: "",
    username: "",
    password: "",
    url: "",
    notes: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCategory = CATEGORIES.find((c) => c.id === categoryId);
  const subcategories = selectedCategory?.subcategories ?? [];

  useEffect(() => {
    const cat = CATEGORIES.find((c) => c.id === categoryId);
    if (cat && cat.subcategories.length > 0) {
      setSubcategoryId(cat.subcategories[0]!.id);
    } else {
      setSubcategoryId(DEFAULT_SUBCATEGORY_ID);
    }
  }, [categoryId]);

  const sub = getSubcategory(categoryId, subcategoryId);
  const personGroups = groupPeopleByCategory(people);
  const person = people.find((p) => p.id === personId);
  const generatorUser = form.username.trim() || person?.name || "";
  const canSave = Boolean(personId && form.password.trim());

  useEffect(() => {
    if (sub?.defaultUrl) {
      setForm((f) => ({ ...f, url: sub.defaultUrl || "" }));
    } else {
      setForm((f) => ({ ...f, url: "" }));
    }
  }, [sub]);

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canSave) return;

    setSaving(true);
    try {
      const personName = person?.name ?? "";
      const title =
        form.title.trim() ||
        suggestedTitle(categoryId, subcategoryId, personName);

      await onSave({
        title,
        personId,
        personName,
        categoryId,
        subcategoryId,
        username: form.username,
        password: form.password,
        url: form.url,
        notes: form.notes,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="desktop-add-entry" onSubmit={handleSubmit}>
      <div className="desktop-add-entry__scroll">
      <div className="desktop-add-entry__hero">
        <ServiceIcon
          categoryId={categoryId}
          subcategoryId={subcategoryId}
          size="lg"
        />
        <div className="desktop-add-entry__hero-text">
          <p className="desktop-add-entry__title">{sub?.name ?? "Service"}</p>
          <p className="muted small">
            {person
              ? `Owner: ${person.name}`
              : people.length === 0
                ? "Add people in Settings first"
                : "Pick category, service, and owner"}
          </p>
        </div>
        {person && (
          <PersonAvatar
            name={person.name}
            emoji={person.emoji}
            color={colorForId(person.id)}
            size="md"
          />
        )}
      </div>

      <div className="desktop-add-entry__row desktop-add-entry__row--3">
        <label>
          Category
          <select
            value={categoryId}
            onChange={(ev) => setCategoryId(ev.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service
          <select
            value={subcategoryId}
            onChange={(ev) => setSubcategoryId(ev.target.value)}
          >
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select
            value={personId}
            onChange={(ev) => setPersonId(ev.target.value)}
            required
            disabled={people.length === 0}
          >
            <option value="" disabled>
              {people.length === 0 ? "No people" : "Select"}
            </option>
            {personGroups.map((group) => (
              <optgroup key={group.category.id} label={group.category.name}>
                {group.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <label>
        Label (optional)
        <input
          value={form.title}
          onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))}
          placeholder={
            sub && person ? `${sub.name} (${person.name})` : "Custom name"
          }
        />
      </label>

      <div className="desktop-add-entry__row desktop-add-entry__row--2">
        <label>
          Username
          <input
            value={form.username}
            onChange={(ev) =>
              setForm((f) => ({ ...f, username: ev.target.value }))
            }
            placeholder="email or username"
            autoComplete="off"
          />
        </label>
        <label>
          Password
          <div className="inline-input">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(ev) =>
                setForm((f) => ({ ...f, password: ev.target.value }))
              }
              placeholder="Required"
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              className="ghost small"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>
      </div>

      <button
        type="button"
        className={`ghost block desktop-add-entry__gen${
          showGenerator ? " desktop-add-entry__gen--open" : ""
        }`}
        onClick={() => setShowGenerator((v) => !v)}
      >
        {showGenerator ? "- Hide password generator" : "+ Generate password"}
      </button>

      {showGenerator && (
        <div className="desktop-add-entry__generator">
          <PasswordGeneratorPanel
            websiteLabel={sub?.name ?? "Website"}
            userLabel={generatorUser}
            onUse={(password) => {
              setForm((f) => ({ ...f, password }));
              setShowGenerator(false);
            }}
          />
        </div>
      )}

      <div className="desktop-add-entry__row desktop-add-entry__row--2">
        <label>
          URL
          <input
            value={form.url}
            onChange={(ev) => setForm((f) => ({ ...f, url: ev.target.value }))}
            placeholder="https://"
            inputMode="url"
            autoComplete="off"
          />
        </label>
        <label>
          Notes
          <input
            value={form.notes}
            onChange={(ev) =>
              setForm((f) => ({ ...f, notes: ev.target.value }))
            }
            placeholder="Optional"
          />
        </label>
      </div>

      </div>

      <footer className="desktop-add-entry__actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={saving || !canSave}>
          {saving ? "Saving..." : "Add entry"}
        </button>
      </footer>
    </form>
  );
}
