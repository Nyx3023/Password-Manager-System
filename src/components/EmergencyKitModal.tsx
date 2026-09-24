import { useState } from "react";
import { Modal } from "./Modal";
import { CURRENT_APP_VERSION, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } from "@/shared/updateService";

interface EmergencyKitModalProps {
  open: boolean;
  onClose: () => void;
  ownerEmail?: string;
  mpinEnabled?: boolean;
  profileCount?: number;
}

export function EmergencyKitModal({
  open,
  onClose,
  ownerEmail,
  mpinEnabled = false,
  profileCount = 1,
}: EmergencyKitModalProps) {
  const [downloaded, setDownloaded] = useState(false);

  if (!open) return null;

  const todayStr = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const repoUrl = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const textContent = `================================================================================
                    SECUREX EMERGENCY ACCESS KIT
                Offline Vault Recovery & Credentials Record
================================================================================

DATE GENERATED: ${todayStr}
SECUREX VERSION: v${CURRENT_APP_VERSION}
VAULT IDENTIFIER: ${ownerEmail || "Offline Local Vault"}
OFFICIAL REPOSITORY: ${repoUrl}
PROFILES IN VAULT: ${profileCount}
DEVICE MPIN PROTECTION: ${mpinEnabled ? "Configured" : "None"}

--------------------------------------------------------------------------------
CRITICAL SECURITY NOTICE:
Store this document in a secure, fireproof physical safe or lockbox.
Anyone who obtains this sheet along with your encrypted backup or device
can access your passwords. Never upload or take unencrypted photos of this sheet.
--------------------------------------------------------------------------------

1. MASTER ENCRYPTION PASSWORD
Write clearly in permanent ink below:

[ __________________________________________________________________________ ]

Note: SecureX utilizes zero-knowledge Argon2id + AES-256-GCM encryption.
Your master password is never sent to any server. If you forget it, it CANNOT
be recovered by anyone.

2. MASTER PIN (MPIN - 8 Digits)
[ ___ ___ ___ ___ ___ ___ ___ ___ ]

3. MASTER PASSWORD HINT (Optional)
[ __________________________________________________________________________ ]

--------------------------------------------------------------------------------
VAULT RESTORATION INSTRUCTIONS:
--------------------------------------------------------------------------------
Step 1: Download and install the latest SecureX release for your operating system:
        ${repoUrl}/releases

Step 2: If restoring an offline vault, locate your latest encrypted .pms backup.
        If using Google Cloud Sync, sign in to your connected Google Account.

Step 3: When prompted, select "Restore from .pms backup" or unlock your cloud vault.

Step 4: Enter the Master Encryption Password recorded on this sheet to decrypt
        and restore all credentials, notes, and 2FA TOTP authenticators.
================================================================================
`;

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SecureX-Emergency-Kit-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  return (
    <Modal title="Emergency Recovery Kit" open={open} onClose={onClose} wide>
      <div className="emergency-kit-container">
        {/* On-screen control buttons */}
        <div className="emergency-kit-actions emergency-kit-no-print">
          <p className="muted small" style={{ margin: 0 }}>
            Print or save your recovery sheet. Store the printed document in a secure physical location.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="primary" onClick={handlePrint}>
              🖨️ Print Sheet
            </button>
            <button type="button" className="ghost" onClick={handleDownload}>
              {downloaded ? "✓ Downloaded" : "💾 Download Text"}
            </button>
          </div>
        </div>

        {/* Printable Sheet */}
        <div className="emergency-kit-sheet emergency-kit-print" id="emergency-sheet-print">
          <div className="emergency-sheet-header">
            <div className="emergency-sheet-brand">
              <span className="emergency-sheet-logo" aria-hidden="true">🔐</span>
              <div>
                <h2 className="emergency-sheet-title">SECUREX EMERGENCY ACCESS KIT</h2>
                <span className="emergency-sheet-subtitle">Offline Vault Recovery & Credentials Record</span>
              </div>
            </div>
            <div className="emergency-sheet-badge">OFFICIAL RECOVERY RECORD</div>
          </div>

          <div className="emergency-sheet-warning">
            <strong>CRITICAL SECURITY WARNING:</strong> Keep this sheet in a safe, fireproof lockbox or with a trusted family member. Anyone who finds this sheet along with your encrypted backup can decrypt your credentials.
          </div>

          <div className="emergency-sheet-grid">
            <div className="emergency-sheet-field">
              <span className="emergency-field-label">VAULT / ACCOUNT</span>
              <span className="emergency-field-value">{ownerEmail || "Offline Local Vault"}</span>
            </div>
            <div className="emergency-sheet-field">
              <span className="emergency-field-label">DATE GENERATED</span>
              <span className="emergency-field-value">{todayStr}</span>
            </div>
            <div className="emergency-sheet-field">
              <span className="emergency-field-label">SECUREX VERSION</span>
              <span className="emergency-field-value">v{CURRENT_APP_VERSION}</span>
            </div>
            <div className="emergency-sheet-field">
              <span className="emergency-field-label">PROFILES / USERS</span>
              <span className="emergency-field-value">{profileCount} Profile{profileCount !== 1 ? "s" : ""}</span>
            </div>
          </div>

          <div className="emergency-sheet-section">
            <div className="emergency-section-header">
              <span className="emergency-section-num">1</span>
              <div>
                <strong>MASTER ENCRYPTION PASSWORD</strong>
                <p className="emergency-section-desc">Write your master password clearly in permanent ink below. SecureX cannot recover a forgotten password.</p>
              </div>
            </div>
            <div className="emergency-writein-box">
              <div className="emergency-writein-line" />
            </div>
          </div>

          <div className="emergency-sheet-columns">
            <div className="emergency-sheet-section" style={{ flex: 1 }}>
              <div className="emergency-section-header">
                <span className="emergency-section-num">2</span>
                <div>
                  <strong>MASTER PIN (MPIN)</strong>
                  <p className="emergency-section-desc">8-digit local device unlock code</p>
                </div>
              </div>
              <div className="emergency-mpin-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="emergency-mpin-cell" />
                ))}
              </div>
            </div>

            <div className="emergency-sheet-section" style={{ flex: 1 }}>
              <div className="emergency-section-header">
                <span className="emergency-section-num">3</span>
                <div>
                  <strong>PASSWORD HINT (OPTIONAL)</strong>
                  <p className="emergency-section-desc">Clue that only you understand</p>
                </div>
              </div>
              <div className="emergency-writein-box">
                <div className="emergency-writein-line" />
              </div>
            </div>
          </div>

          <div className="emergency-sheet-section">
            <div className="emergency-section-header">
              <span className="emergency-section-num">4</span>
              <div>
                <strong>VAULT RESTORATION PROCEDURE</strong>
                <p className="emergency-section-desc">Steps to regain access if your device is lost or damaged</p>
              </div>
            </div>
            <ol className="emergency-instructions-list">
              <li>
                <strong>Download SecureX:</strong> Reinstall from the official GitHub Releases page at:
                <br />
                <code className="emergency-code">{repoUrl}/releases</code>
              </li>
              <li>
                <strong>Locate Vault Data:</strong> Locate your latest encrypted <code>.pms</code> backup file (or sign in to Google Cloud Sync if configured).
              </li>
              <li>
                <strong>Restore & Unlock:</strong> Choose &quot;Import / Restore Vault&quot;, select the backup file, and enter the Master Password written on this sheet.
              </li>
            </ol>
          </div>

          <div className="emergency-sheet-footer">
            <span>SecureX Zero-Knowledge Architecture • Argon2id Derivation • AES-256-GCM Encryption</span>
            <span>https://github.com/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
