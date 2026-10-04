import { isDesktopApp } from "./platform";

export const GITHUB_REPO_OWNER =
  (import.meta.env.VITE_GITHUB_REPO_OWNER as string) || "Nyx3023";
export const GITHUB_REPO_NAME =
  (import.meta.env.VITE_GITHUB_REPO_NAME as string) || "Password-Manager-System";
export const CURRENT_APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string) || "1.0.0";

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseTitle: string;
  releaseNotes: string;
  publishedAt: string;
  htmlUrl: string;
  apkAsset?: ReleaseAsset;
  desktopAsset?: ReleaseAsset;
  error?: string;
}

/**
 * Compare semantic versions: returns true if latest > current
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);

  const c = parse(current);
  const l = parse(latest);
  const len = Math.max(c.length, l.length);

  for (let i = 0; i < len; i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }

  // Same base semver: final release > prerelease
  if (current.includes("-") && !latest.includes("-")) {
    return true;
  }
  if (!current.includes("-") && latest.includes("-")) {
    return false;
  }

  // Both are prereleases with same base version (e.g. 1.0.2-beta.2 vs 1.0.2-beta.1)
  if (current.includes("-") && latest.includes("-")) {
    const getPrereleaseNum = (s: string) => {
      const match = s.match(/\.([0-9]+)$/);
      return match ? parseInt(match[1], 10) : 0;
    };
    return getPrereleaseNum(latest) > getPrereleaseNum(current);
  }

  return false;
}

/**
 * Check for updates from GitHub Releases API
 */
export async function checkForAppUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = CURRENT_APP_VERSION;

  // On Desktop, if electronAPI has built-in updater check, prefer that
  if (isDesktopApp() && window.electronAPI?.checkForUpdates) {
    try {
      const res = await window.electronAPI.checkForUpdates();
      if (res.status === "update-available" && res.version) {
        return {
          hasUpdate: true,
          currentVersion,
          latestVersion: res.version,
          releaseTitle: `Release v${res.version}`,
          releaseNotes: res.releaseNotes || "Performance optimizations and improvements.",
          publishedAt: new Date().toISOString(),
          htmlUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/tag/v${res.version}`,
        };
      } else if (res.status === "error") {
        if (res.error?.includes("404") || res.error?.includes("releases.atom")) {
          return {
            hasUpdate: false,
            currentVersion,
            latestVersion: currentVersion,
            releaseTitle: "No releases found",
            releaseNotes: "No public GitHub releases published yet.",
            publishedAt: "",
            htmlUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`,
          };
        }
        // Fall back to direct GitHub fetch below
      } else {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseTitle: "",
          releaseNotes: "",
          publishedAt: "",
          htmlUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`,
        };
      }
    } catch (_) {
      // Fall through to GitHub API
    }
  }

  try {
    const isPrereleaseChannel = currentVersion.includes("-");
    const url = isPrereleaseChannel
      ? `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`
      : `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseTitle: "No releases found",
          releaseNotes: "No public GitHub releases published yet.",
          publishedAt: "",
          htmlUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`,
        };
      }
      throw new Error(`GitHub API error: ${res.statusText}`);
    }

    const payload = await res.json();
    const data = Array.isArray(payload) ? payload[0] : payload;
    if (!data) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseTitle: "Up to date",
        releaseNotes: "",
        publishedAt: "",
        htmlUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`,
      };
    }
    const rawTag = (data.tag_name as string) || "";
    const latestVersion = rawTag.replace(/^v/, "").trim();
    const hasUpdate = isNewerVersion(currentVersion, latestVersion);

    const assets = Array.isArray(data.assets) ? data.assets : [];
    const apk = assets.find((a: any) =>
      typeof a.name === "string" && a.name.toLowerCase().endsWith(".apk"),
    );
    const exe =
      assets.find(
        (a: any) =>
          typeof a.name === "string" &&
          a.name.toLowerCase().includes("setup") &&
          a.name.toLowerCase().endsWith(".exe"),
      ) ||
      assets.find(
        (a: any) =>
          typeof a.name === "string" && a.name.toLowerCase().endsWith(".exe"),
      );

    return {
      hasUpdate,
      currentVersion,
      latestVersion: latestVersion || currentVersion,
      releaseTitle: data.name || rawTag || `Version ${latestVersion}`,
      releaseNotes: data.body || "No changelog provided for this release.",
      publishedAt: data.published_at || "",
      htmlUrl: data.html_url || `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`,
      apkAsset: apk
        ? {
            name: apk.name,
            size: apk.size,
            downloadUrl: apk.browser_download_url,
          }
        : undefined,
      desktopAsset: exe
        ? {
            name: exe.name,
            size: exe.size,
            downloadUrl: exe.browser_download_url,
          }
        : undefined,
    };
  } catch (err: any) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseTitle: "",
      releaseNotes: "",
      publishedAt: "",
      htmlUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`,
      error: err.message || "Failed to check for updates.",
    };
  }
}
