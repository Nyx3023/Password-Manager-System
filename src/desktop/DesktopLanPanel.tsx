import type { TrayStatus } from "@/shared/electron.d";



export interface DesktopLanPanelProps {

  status: TrayStatus | null;

  busy?: boolean;

  onRefresh: () => void | Promise<void>;

  onStart: () => void | Promise<void>;

  onStop: () => void | Promise<void>;

  onNewPairingCode: () => void | Promise<void>;

  onCopyAddress: (address: string) => void;

  onCopyPairingCode: (code: string) => void;

  onReloadVault?: () => void | Promise<void>;

}



function formatSyncTime(iso: string | null): string {

  if (!iso) return "Never";

  try {

    return new Date(iso).toLocaleString();

  } catch {

    return iso;

  }

}



export function DesktopLanPanel(props: DesktopLanPanelProps) {

  const st = props.status;

  const running = st?.running ?? false;

  const pairingCode = st?.pairingCode ?? null;

  const lanAddresses = st?.addresses ?? [];



  return (

    <section className="settings-group desktop-lan-panel">

      <div className="desktop-lan-header">

        <div>

          <p className="label-mono desktop-lan-title">LAN SYNC (PC HOST)</p>

          <p className="muted small">

            Phone and PC must use the same Wi-Fi. Start the server, then sync

            from the Android app.

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

            {formatSyncTime(st?.lastSyncAt ?? null)}

          </span>

        </div>

      </div>



      {running && (

        <div className="desktop-lan-addresses">

          <p className="label-mono">PC IP FOR PHONE</p>

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



      {running && (

        <div className="desktop-lan-code-block">

          <p className="label-mono">PAIRING CODE</p>

          <p className="desktop-lan-code" aria-live="polite">

            {pairingCode ?? "Expired - generate a new code"}

          </p>

          {pairingCode && (

            <button

              type="button"

              className="ghost small"

              onClick={() => props.onCopyPairingCode(pairingCode)}

            >

              Copy code

            </button>

          )}

          <p className="muted small desktop-lan-code-hint">

            Code expires in about 10 minutes. Enter it on the phone sync screen.

          </p>

        </div>

      )}



      {st?.error && (

        <p className="error small desktop-lan-error">{st.error}</p>

      )}



      <div className="desktop-lan-actions">

        <button

          type="button"

          className="ghost"

          onClick={() => void props.onRefresh()}

        >

          Refresh status

        </button>

        {running ? (

          <>

            <button

              type="button"

              className="ghost"

              disabled={props.busy}

              onClick={() => void props.onNewPairingCode()}

            >

              New pairing code

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

          <button

            type="button"

            className="primary"

            onClick={() => void props.onStart()}

          >

            Start LAN server

          </button>

        )}

        {props.onReloadVault && (

          <button

            type="button"

            className="ghost"

            disabled={props.busy}

            onClick={() => void props.onReloadVault?.()}

          >

            Reload vault from disk

          </button>

        )}

      </div>

    </section>

  );

}

