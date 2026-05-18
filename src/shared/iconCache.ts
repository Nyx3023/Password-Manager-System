import { getSubcategory } from "./catalog";

const bundledIconUrls = import.meta.glob<string>("../assets/icons/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
});

const iconUrlById = new Map<string, string>();
for (const [filepath, url] of Object.entries(bundledIconUrls)) {
  const id = filepath.split("/").pop()!.replace(/\.svg$/, "");
  iconUrlById.set(id, url);
}

export function hasBundledIcon(subcategoryId: string): boolean {
  return iconUrlById.has(subcategoryId);
}

export function getBundledIconUrl(subcategoryId: string): string | undefined {
  return iconUrlById.get(subcategoryId);
}

export function getDomainForSubcategory(
  categoryId: string,
  subcategoryId: string,
): string | undefined {
  return getSubcategory(categoryId, subcategoryId)?.hosts?.[0];
}
