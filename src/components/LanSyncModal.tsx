import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectToPc,
  isLanPaired,
  loadLanPrefs,
  markLanPaired,
  parseLanEndpoint,
  type PcConnection,
  validateLanEndpoint,
} from "@/shared/lanSync";
import { startPcDiscovery } from "@/shared/vaultLanHttp";
import { LoadingIndicator } from "./LoadingIndicator";
import { Modal } from "./Modal";
import type { SyncIconState } from "./SyncIcon";

interface LanSyncModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSyncVisual?: (state: SyncIconState) => void;
  onPull: (host: string, port: number) => Promise<{ ok: boolean; message: string }>;
  onPush: (
    host: string,
    port: number,
    force?: boolean,
  ) => Promise<{ ok: boolean; message: string }>;
  onMessage: (message: string) => void;
}

export function LanSyncModal(props: LanSyncModalProps) {
  const [connection, setConnection] = useState<PcConnection | null>(null);
  const [discoveredPc, setDiscoveredPc] = useState<{ ip: string; port: number } | null>(
    null,
  );
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHost, setManualHost] = useState("");
  const [manualPort, setManualPort] = useState("9847");
  const [scanning, setScanning] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "connect" | "pull" | "push">("idle");
  const [progressLabel, setProgressLabel] = useState("");
  const visualTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectAttempted = useRef(false);

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

  const applyConnection = useCallback((conn: PcConnection) => {
    setConnection(conn);
    markLanPaired(conn.host, conn.port);
    setScanning(false);
    setStatusText(`Connected to ${conn.status.address}`);
    setError(null);
  }, []);

  const runConnect = useCallback(
    async (host: string, port: number) => {
      const validation = validateLanEndpoint(host, port);
      if (validation) {
        setError(validation);
        setVisual("error", 3500);
        return;
      }

      setError(null);
      setPhase("connect");
      setVisual("syncing");
      setProgressLabel("Connecting to PC...");

      try {
        const conn = await connectToPc(host, port);
        applyConnection(conn);
        setVisual("idle");
      } catch (e) {
        const msg =
          e instanceof Error ? formatLanError(e.message) : "Could not connect.";
        setError(msg);
        setStatusText(null);
        setConnection(null);
        setVisual("error", 3500);
      } finally {
        setPhase("idle");
        setProgressLabel("");
      }
    },
    [applyConnection, setVisual],
  );

  useEffect(() => {
    if (!props.open) {
      connectAttempted.current = false;
      setScanning(false);
      setDiscoveredPc(null);
      setManualOpen(false);
      return;
    }

    setConnection(null);
    setError(null);
    setStatusText(null);
    setScanning(true);
    connectAttempted.current = false;

    const prefs = loadLanPrefs();
    setManualHost(prefs.host);
    setManualPort(String(prefs.port));

    let cleanupFn: (() => void) | null = null;
    void startPcDiscovery((ip, port) => {
      setDiscoveredPc({ ip, port });
    }).then((cleanup) => {
      cleanupFn = cleanup;
    });

    if (prefs.host && isLanPaired()) {
      connectAttempted.current = true;
      void runConnect(prefs.host, prefs.port);
    }

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [props.open, runConnect]);

  useEffect(() => {
    if (!props.open || !discoveredPc || connection || connectAttempted.current) {
      return;
    }
    connectAttempted.current = true;
    void runConnect(discoveredPc.ip, discoveredPc.port);
  }, [props.open, discoveredPc, connection, runConnect]);

  useEffect(() => {
    return () => {
      if (visualTimer.current) clearTimeout(visualTimer.current);
    };
  }, []);

  const busy = phase !== "idle" || props.busy;
  const inputLocked = phase !== "idle";
  const ep = connection
    ? { host: connection.host, port: connection.port }
    : null;

  const handleManualConnect = () => {
    const { host, port } = parseLanEndpoint(manualHost, manualPort);
    void runConnect(host, port);
  };

  const handlePull = async () => {
    if (!ep) {
      setError("Connect to a PC first.");
      return;
    }

    setError(null);
    setPhase("pull");
    setVisual("syncing");
    setProgressLabel("Merging vault from PC...");

    try {
      const result = await props.onPull(ep.host, ep.port);
      if (result.ok) {
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
    if (!ep) {
      setError("Connect to a PC first.");
      return;
    }

    setError(null);
    setPhase("push");
    setVisual("syncing");
    setProgressLabel(
      force ? "Replacing PC vault..." : "Merging with PC, then uploading...",
    );

    try {
      const result = await props.onPush(ep.host, ep.port, force);
      if (result.ok) {
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
        <p className="muted small lan-sync-hint lan-sync-hint--compact">
          Same Wi-Fi as the PC. We scan for your desktop automatically.
        </p>

        {scanning && !connection && phase === "idle" && (
          <div className="lan-sync-scan">
            <LoadingIndicator variant="compact" label="Scanning for PC..." />
          </div>
        )}

        {discoveredPc && !connection && phase !== "connect" && (
          <button
            type="button"
            className="lan-sync-detected ghost block"
            disabled={busy}
            onClick={() => void runConnect(discoveredPc.ip, discoveredPc.port)}
          >
            <span className="label-mono">PC DETECTED</span>
            <span>
              {discoveredPc.ip}:{discoveredPc.port}
            </span>
          </button>
        )}

        {statusText && !busy && (
          <p className="lan-sync-status-box small lan-sync-status-box--compact lan-sync-ok-box">
            {statusText}
          </p>
        )}

        {error && !busy && (
          <p className="error lan-sync-status-box lan-sync-status-box--compact">
            {error}
          </p>
        )}

        {!manualOpen ? (
          <button
            type="button"
            className="ghost block lan-sync-manual-toggle"
            disabled={busy}
            onClick={() => setManualOpen(true)}
          >
            Manual connect
          </button>
        ) : (
          <div className="lan-sync-manual">
            <div className="lan-sync-manual-head">
              <span className="label-mono">MANUAL</span>
              <button
                type="button"
                className="ghost small"
                disabled={busy}
                onClick={() => setManualOpen(false)}
              >
                Hide
              </button>
            </div>
            <div className="lan-sync-row-2">
              <label>
                PC IP
                <input
                  className="lan-sync-manual-field"
                  type="text"
                  inputMode="decimal"
                  value={manualHost}
                  onChange={(e) => setManualHost(e.target.value)}
                  placeholder="192.168.1.42"
                  disabled={inputLocked}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <label>
                Port
                <input
                  className="lan-sync-manual-field"
                  type="text"
                  inputMode="numeric"
                  value={manualPort}
                  onChange={(e) => setManualPort(e.target.value)}
                  placeholder="9847"
                  disabled={inputLocked}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </label>
            </div>
            <button
              type="button"
              className="ghost block"
              disabled={busy}
              onClick={handleManualConnect}
            >
              Connect
            </button>
          </div>
        )}

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

        <div className="lan-sync-actions lan-sync-actions--compact">
          <button
            type="button"
            className="primary block"
            disabled={busy || !connection}
            onClick={() => void handlePull()}
          >
            Merge from PC
          </button>
          <button
            type="button"
            className="ghost block"
            disabled={busy || !connection}
            onClick={() => void handlePush(false)}
          >
            Merge to PC
          </button>
          <button
            type="button"
            className="ghost block"
            disabled={busy || !connection}
            onClick={() => void handlePush(true)}
          >
            Force push (replaces PC)
          </button>
        </div>
        <p className="muted small lan-sync-hint lan-sync-hint--compact">
          Phone and PC must use the same master password (same .pms backup). Push
          merges first; force push overwrites the PC vault.
        </p>
      </div>
    </Modal>
  );
}

function formatLanError(message: string): string {
  if (message.includes("Invalid host") || message.includes("http://:")) {
    return "Could not reach the PC. Try Manual connect with the desktop IP.";
  }
  return message;
}
