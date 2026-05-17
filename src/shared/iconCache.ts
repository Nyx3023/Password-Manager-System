import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { CATEGORIES, getSubcategory } from "./catalog";
import { getIconSlug } from "./iconSlugs";
import { loadPrefs, savePrefs } from "./storage";

const ICON_DIR = "icons";
/** White icons read well on the dark logo tile background. */
const ICON_ON_TILE = "ffffff";

function iconPath(subcategoryId: string): string {
  return `${ICON_DIR}/${subcategoryId}.svg`;
}

function simpleIconUrl(slug: string, color: string = ICON_ON_TILE): string {
  return `https://cdn.simpleicons.org/${slug}/${color}`;
}

export function getDomainForSubcategory(
  categoryId: string,
  subcategoryId: string,
): string | undefined {
  return getSubcategory(categoryId, subcategoryId)?.hosts?.[0];
}

export type DownloadProgress = {
  done: number;
  total: number;
  current?: string;
};

/** All catalog services that have a Simple Icons slug. */
export function listDownloadableIcons(): {
  id: string;
  slug: string;
}[] {
  const items: { id: string; slug: string }[] = [];
  for (const cat of CATEGORIES) {
    for (const sub of cat.subcategories) {
      const slug = getIconSlug(sub.id);
      if (slug) {
        items.push({ id: sub.id, slug });
      }
    }
  }
  return items;
}

export async function isIconCached(subcategoryId: string): Promise<boolean> {
  try {
    await Filesystem.stat({
      path: iconPath(subcategoryId),
      directory: Directory.Data,
    });
    return true;
  } catch {
    return false;
  }
}

async function readFileAsDataUrl(
  path: string,
  mime: "image/svg+xml" | "image/png",
): Promise<string | null> {
  try {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
    });
    if (typeof result.data !== "string" || !result.data) return null;
    return `data:${mime};base64,${result.data}`;
  } catch {
    return null;
  }
}

export async function getCachedIconDataUrl(
  subcategoryId: string,
): Promise<string | null> {
  const svg = await readFileAsDataUrl(iconPath(subcategoryId), "image/svg+xml");
  if (svg) return svg;
  return readFileAsDataUrl(
    `${ICON_DIR}/${subcategoryId}.png`,
    "image/png",
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function downloadOne(
  subcategoryId: string,
  slug: string,
): Promise<boolean> {
  const response = await fetch(simpleIconUrl(slug), { cache: "force-cache" });
  if (!response.ok) return false;

  const text = await response.text();
  if (!text.includes("<svg")) return false;

  const base64 = await blobToBase64(
    new Blob([text], { type: "image/svg+xml" }),
  );

  await Filesystem.writeFile({
    path: iconPath(subcategoryId),
    directory: Directory.Data,
    data: base64,
    recursive: true,
  });
  return true;
}

const DOWNLOAD_CONCURRENCY = 8;

async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onEach?: (index: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]!();
      onEach?.(i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return results;
}

/** Download every catalog icon (first-time setup). Requires internet once. */
export async function downloadAllCatalogIcons(
  onProgress?: (p: DownloadProgress) => void,
): Promise<{ downloaded: number; failed: number }> {
  const items = listDownloadableIcons();
  let done = 0;

  const outcomes = await runPool(
    items.map(
      (item) => () => downloadOne(item.id, item.slug).catch(() => false),
    ),
    DOWNLOAD_CONCURRENCY,
    (i) => {
      done++;
      onProgress?.({ done, total: items.length, current: items[i]?.id });
    },
  );

  const downloaded = outcomes.filter(Boolean).length;
  const failed = items.length - downloaded;

  onProgress?.({ done: items.length, total: items.length });

  const prefs = await loadPrefs();
  prefs.iconsBootstrapped = true;
  await savePrefs(prefs);

  return { downloaded, failed };
}

/** Download a single icon when a new / uncached service is used. */
export async function ensureIconCached(
  _categoryId: string,
  subcategoryId: string,
): Promise<void> {
  if (await isIconCached(subcategoryId)) return;
  const slug = getIconSlug(subcategoryId);
  if (!slug) return;

  try {
    await downloadOne(subcategoryId, slug);
  } catch {
    // Offline — emoji fallback remains.
  }
}

export async function iconsBootstrapped(): Promise<boolean> {
  const prefs = await loadPrefs();
  if (prefs.iconsBootstrapped) return true;
  if (!Capacitor.isNativePlatform()) {
    return localStorage.getItem("icons_bootstrapped") === "1";
  }
  const items = listDownloadableIcons();
  if (items.length === 0) return true;
  return isIconCached(items[0]!.id);
}
