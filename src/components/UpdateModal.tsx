import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import {
  checkForAppUpdates,
  CURRENT_APP_VERSION,
  GITHUB_REPO_OWNER,
  GITHUB_REPO_NAME,
  type UpdateCheckResult,
} from "@/shared/updateService";
import { isDesktopApp } from "@/shared/platform";

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  onMessage?: (msg: string) => void;
}

export function UpdateModal({ open, onClose, onMessage }: UpdateModalProps) {
  const isDesktop = isDesktopApp();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [readyToInstall, setReadyToInstall] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      void runCheck();
    } else {
      setErrorMsg(null);
    }
  }, [open]);

  useEffect(() => {
    if (!isDesktop || !window.electronAPI) return;

    const unsubs: (() => void)[] = [];

    if (window.electronAPI.onUpdateProgress) {
      unsubs.push(
        window.electronAPI.onUpdateProgress((prog) => {
          setDownloading(true);
          setDownloadPercent(prog.percent);
        }),
      );
    }

    if (window.electronAPI.onUpdateDownloaded) {
      unsubs.push(
        window.electronAPI.onUpdateDownloaded(() => {
          setDownloading(false);
          setReadyToInstall(true);
          onMessage?.("Update downloaded! Click restart to apply.");
        }),
      );
    }

    if (window.electronAPI.onUpdateError) {
      unsubs.push(
        window.electronAPI.onUpdateError((err) => {
          setDownloading(false);
          setErrorMsg(err);
        }),
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [isDesktop, onMessage]);

  const runCheck = async () => {
    setChecking(true);
    setErrorMsg(null);
    try {
      const res = await checkForAppUpdates();
      setResult(res);
      if (res.error) setErrorMsg(res.error);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to check for updates.");
    } finally {
      setChecking(false);
    }
  };

  const handleDesktopDownload = async () => {
    if (!window.electronAPI?.downloadUpdate) return;
    setDownloading(true);
    setErrorMsg(null);
    try {
      const res = await window.electronAPI.downloadUpdate();
      if (!res.ok && res.error) {
        setErrorMsg(res.error);
        setDownloading(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Download failed");
      setDownloading(false);
    }
  };

  const handleRestartAndInstall = () => {
    if (window.electronAPI?.quitAndInstall) {
      window.electronAPI.quitAndInstall();
    }
  };

  const handleOpenUrl = (url: string) => {
    if (isDesktop && window.electronAPI?.openUrl) {
      window.electronAPI.openUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Modal title="App Updates" open={open} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Version info badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#111",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #222",
          }}
        >
          <div>
            <div style={{ fontSize: "0.8rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Current Version
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, fontFamily: "monospace", color: "#fff", marginTop: "2px" }}>
              v{CURRENT_APP_VERSION}
            </div>
          </div>

          <button
            type="button"
            className="ghost small"
            disabled={checking || downloading}
            onClick={() => void runCheck()}
          >
            {checking ? "Checking..." : "Check Now"}
          </button>
        </div>

        {/* Repository info */}
        <div style={{ fontSize: "0.8rem", color: "#777", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>Source:</span>
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              color: "#ff4438",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
            onClick={() =>
              handleOpenUrl(
                `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
              )
            }
          >
            {GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}
          </button>
        </div>

        {/* Status Display */}
        {checking && (
          <div style={{ textAlign: "center", padding: "1.5rem 0", color: "#aaa" }}>
            <div style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>🔄</div>
            <div>Checking GitHub Releases for updates...</div>
          </div>
        )}

        {!checking && result && !result.hasUpdate && !errorMsg && (
          <div
            style={{
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "8px",
              padding: "16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "1.5rem", marginBottom: "6px" }}>✓</div>
            <div style={{ fontWeight: 600, color: "#10b981", fontSize: "1rem" }}>
              SecureX is up to date
            </div>
            <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "4px" }}>
              You are running the latest version (v{CURRENT_APP_VERSION}).
            </div>
          </div>
        )}

        {!checking && result && result.hasUpdate && (
          <div
            style={{
              background: "rgba(255, 68, 56, 0.08)",
              border: "1px solid rgba(255, 68, 56, 0.3)",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span
                  style={{
                    background: "#ff4438",
                    color: "#fff",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                  }}
                >
                  New Version Available
                </span>
                <h4 style={{ margin: "6px 0 2px", fontSize: "1.1rem" }}>
                  {result.releaseTitle}
                </h4>
                <div style={{ fontSize: "0.75rem", color: "#888" }}>
                  Latest tag: v{result.latestVersion}
                </div>
              </div>
            </div>

            {/* Release Notes */}
            {result.releaseNotes && (
              <div
                style={{
                  background: "#111",
                  border: "1px solid #222",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  fontSize: "0.8rem",
                  maxHeight: "140px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  color: "#ccc",
                  lineHeight: "1.4",
                }}
              >
                {result.releaseNotes}
              </div>
            )}

            {/* Download Progress */}
            {downloading && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#aaa" }}>
                  <span>Downloading update...</span>
                  <span>{downloadPercent !== null ? `${downloadPercent}%` : "Connecting..."}</span>
                </div>
                <div style={{ width: "100%", height: "6px", background: "#222", borderRadius: "3px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      background: "#ff4438",
                      width: `${downloadPercent || 0}%`,
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "4px" }}>
              {isDesktop && !readyToInstall && (
                <button
                  type="button"
                  className="primary"
                  disabled={downloading}
                  onClick={handleDesktopDownload}
                >
                  {downloading ? "Downloading..." : "Download Update"}
                </button>
              )}

              {isDesktop && readyToInstall && (
                <button
                  type="button"
                  className="primary"
                  style={{ background: "#10b981", color: "#000" }}
                  onClick={handleRestartAndInstall}
                >
                  Restart & Apply Update
                </button>
              )}

              {!isDesktop && result.apkAsset && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => handleOpenUrl(result.apkAsset!.downloadUrl)}
                >
                  Download APK (v{result.latestVersion})
                </button>
              )}

              <button
                type="button"
                className="ghost"
                onClick={() => handleOpenUrl(result.htmlUrl)}
              >
                View on GitHub
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div style={{ color: "#ff4438", fontSize: "0.85rem", textAlign: "center" }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
