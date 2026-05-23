import { useState } from "react";

const CHROME_EXT_ID = "nionddfgmkmbjlchgmmmajifhkfhijhh";
const FIREFOX_EXT_ID = "autofill@passwordmanager.com";

type Browser = "chrome" | "firefox";

export function DesktopExtensionPanel() {
  const [activeBrowser, setActiveBrowser] = useState<Browser>("chrome");
  const [copied, setCopied] = useState(false);
  const isElectron = !!window.electronAPI;

  const openExtensionFolder = () => {
    window.electronAPI?.openExtensionFolder();
  };

  const openChromeExtensions = () => {
    window.electronAPI?.openUrl("chrome://extensions");
  };

  const openFirefoxDebugging = () => {
    window.electronAPI?.openUrl("about:debugging#/runtime/this-firefox");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="ext-panel">
      <div className="ext-panel-header">
        <div className="ext-panel-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
          </svg>
        </div>
        <div>
          <h3 className="ext-panel-title">Browser Extension</h3>
          <p className="ext-panel-subtitle">Enables auto-fill directly in your browser</p>
        </div>
      </div>

      <div className="ext-panel-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          The extension is bundled with the app. Install it once, and autofill will work on all your login pages.
        </span>
      </div>

      {/* Browser tabs */}
      <div className="ext-browser-tabs">
        <button
          type="button"
          className={`ext-browser-tab ${activeBrowser === "chrome" ? "active" : ""}`}
          onClick={() => setActiveBrowser("chrome")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 13.636a1.636 1.636 0 1 1 0-3.272 1.636 1.636 0 0 1 0 3.272z"/></svg>
          Chrome / Edge / Brave
        </button>
        <button
          type="button"
          className={`ext-browser-tab ${activeBrowser === "firefox" ? "active" : ""}`}
          onClick={() => setActiveBrowser("firefox")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.001.007C6.084-.02 1.002 4.635 1.002 10.508c0 5.948 4.817 10.765 10.765 10.765 5.948 0 10.765-4.817 10.765-10.765C22.532 4.53 17.684-.02 12.001.007zm5.284 14.498c-.234.234-.492.421-.762.568l-.022.013a5.27 5.27 0 0 1-.638.296 5.364 5.364 0 0 1-.685.194 5.416 5.416 0 0 1-1.178.131 5.416 5.416 0 0 1-5.416-5.416c0-.577.091-1.132.259-1.653.1-.311.222-.609.363-.893.278-.556.64-1.056 1.07-1.487.43-.43.93-.792 1.487-1.07l.024-.012a4.954 4.954 0 0 1 .869-.339c.312-.092.64-.151.977-.174a5.418 5.418 0 0 1 3.692 9.842z"/></svg>
          Firefox / Zen
        </button>
      </div>

      {/* Chrome instructions */}
      {activeBrowser === "chrome" && (
        <div className="ext-steps">
          <div className="ext-step">
            <span className="ext-step-num">1</span>
            <div className="ext-step-body">
              <p className="ext-step-label">Open Chrome Extensions</p>
              <p className="ext-step-desc">Navigate to the extensions manager page in your browser.</p>
              <button
                type="button"
                className="ext-action-btn"
                onClick={openChromeExtensions}
                disabled={!isElectron}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open chrome://extensions
              </button>
            </div>
          </div>

          <div className="ext-step">
            <span className="ext-step-num">2</span>
            <div className="ext-step-body">
              <p className="ext-step-label">Enable Developer Mode</p>
              <p className="ext-step-desc">Toggle <strong>Developer mode</strong> in the top-right corner of the extensions page.</p>
            </div>
          </div>

          <div className="ext-step">
            <span className="ext-step-num">3</span>
            <div className="ext-step-body">
              <p className="ext-step-label">Load the extension folder</p>
              <p className="ext-step-desc">Click <strong>Load unpacked</strong>, then select the extension folder below.</p>
              <button
                type="button"
                className="ext-action-btn"
                onClick={openExtensionFolder}
                disabled={!isElectron}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Open Extension Folder
              </button>
            </div>
          </div>

          <div className="ext-step">
            <span className="ext-step-num">✓</span>
            <div className="ext-step-body">
              <p className="ext-step-label">Done! Autofill is active.</p>
              <p className="ext-step-desc">
                Click any username or password field on a login page to auto-fill from your vault.
              </p>
              <div className="ext-id-row">
                <span className="ext-id-label">Extension ID</span>
                <code className="ext-id-code">{CHROME_EXT_ID}</code>
                <button
                  type="button"
                  className="ext-copy-btn"
                  onClick={() => copyToClipboard(CHROME_EXT_ID)}
                  title="Copy extension ID"
                >
                  {copied ? "✓" : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Firefox instructions */}
      {activeBrowser === "firefox" && (
        <div className="ext-steps">
          <div className="ext-step">
            <span className="ext-step-num">1</span>
            <div className="ext-step-body">
              <p className="ext-step-label">Open Firefox Debugger</p>
              <p className="ext-step-desc">Navigate to the temporary extension loader page.</p>
              <button
                type="button"
                className="ext-action-btn"
                onClick={openFirefoxDebugging}
                disabled={!isElectron}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open about:debugging
              </button>
            </div>
          </div>

          <div className="ext-step">
            <span className="ext-step-num">2</span>
            <div className="ext-step-body">
              <p className="ext-step-label">Load Temporary Add-on</p>
              <p className="ext-step-desc">
                Click <strong>This Firefox</strong> → <strong>Load Temporary Add-on…</strong> and open the extension folder below.
                Select the <code>manifest.json</code> file inside it.
              </p>
              <button
                type="button"
                className="ext-action-btn"
                onClick={openExtensionFolder}
                disabled={!isElectron}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Open Extension Folder
              </button>
            </div>
          </div>

          <div className="ext-step">
            <span className="ext-step-num">✓</span>
            <div className="ext-step-body">
              <p className="ext-step-label">Done! Autofill is active.</p>
              <p className="ext-step-desc">
                The extension will remain active until Firefox is restarted.
                For permanent install, the extension needs to be signed by Mozilla.
              </p>
              <div className="ext-id-row">
                <span className="ext-id-label">Extension ID</span>
                <code className="ext-id-code">{FIREFOX_EXT_ID}</code>
                <button
                  type="button"
                  className="ext-copy-btn"
                  onClick={() => copyToClipboard(FIREFOX_EXT_ID)}
                  title="Copy extension ID"
                >
                  {copied ? "✓" : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
