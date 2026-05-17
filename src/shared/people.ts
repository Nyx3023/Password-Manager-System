import type { Person, PersonCategoryId } from "./types";

export interface PersonCategoryDef {
  id: PersonCategoryId;
  name: string;
  emoji: string;
}

export const PERSON_CATEGORIES: PersonCategoryDef[] = [
  { id: "self", name: "Me / Personal", emoji: "🙂" },
  { id: "family", name: "Family", emoji: "👨‍👩‍👧" },
  { id: "friend", name: "Friends", emoji: "👋" },
  { id: "work", name: "Work / School", emoji: "💼" },
  { id: "other", name: "Other", emoji: "🔑" },
];

const PERSON_CATEGORY_MAP = new Map(
  PERSON_CATEGORIES.map((c) => [c.id, c]),
);

export function getPersonCategory(
  id: PersonCategoryId | string,
): PersonCategoryDef {
  return PERSON_CATEGORY_MAP.get(id as PersonCategoryId) ?? PERSON_CATEGORIES[4]!;
}

export function personInitial(person: Person): string {
  const trimmed = person.name.trim();
  if (!trimmed) return "?";
  return trimmed[0]!.toUpperCase();
}

const PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#0ea5e9",
];

/** Deterministic color from an id (no internet, no images). */
export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length]!;
}

export function groupPeopleByCategory(
  people: Person[],
): { category: PersonCategoryDef; people: Person[] }[] {
  const groups = new Map<PersonCategoryId, Person[]>();
  for (const cat of PERSON_CATEGORIES) {
    groups.set(cat.id, []);
  }
  for (const person of people) {
    const cat = (person.category ?? "other") as PersonCategoryId;
    if (!groups.has(cat)) groups.set("other", []);
    groups.get(cat)!.push(person);
  }
  return PERSON_CATEGORIES.map((c) => ({
    category: c,
    people: (groups.get(c.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  })).filter((g) => g.people.length > 0);
}
