import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_SUBCATEGORY_ID,
  getCategory,
  getSubcategory,
} from "./catalog";
import type { Person, VaultEntry, VaultPayload } from "./types";

export function normalizeEntry(entry: VaultEntry): VaultEntry {
  return {
    ...entry,
    personId: entry.personId ?? "",
    personName: entry.personName ?? "",
    categoryId: entry.categoryId ?? DEFAULT_CATEGORY_ID,
    subcategoryId: entry.subcategoryId ?? DEFAULT_SUBCATEGORY_ID,
  };
}

export function normalizePayload(payload: VaultPayload): VaultPayload {
  return {
    version: 2,
    people: Array.isArray(payload.people) ? payload.people : [],
    entries: Array.isArray(payload.entries)
      ? payload.entries.map(normalizeEntry)
      : [],
  };
}

export function findPerson(
  people: Person[],
  entry: VaultEntry,
): Person | undefined {
  if (entry.personId) {
    return people.find((p) => p.id === entry.personId);
  }
  return undefined;
}

export function personLabelForEntry(
  people: Person[],
  entry: VaultEntry,
): string {
  const person = findPerson(people, entry);
  if (person) return person.name;
  if (entry.personName) return entry.personName;
  return "";
}

export function entrySearchText(
  entry: VaultEntry,
  people: Person[],
): string {
  const e = normalizeEntry(entry);
  const sub = getSubcategory(e.categoryId, e.subcategoryId);
  const cat = getCategory(e.categoryId);
  const person = findPerson(people, e);
  return [
    e.title,
    person?.name,
    e.personName,
    e.username,
    e.url,
    e.notes,
    sub?.name,
    cat?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function entryDisplayTitle(
  entry: VaultEntry,
  people: Person[],
): string {
  const e = normalizeEntry(entry);
  const sub = getSubcategory(e.categoryId, e.subcategoryId);
  const person = findPerson(people, e);
  const personLabel = person?.name ?? e.personName;

  if (e.title.trim()) return e.title.trim();
  if (sub && personLabel) return `${sub.name} - ${personLabel}`;
  if (sub) return sub.name;
  return personLabel || "Untitled";
}

export function entrySubtitle(entry: VaultEntry): string {
  const e = normalizeEntry(entry);
  if (e.username) return e.username;
  const sub = getSubcategory(e.categoryId, e.subcategoryId);
  return sub?.name ?? "";
}

export function suggestedTitle(
  categoryId: string,
  subcategoryId: string,
  personName: string,
): string {
  const sub = getSubcategory(categoryId, subcategoryId);
  if (!sub) return personName;
  if (personName.trim()) return `${sub.name} - ${personName.trim()}`;
  return sub.name;
}
