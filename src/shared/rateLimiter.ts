import { isDesktopApp } from "./platform";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { deleteMpinWrap } from "./mpinStore";

const ATTEMPTS_FILE = "unlock-attempts.json";

interface AttemptsState {
  /** Number of consecutive failed attempts for master password. */
  masterFails: number;
  /** Number of consecutive failed attempts for MPIN. */
  mpinFails: number;
  /** ISO timestamp of last master failure. */
  masterLastFail: string | null;
  /** ISO timestamp of last MPIN failure. */
  mpinLastFail: string | null;
  /** ISO timestamp until which the method is locked out. */
  masterLockedUntil: string | null;
  mpinLockedUntil: string | null;
}

const EMPTY_STATE: AttemptsState = {
  masterFails: 0,
  mpinFails: 0,
  masterLastFail: null,
  mpinLastFail: null,
  masterLockedUntil: null,
  mpinLockedUntil: null,
};

const BACKOFF_SCHEDULE_MS = [0, 1000, 2000, 5000, 10_000, 30_000, 60_000];

/** Max MPIN failures before MPIN is wiped. */
const MPIN_WIPE_THRESHOLD = 5;
/** Max master password failures before temporary lockout. */
const MASTER_LOCKOUT_THRESHOLD = 20;
/** Lockout duration for master password (15 minutes). */
const MASTER_LOCKOUT_MS = 15 * 60 * 1000;

function useElectronStorage(): boolean {
  return isDesktopApp() && !!window.electronAPI?.readDataFile;
}

async function readState(): Promise<AttemptsState> {
  let raw: string | null = null;
  if (useElectronStorage()) {
    raw = await window.electronAPI!.readDataFile(ATTEMPTS_FILE);
  } else if (!Capacitor.isNativePlatform()) {
    raw = sessionStorage.getItem(ATTEMPTS_FILE);
  } else {
    try {
      const result = await Filesystem.readFile({
        path: ATTEMPTS_FILE,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      raw = typeof result.data === "string" ? result.data : null;
    } catch {
      raw = null;
    }
  }
  if (!raw) return { ...EMPTY_STATE };
  try {
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<AttemptsState>) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

async function writeState(state: AttemptsState): Promise<void> {
  const content = JSON.stringify(state);
  if (useElectronStorage()) {
    await window.electronAPI!.writeDataFile(ATTEMPTS_FILE, content);
    return;
  }
  if (!Capacitor.isNativePlatform()) {
    sessionStorage.setItem(ATTEMPTS_FILE, content);
    return;
  }
  await Filesystem.writeFile({
    path: ATTEMPTS_FILE,
    directory: Directory.Data,
    data: content,
    encoding: Encoding.UTF8,
  });
}

function backoffMs(fails: number): number {
  const idx = Math.min(fails, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[idx]!;
}

export type UnlockMethod = "master" | "mpin";

export interface RateLimitCheck {
  allowed: boolean;
  waitSeconds: number;
  mpinWiped?: boolean;
}

export class UnlockRateLimiter {
  private state: AttemptsState | null = null;

  private async load(): Promise<AttemptsState> {
    if (!this.state) {
      this.state = await readState();
    }
    return this.state;
  }

  private async persist(): Promise<void> {
    if (this.state) await writeState(this.state);
  }

  async checkAllowed(method: UnlockMethod): Promise<RateLimitCheck> {
    const s = await this.load();
    const now = Date.now();

    if (method === "mpin") {
      if (s.mpinFails >= MPIN_WIPE_THRESHOLD) {
        return { allowed: false, waitSeconds: 0, mpinWiped: true };
      }
      if (s.mpinLockedUntil) {
        const until = new Date(s.mpinLockedUntil).getTime();
        if (now < until) {
          return { allowed: false, waitSeconds: Math.ceil((until - now) / 1000) };
        }
      }
      if (s.mpinLastFail) {
        const last = new Date(s.mpinLastFail).getTime();
        const wait = backoffMs(s.mpinFails);
        if (now - last < wait) {
          return {
            allowed: false,
            waitSeconds: Math.ceil((wait - (now - last)) / 1000),
          };
        }
      }
      return { allowed: true, waitSeconds: 0 };
    }

    // master password
    if (s.masterLockedUntil) {
      const until = new Date(s.masterLockedUntil).getTime();
      if (now < until) {
        return { allowed: false, waitSeconds: Math.ceil((until - now) / 1000) };
      }
    }
    if (s.masterLastFail) {
      const last = new Date(s.masterLastFail).getTime();
      const wait = backoffMs(s.masterFails);
      if (now - last < wait) {
        return {
          allowed: false,
          waitSeconds: Math.ceil((wait - (now - last)) / 1000),
        };
      }
    }
    return { allowed: true, waitSeconds: 0 };
  }

  /**
   * Record a failed attempt. Returns true if MPIN was wiped.
   */
  async recordFailure(method: UnlockMethod): Promise<boolean> {
    const s = await this.load();
    const now = new Date().toISOString();

    if (method === "mpin") {
      s.mpinFails += 1;
      s.mpinLastFail = now;
      if (s.mpinFails >= MPIN_WIPE_THRESHOLD) {
        // Wipe MPIN from device storage.
        await deleteMpinWrap();
        await this.persist();
        return true;
      }
    } else {
      s.masterFails += 1;
      s.masterLastFail = now;
      if (s.masterFails >= MASTER_LOCKOUT_THRESHOLD) {
        s.masterLockedUntil = new Date(
          Date.now() + MASTER_LOCKOUT_MS,
        ).toISOString();
      }
    }

    await this.persist();
    return false;
  }

  async recordSuccess(method: UnlockMethod): Promise<void> {
    const s = await this.load();
    if (method === "mpin") {
      s.mpinFails = 0;
      s.mpinLastFail = null;
      s.mpinLockedUntil = null;
    } else {
      s.masterFails = 0;
      s.masterLastFail = null;
      s.masterLockedUntil = null;
    }
    await this.persist();
  }

  /** Reset all attempt counters (e.g., after vault reset). */
  async resetAll(): Promise<void> {
    this.state = { ...EMPTY_STATE };
    await this.persist();
  }
}
