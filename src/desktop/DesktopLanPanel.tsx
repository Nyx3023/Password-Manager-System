import { useState } from "react";
import type { TrayStatus } from "@/shared/electron.d";
import { formatLastSync } from "@/shared/syncTime";

export interface DesktopLanPanelProps {
  status: TrayStatus | null;
  busy?: boolean;
  isPhone?: boolean;
  onRefresh: () => void | Promise<void>;
  onStart?: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onCopyAddress: (address: string) => void;
}

export function DesktopLanPanel(props: DesktopLanPanelProps) {
  const st = props.status;
  const running = st?.running ?? false;
  const lanAddresses = st?.addresses ?? [];
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);

  const handleStartPairing = async () => {
    if (!window.electronAPI?.startLanPairing) return;
    setPairingBusy(true);
    try {
      const result = await window.electronAPI.startLanPairing();
      setPairingCode(result.code);
    } catch {
      setPairingCode(null);
    } finally {
      setPairingBusy(false);
    }
  };

  const handleStopPairing = async () => {
    if (!window.electronAPI?.stopLanPairing) return;
    await window.electronAPI.stopLanPairing();
    setPairingCode(null);
  };

  const handleUnpair = async () => {
    if (!window.electronAPI?.unpairLan) return;
    await window.electronAPI.unpairLan();
    setPairingCode(null);
    void props.onRefresh();
  };

  return (
    <section className="settings-group desktop-lan-panel">
      <div className="desktop-lan-header">
        <div>
          <p className="label-mono desktop-lan-title">
            {props.isPhone ? "LAN SYNC (PHONE HOST)" : "LAN SYNC (PC HOST)"}
          </p>
          <p className="muted small">
            {props.isPhone
              ? "Starts when toggled. PC or other devices scan and sync on the same Wi-Fi."
              : "Start the server, then pair your phone using the pairing code."}
          </p>
        </div>
        <span
          className={`desktop-lan-badge${running ? " desktop-lan-badge--on" : ""}`}
        >
          {running ? "Running" : "Stopped"}
        </span>
      </div>

      <div className="desktop-lan-meta">
        <div className="desktop-lan-row">
          <span className="muted small">Port</span>
          <span className="desktop-lan-value">{st?.port ?? 9847}</span>
        </div>
        <div className="desktop-lan-row">
          <span className="muted small">Last sync</span>
          <span className="desktop-lan-value">
            {formatLastSync(st?.lastSyncAt ?? null)}
          </span>
        </div>
        <div className="desktop-lan-row">
          <span className="muted small">Paired</span>
          <span className="desktop-lan-value">
            {st?.paired ? "✅ Yes" : "❌ No"}
          </span>
        </div>
      </div>

      {/* Pairing code display */}
      {running && pairingCode && (
        <div className="desktop-lan-pairing" style={{
          margin: "0.75rem 0",
          padding: "1rem",
          borderRadius: "8px",
          background: "rgba(255, 68, 56, 0.08)",
          border: "1px solid rgba(255, 68, 56, 0.25)",
          textAlign: "center",
        }}>
          <p className="label-mono" style={{ marginBottom: "0.5rem" }}>
            PAIRING CODE
          </p>
          <p style={{
            fontSize: "2rem",
            fontFamily: "monospace",
            fontWeight: "bold",
            letterSpacing: "0.3em",
            color: "#ff4438",
            margin: "0.5rem 0",
            userSelect: "all",
          }}>
            {pairingCode}
          </p>
          <p className="muted small">
            Enter this code on your phone to pair. Expires in 2 minutes.
          </p>
          <button
            type="button"
            className="ghost small"
            onClick={() => void handleStopPairing()}
            style={{ marginTop: "0.5rem" }}
          >
            Cancel pairing
          </button>
        </div>
      )}

      {running && (
        <div className="desktop-lan-addresses">
          <p className="label-mono">{props.isPhone ? "PHONE IP" : "PC IP FOR PHONE"}</p>
          <p className="muted small desktop-lan-addr-hint">
            Optional: use Manual connect if auto-scan does not find this host.
          </p>
          {lanAddresses.length === 0 ? (
            <p className="muted small">No Wi-Fi or Ethernet adapter found.</p>
          ) : (
            <ul className="desktop-lan-ip-list">
              {lanAddresses.map((addr) => (
                <li key={`${addr.label}-${addr.ip}`} className="desktop-lan-ip-row">
                  <span className="desktop-lan-ip">{addr.ip}</span>
                  <span className="muted small desktop-lan-ip-label">
                    {addr.label}
                  </span>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => props.onCopyAddress(addr.address)}
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {st?.error && (
        <p className="error small desktop-lan-error">{st.error}</p>
      )}

      <div className="desktop-lan-actions">
        {running ? (
          <>
            <button
              type="button"
              className="primary"
              disabled={pairingBusy || !!pairingCode}
              onClick={() => void handleStartPairing()}
            >
              {pairingCode ? "Pairing active..." : "Start Pairing"}
            </button>
            {st?.paired && (
              <button
                type="button"
                className="ghost"
                onClick={() => void handleUnpair()}
              >
                Unpair all devices
              </button>
            )}
            <button
              type="button"
              className="ghost"
              onClick={() => void props.onRefresh()}
            >
              Refresh status
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void props.onStop()}
            >
              Stop server
            </button>
          </>
        ) : (
          props.onStart && (
            <button
              type="button"
              className="primary"
              onClick={() => void props.onStart?.()}
            >
              Start LAN Server
            </button>
          )
        )}
      </div>
    </section>
  );
}
