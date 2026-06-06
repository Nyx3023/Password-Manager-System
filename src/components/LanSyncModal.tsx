import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectToPc,
  isLanPaired,
  loadLanPrefs,
  loadLanToken,
  markLanPaired,
  pairWithPc,
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
  const [discoveredPc, setDiscoveredPc] = useState<{ ip: string; port: number; code?: string } | null>(
    null,
  );
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHost, setManualHost] = useState("");
  const [manualPort, setManualPort] = useState("9847");
  const [pairingCode, setPairingCode] = useState("");
  const [needsPairing, setNeedsPairing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "connect" | "pair" | "pull" | "push">("idle");
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
    setNeedsPairing(false);
  }, []);

  const runPair = useCallback(
    async (host: string, port: number, code: string) => {
      setError(null);
      setPhase("pair");
      setVisual("syncing");
      setProgressLabel("Pairing with PC...");

      try {
        const result = await pairWithPc(host, port, code);
        if (!result.ok) {
          setError(result.message);
          setVisual("error", 3500);
          return;
        }
        // Pairing succeeded — now connect.
        const conn = await connectToPc(host, port);
        applyConnection(conn);
        setVisual("idle");
        props.onMessage("Paired successfully!");
      } catch (e) {
        const msg = e instanceof Error ? formatLanError(e.message) : "Pairing failed.";
        setError(msg);
        setVisual("error", 3500);
      } finally {
        setPhase("idle");
        setProgressLabel("");
      }
    },
    [applyConnection, setVisual, props.onMessage],
  );

  const runConnect = useCallback(
    async (host: string, port: number) => {
      const validation = validateLanEndpoint(host, port);
      if (validation) {
        setError(validation);
        setVisual("error", 3500);
        return;
      }

      // If we don't have a token, show pairing UI.
      if (!loadLanToken()) {
        setNeedsPairing(true);
        setManualHost(host);
        setManualPort(String(port));
        setManualOpen(true);
        setScanning(false);
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
        if (msg.includes("Authentication failed") || msg.includes("Re-pair")) {
          setNeedsPairing(true);
          setManualOpen(true);
        }
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
      setNeedsPairing(false);
      setPairingCode("");
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
    // If the beacon includes a pairing code, auto-fill it.
    if (discoveredPc.code) {
      setPairingCode(discoveredPc.code);
    }
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
    if (needsPairing && pairingCode.trim()) {
      void runPair(host, port, pairingCode.trim());
    } else {
      void runConnect(host, port);
    }
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
          Same Wi-Fi as the PC. Enter the pairing code shown on the desktop app.
        </p>

        {scanning && !connection && phase === "idle" && !discoveredPc && (
          <div className="lan-sync-scan live-scan">
            <div className="radar-pulse"></div>
            <LoadingIndicator variant="compact" label="Searching for nearby PC..." />
          </div>
        )}

        {discoveredPc && !connection && phase !== "connect" && !needsPairing && (
          <div className="lan-sync-discovered-card">
            <p className="label-mono center-text" style={{ color: 'var(--success)' }}>
              <span className="live-dot" aria-hidden></span> PC DETECTED
            </p>
            <button
              type="button"
              className="primary block lan-sync-detected-btn"
              disabled={busy}
              onClick={() => void runConnect(discoveredPc.ip, discoveredPc.port)}
            >
              Connect to {discoveredPc.ip}:{discoveredPc.port}
            </button>
          </div>
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
              <span className="label-mono">
                {needsPairing ? "PAIR WITH PC" : "MANUAL"}
              </span>
              <button
                type="button"
                className="ghost small"
                disabled={busy}
                onClick={() => { setManualOpen(false); setNeedsPairing(false); }}
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

            {needsPairing && (
              <label>
                Pairing code (from desktop app)
                <input
                  className="lan-sync-manual-field"
                  type="text"
                  inputMode="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A3B7K2"
                  disabled={inputLocked}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={6}
                  style={{ letterSpacing: "0.2em", fontFamily: "monospace", fontSize: "1.2em", textAlign: "center" }}
                />
              </label>
            )}

            <button
              type="button"
              className={needsPairing ? "primary block" : "ghost block"}
              disabled={busy || (needsPairing && pairingCode.trim().length < 6)}
              onClick={handleManualConnect}
            >
              {needsPairing ? "Pair & Connect" : "Connect"}
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
