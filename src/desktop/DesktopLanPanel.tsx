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
              : "Starts automatically on launch. Phone scans and syncs on the same Wi-Fi when changes are detected."}
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
      </div>

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
