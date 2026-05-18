/**
 * Maintainer script: downloads Simple Icons SVGs into src/assets/icons/.
 * Run: npm run icons:download
 * Keep slugs in sync with src/shared/iconSlugs.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "src", "assets", "icons");
const SIMPLE_ICONS_VERSION = "11.14.0";
const SLUGS_FILE = path.join(__dirname, "..", "src", "shared", "iconSlugs.ts");
const ICON_COLOR = "ffffff";

function parseSlugsFromSource(source) {
  const slugs = {};
  const re = /^\s*(\w+):\s*"([^"]+)"/gm;
  let match;
  while ((match = re.exec(source)) !== null) {
    slugs[match[1]] = match[2];
  }
  return slugs;
}

function normalizeSvgForDarkTile(svg) {
  let out = svg
    .replace(/\sfill="[^"]*"/gi, ' fill="#ffffff"')
    .replace(/\sfill:[^;"]+/gi, " fill:#ffffff");
  if (!/<svg[^>]*\sfill="/i.test(out)) {
    out = out.replace(/<svg\b/, '<svg fill="#ffffff"');
  }
  out = out.replace(/<path(?![^>]*\sfill=)/gi, '<path fill="#ffffff"');
  return out;
}

async function fetchSvg(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (!text.includes("<svg")) {
    throw new Error("response is not SVG");
  }
  return text;
}

async function downloadOne(id, slug) {
  const sources = [
    `https://cdn.simpleicons.org/${slug}/${ICON_COLOR}`,
    `https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}/icons/${slug}.svg`,
  ];

  let lastError;
  for (const url of sources) {
    try {
      const text = await fetchSvg(url);
      const normalized = normalizeSvgForDarkTile(text);
      fs.writeFileSync(path.join(OUT_DIR, `${id}.svg`), normalized, "utf8");
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function main() {
  const source = fs.readFileSync(SLUGS_FILE, "utf8");
  const slugs = parseSlugsFromSource(source);
  const entries = Object.entries(slugs);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0;
  let failed = 0;

  for (const [id, slug] of entries) {
    try {
      await downloadOne(id, slug);
      ok++;
      console.log(`ok  ${id}`);
    } catch (err) {
      failed++;
      console.error(`fail ${id} (${slug}): ${err.message}`);
    }
  }

  console.log(`\nDone: ${ok} saved, ${failed} failed → ${OUT_DIR}`);
  if (failed > 0) process.exitCode = 1;
}

main();
