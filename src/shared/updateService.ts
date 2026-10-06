import { isDesktopApp } from "./platform";

export const GITHUB_REPO_OWNER =
  (import.meta.env.VITE_GITHUB_REPO_OWNER as string) || "Nyx3023";
export const GITHUB_REPO_NAME =
  (import.meta.env.VITE_GITHUB_REPO_NAME as string) || "Password-Manager-System";
export const CURRENT_APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string) || "1.0.0";

export type UpdateChannel = "release" | "beta";

const UPDATE_CHANNEL_KEY = "securex:update_channel";
const CHANNEL_UNLOCKED_KEY = "securex:channel_unlocked";

export function getUpdateChannel(): UpdateChannel {
  try {
    const saved = localStorage.getItem(UPDATE_CHANNEL_KEY);
    if (saved === "beta" || saved === "release") return saved;
  } catch {}
  return CURRENT_APP_VERSION.includes("-") ? "beta" : "release";
}

export function setUpdateChannel(channel: UpdateChannel): void {
  try {
    localStorage.setItem(UPDATE_CHANNEL_KEY, channel);
  } catch {}
}

export function isChannelUnlocked(): boolean {
  try {
    return localStorage.getItem(CHANNEL_UNLOCKED_KEY) === "true";
  } catch {}
  return false;
}

export function setChannelUnlocked(unlocked: boolean): void {
  try {
    localStorage.setItem(CHANNEL_UNLOCKED_KEY, unlocked ? "true" : "false");
  } catch {}
}

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
  channel?: UpdateChannel;
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
export async function checkForAppUpdates(
  channelOverride?: UpdateChannel,
): Promise<UpdateCheckResult> {
  const currentVersion = CURRENT_APP_VERSION;
  const channel = channelOverride || getUpdateChannel();
  const isBeta = channel === "beta" || currentVersion.includes("-");

  // On Desktop, if electronAPI has built-in updater check, prefer that
  if (isDesktopApp() && window.electronAPI?.checkForUpdates) {
    try {
      const res = await window.electronAPI.checkForUpdates(channel);
      if (res.status === "update-available" && res.version) {
        return {
          hasUpdate: true,
          currentVersion,
          latestVersion: res.version,
          releaseTitle: `Release v${res.version}`,
          releaseNotes: res.releaseNotes || "Performance optimizations and improvements.",
          publishedAt: new Date().toISOString(),
          htmlUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/tag/v${res.version}`,
          channel,
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
            channel,
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
          channel,
        };
      }
    } catch (_) {
      // Fall through to GitHub API
    }
  }

  try {
    const url = isBeta
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
      if (res.status === 403) {
        // Rate limited by GitHub API
        return currentUpdateInfo || {
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseTitle: "",
          releaseNotes: "",
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

// Global state & listeners for automatic background update detection
let currentUpdateInfo: UpdateCheckResult | null = null;
const updateListeners = new Set<(info: UpdateCheckResult | null) => void>();
let watcherStarted = false;
let lastCheckTime = 0;
const THROTTLE_MS = 45 * 1000; // at most once every 45s on wake/focus/online

export function getLatestUpdateInfo(): UpdateCheckResult | null {
  return currentUpdateInfo;
}

export function subscribeAppUpdates(
  callback: (info: UpdateCheckResult | null) => void,
): () => void {
  updateListeners.add(callback);
  if (currentUpdateInfo) {
    callback(currentUpdateInfo);
  }
  if (!watcherStarted) {
    startAutoUpdateWatcher();
  }
  return () => {
    updateListeners.delete(callback);
  };
}

export async function triggerUpdateCheck(
  channelOverride?: UpdateChannel,
): Promise<UpdateCheckResult> {
  lastCheckTime = Date.now();
  const res = await checkForAppUpdates(channelOverride);
  currentUpdateInfo = res;
  for (const cb of updateListeners) {
    try {
      cb(res);
    } catch {}
  }
  return res;
}

export function startAutoUpdateWatcher(intervalMs = 2.5 * 60 * 1000): void {
  if (typeof window === "undefined" || watcherStarted) return;
  watcherStarted = true;

  // 1. Initial check immediately
  void triggerUpdateCheck();

  // 2. Periodic background polling (every 2.5 minutes)
  setInterval(() => {
    void triggerUpdateCheck();
  }, intervalMs);

  // 3. Auto check whenever app comes to foreground or window gains focus
  const onWake = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (Date.now() - lastCheckTime > THROTTLE_MS) {
      void triggerUpdateCheck();
    }
  };

  window.addEventListener("focus", onWake);
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("online", () => {
    if (Date.now() - lastCheckTime > 15 * 1000) {
      void triggerUpdateCheck();
    }
  });
}
