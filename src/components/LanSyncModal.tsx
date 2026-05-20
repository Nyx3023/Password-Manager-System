import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPcStatus,
  isLanPaired,
  loadLanPrefs,
  markLanPaired,
  parseLanEndpoint,
  saveLanPrefs,
  validateLanEndpoint,
} from "@/shared/lanSync";
import { LoadingIndicator } from "./LoadingIndicator";
import { Modal } from "./Modal";
import type { SyncIconState } from "./SyncIcon";

interface LanSyncModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSyncVisual?: (state: SyncIconState) => void;
  onPull: (
    host: string,
    port: number,
    code: string,
  ) => Promise<{ ok: boolean; message: string }>;
  onPush: (
    host: string,
    port: number,
    code: string,
    force?: boolean,
  ) => Promise<{ ok: boolean; message: string }>;
  onMessage: (message: string) => void;
}

function readPrefsFields() {
  const prefs = loadLanPrefs();
  return {
    host: prefs.host,
    port: String(prefs.port),
    code: prefs.code,
  };
}

export function LanSyncModal(props: LanSyncModalProps) {
  const initial = readPrefsFields();
  const [lanHost, setLanHost] = useState(initial.host);
  const [lanPort, setLanPort] = useState(initial.port);
  const [lanCode, setLanCode] = useState(initial.code);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "status" | "pull" | "push">("idle");
  const [progressLabel, setProgressLabel] = useState("");
  const [paired, setPaired] = useState(() => isLanPaired());
  const autoChecked = useRef(false);
  const visualTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setVisual = useCallback(
    (state: SyncIconState, revertMs?: number) => {
      props.onSyncVisual?.(state);
      if (visualTimer.current) {
        clearTimeout(visualTimer.current);
        visualTimer.current = null;
      }
      if (revertMs !== undefined && revertMs > 0) {
        visualTimer.current = setTimeout(() => {
          props.onSyncVisual?.("idle");
          visualTimer.current = null;
        }, revertMs);
      }
    },
    [props.onSyncVisual],
  );

  const getEndpoint = useCallback(() => {
    const host = lanHost.trim() || loadLanPrefs().host;
    const port = lanPort.trim() || String(loadLanPrefs().port);
    return parseLanEndpoint(host, port);
  }, [lanHost, lanPort]);

  const persistFields = useCallback(
    (host: string, port: number, code: string) => {
      setLanHost(host);
      setLanPort(String(port));
      setLanCode(code);
      saveLanPrefs(host, port, code);
    },
    [],
  );

  const runStatusCheck = useCallback(
    async (endpoint?: { host: string; port: number }) => {
      const ep = endpoint ?? getEndpoint();
      const validation = validateLanEndpoint(ep.host, ep.port);
      if (validation) {
        setError(validation);
        setStatusText(null);
        setStatusOk(false);
        setVisual("error", 3500);
        return;
      }

      setError(null);
      setPhase("status");
      setVisual("syncing");
      setProgressLabel("Checking PC...");

      let failed = false;
      try {
        const st = await fetchPcStatus(ep.host, ep.port);
        const online = st.running;
        setStatusOk(online);
        setStatusText(
          online ? `PC online at ${st.address}` : "PC LAN server is off on that address.",
        );
        if (online) {
          const prefs = loadLanPrefs();
          persistFields(ep.host, ep.port, lanCode.trim() || prefs.code);
        }
      } catch (e) {
        failed = true;
        const msg =
          e instanceof Error ? formatLanError(e.message) : "Status check failed.";
        setError(msg);
        setStatusText(null);
        setStatusOk(false);
        setVisual("error", 3500);
      } finally {
        setPhase("idle");
        setProgressLabel("");
        if (!failed) setVisual("idle");
      }
    },
    [getEndpoint, lanCode, persistFields, setVisual],
  );

  useEffect(() => {
    if (!props.open) {
      autoChecked.current = false;
      return;
    }

    const prefs = readPrefsFields();
    setLanHost(prefs.host);
    setLanPort(prefs.port);
    setLanCode(prefs.code);
    setPaired(isLanPaired());
    setError(null);
    setStatusText(null);
    setStatusOk(false);

    if (autoChecked.current || !prefs.host.trim()) return;
    autoChecked.current = true;

    const ep = parseLanEndpoint(prefs.host, prefs.port);
    void runStatusCheck(ep);
  }, [props.open, runStatusCheck]);

  useEffect(() => {
    return () => {
      if (visualTimer.current) clearTimeout(visualTimer.current);
    };
  }, []);

  const busy = phase !== "idle" || props.busy;
  const inputLocked = phase !== "idle";

  const handlePull = async () => {
    const ep = getEndpoint();
    const code = lanCode.trim() || loadLanPrefs().code;
    const validation = validateLanEndpoint(ep.host, ep.port, code);
    if (validation) {
      setError(validation);
      setVisual("error", 3500);
      return;
    }

    setError(null);
    setPhase("pull");
    setVisual("syncing");
    setProgressLabel("Downloading vault from PC...");

    try {
      persistFields(ep.host, ep.port, code);
      const result = await props.onPull(ep.host, ep.port, code);
      if (result.ok) {
        markLanPaired(ep.host, ep.port, code);
        setPaired(true);
        setVisual("success", 2500);
        props.onClose();
        props.onMessage(result.message);
      } else {
        setError(formatLanError(result.message));
        setVisual("error", 3500);
      }
    } catch (e) {
      setError(formatLanError(e instanceof Error ? e.message : "Pull failed."));
      setVisual("error", 3500);
    } finally {
      setPhase("idle");
      setProgressLabel("");
    }
  };

  const handlePush = async (force = false) => {
    const ep = getEndpoint();
    const code = lanCode.trim() || loadLanPrefs().code;
    const validation = validateLanEndpoint(ep.host, ep.port, code);
    if (validation) {
      setError(validation);
      setVisual("error", 3500);
      return;
    }

    setError(null);
    setPhase("push");
    setVisual("syncing");
    setProgressLabel(force ? "Force pushing to PC..." : "Uploading vault to PC...");

    try {
      persistFields(ep.host, ep.port, code);
      const result = await props.onPush(ep.host, ep.port, code, force);
      if (result.ok) {
        markLanPaired(ep.host, ep.port, code);
        setPaired(true);
        setVisual("success", 2500);
        props.onClose();
        props.onMessage(result.message);
      } else {
        setError(formatLanError(result.message));
        setVisual("error", 3500);
      }
    } catch (e) {
      setError(formatLanError(e instanceof Error ? e.message : "Push failed."));
      setVisual("error", 3500);
    } finally {
      setPhase("idle");
      setProgressLabel("");
    }
  };

  return (
    <Modal
      title="Sync with PC"
      open={props.open}
      onClose={props.onClose}
      compact
    >
      <div className="lan-sync-panel lan-sync-panel--compact">
        {paired && statusOk && (
          <p className="lan-sync-paired-inline">Saved PC connection</p>
        )}

        <p className="muted small lan-sync-hint lan-sync-hint--compact">
          Same Wi-Fi. PC IP from desktop Settings. Code refreshes every 10 min.
        </p>

        <div className="lan-sync-fields lan-sync-fields--compact">
          <label>
            PC IP
            <input
              type="text"
              inputMode="decimal"
              value={lanHost}
              onChange={(e) => setLanHost(e.target.value)}
              placeholder="192.168.1.42"
              disabled={inputLocked}
              readOnly={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </label>
          <div className="lan-sync-row-2">
            <label>
              Port
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={lanPort}
                onChange={(e) => setLanPort(e.target.value)}
                placeholder="9847"
                disabled={inputLocked}
                autoComplete="off"
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <label>
              Code
              <input
                type="text"
                inputMode="numeric"
                value={lanCode}
                onChange={(e) => setLanCode(e.target.value)}
                placeholder="6 digits"
                disabled={inputLocked}
                autoComplete="off"
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
          </div>
        </div>

        {busy && (
          <div className="lan-sync-progress">
            <div className="lan-sync-progress-track" aria-hidden>
              <span className="lan-sync-progress-fill" />
            </div>
            <LoadingIndicator
              variant="compact"
              label={progressLabel || "Working..."}
            />
          </div>
        )}

        {statusText && !busy && (
          <p
            className={`lan-sync-status-box small lan-sync-status-box--compact${
              statusOk ? " lan-sync-ok-box" : ""
            }`}
          >
            {statusText}
          </p>
        )}

        {error && !busy && (
          <p className="error lan-sync-status-box lan-sync-status-box--compact">
            {error}
          </p>
        )}

        <div className="lan-sync-actions lan-sync-actions--compact">
          <button
            type="button"
            className="ghost block"
            disabled={busy}
            onClick={() => void runStatusCheck()}
          >
            Check status
          </button>
          <button
            type="button"
            className="primary block"
            disabled={busy}
            onClick={() => void handlePull()}
          >
            Pull from PC
          </button>
          <button
            type="button"
            className="ghost block"
            disabled={busy}
            onClick={() => void handlePush(false)}
          >
            Push to PC
          </button>
          <button
            type="button"
            className="ghost block"
            disabled={busy}
            onClick={() => void handlePush(true)}
          >
            Force push
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatLanError(message: string): string {
  if (message.includes("Invalid host") || message.includes("http://:")) {
    return "Enter a valid PC IP address (example: 192.168.1.42).";
  }
  return message;
}
