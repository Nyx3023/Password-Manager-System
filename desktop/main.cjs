const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  shell,
  globalShortcut,
} = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const vaultPaths = require("./vaultPaths.cjs");

let autoUpdater = null;
try {
  const updaterModule = require("electron-updater");
  autoUpdater = updaterModule.autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
} catch (e) {
  console.log("[Updater] electron-updater module not loaded:", e.message);
}

const GITHUB_REPO_OWNER = process.env.VITE_GITHUB_REPO_OWNER || "Nyx3023";
const GITHUB_REPO_NAME = process.env.VITE_GITHUB_REPO_NAME || "Password-Manager-System";

if (autoUpdater) {
  try {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
    });
  } catch (_) {}
}

const isDev = !app.isPackaged;
const VITE_DEV_URL = "http://127.0.0.1:5173/";
const DIST_INDEX = path.join(__dirname, "..", "dist", "index.html");

// === IPC Session Token (CRIT-2) ===
const SESSION_TOKEN_FILE = "ipc-session.token";

function generateSessionToken(appInstance) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenPath = path.join(vaultPaths.getDataDir(appInstance), SESSION_TOKEN_FILE);
  fs.writeFileSync(tokenPath, token, "utf8");
  return token;
}

let ipcSessionToken = null;

function viteDevServerUp() {
  return new Promise((resolve) => {
    const req = http.get(VITE_DEV_URL, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

let staticServer = null;
let staticServerPort = 0;

function startStaticServer() {
  return new Promise((resolve) => {
    if (staticServerPort > 0) {
      resolve(staticServerPort);
      return;
    }

    const mimeTypes = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".wasm": "application/wasm",
    };

    const distRoot = path.join(__dirname, "..", "dist");

    staticServer = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url, "http://localhost");
        let safePath = path.normalize(decodeURIComponent(parsedUrl.pathname));
        if (safePath === "/" || safePath === "\\") safePath = "/index.html";
        const filePath = path.join(distRoot, safePath);

        if (!filePath.startsWith(distRoot)) {
          res.writeHead(403);
          res.end();
          return;
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            // SPA fallback
            fs.readFile(path.join(distRoot, "index.html"), (err2, fallback) => {
              if (err2) {
                res.writeHead(404);
                res.end("Not Found");
              } else {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(fallback);
              }
            });
            return;
          }
          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
          res.end(data);
        });
      } catch {
        res.writeHead(500);
        res.end();
      }
    });

    staticServer.listen(0, "127.0.0.1", () => {
      staticServerPort = staticServer.address().port;
      resolve(staticServerPort);
    });
  });
}

async function loadRenderer() {
  if (!isDev) {
    const port = await startStaticServer();
    await mainWindow.loadURL(`http://localhost:${port}/`);
    return;
  }

  if (await viteDevServerUp()) {
    await mainWindow.loadURL(VITE_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  if (fs.existsSync(DIST_INDEX)) {
    console.warn(
      "[Password Manager] Vite is not running. Loaded dist/ via local server.",
    );
    const port = await startStaticServer();
    await mainWindow.loadURL(`http://localhost:${port}/`);
    return;
  }

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#000;color:#fff;padding:2rem">
<h1>Password Manager</h1>
<p>Start the dev server, then restart Electron:</p>
<pre>npm run electron:dev</pre>
<p>Or build first:</p>
<pre>npm run build:desktop &amp;&amp; npm run desktop</pre>
</body></html>`;
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

let mainWindow = null;
let tray = null;
let shouldQuit = false;

app.setName("SecureX");

function trayIcon() {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;
    const isAccent = i % 5 === 0;
    canvas[offset] = isAccent ? 0xff : 0x11;
    canvas[offset + 1] = isAccent ? 0x44 : 0x11;
    canvas[offset + 2] = isAccent ? 0x38 : 0x11;
    canvas[offset + 3] = 0xff;
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Open SecureX",
      click: () => showMainWindow(),
    },
    {
      label: "Quick Search (Ctrl+Shift+Space)",
      click: () => {
        showMainWindow();
        mainWindow?.webContents.send("app:toggle-quick-access");
      },
    },
    {
      label: "Lock vault",
      click: () => requestLock(),
    },
    { type: "separator" },
    {
      label: "Settings",
      click: () => {
        showMainWindow();
        mainWindow?.webContents.send("app:navigate-settings");
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        shouldQuit = true;
        app.quit();
      },
    },
  ]);
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("Password Manager");
  refreshTray();
  tray.on("double-click", () => showMainWindow());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#000000",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  // Security: prevent screen recording, screenshots, and screen shares (Discord, Teams, TeamViewer)
  try {
    mainWindow.setContentProtection(true);
  } catch (err) {
    console.warn("[Security] setContentProtection failed:", err);
  }

  mainWindow.once("ready-to-show", () => {
    // Strip Electron marker from user agent so Google OAuth allows sign-in popups
    const originalUa = mainWindow.webContents.getUserAgent();
    const cleanUa = originalUa.replace(/Electron\/[0-9\.]+\s?/, "");
    mainWindow.webContents.setUserAgent(cleanUa);

    // Handle authentication popups cleanly
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 500,
          height: 650,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            userAgent: cleanUa,
          },
        },
      };
    });

    mainWindow.show();
  });

  void loadRenderer().catch((err) => {
    console.error("[Password Manager] Failed to load UI:", err);
  });

  mainWindow.on("close", (event) => {
    if (!shouldQuit) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function showMainWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function requestLock() {
  mainWindow?.webContents.send("app:lock-requested");
}

function registerIpc() {
  // --- Storage IPC (with path sanitization — CRIT-3) ---

  ipcMain.handle("storage:read", (_e, name) => {
    try {
      vaultPaths.sanitizeFileName(name);
      if (name === vaultPaths.VAULT_FILE) {
        return vaultPaths.loadVault(app);
      }
      return vaultPaths.readText(app, name);
    } catch {
      return null;
    }
  });

  ipcMain.handle("storage:write", (_e, name, content) => {
    try {
      vaultPaths.sanitizeFileName(name);
    } catch {
      return false;
    }
    if (name === vaultPaths.VAULT_FILE) {
      vaultPaths.saveVault(app, content);
    } else {
      vaultPaths.writeText(app, name, content);
    }
    return true;
  });

  ipcMain.handle("storage:delete", (_e, name) => {
    try {
      vaultPaths.sanitizeFileName(name);
    } catch {
      return false;
    }
    vaultPaths.deleteFile(app, name);
    return true;
  });

  ipcMain.handle("storage:vaultDir", () => vaultPaths.getDataDir(app));

  // --- App events ---

  ipcMain.on("app:lock", () => requestLock());
  ipcMain.on("app:open-settings", () => {
    showMainWindow();
    mainWindow?.webContents.send("app:navigate-settings");
  });

  ipcMain.on("app:autofill-response", (_e, data) => {
    const socket = autofillRequests.get(data.id);
    if (socket) {
      try {
        const payload = Object.assign({ id: data.id }, data.result);
        socket.write(JSON.stringify(payload) + "\n");
      } catch (err) {}
      autofillRequests.delete(data.id);
    }
  });

  // Open the bundled extension folder in Windows Explorer
  ipcMain.handle("shell:open-extension-folder", () => {
    const extDir = path.join(__dirname, "..", "extension");
    shell.openPath(extDir);
  });

  // Open a URL in the user's default browser
  ipcMain.handle("shell:open-url", (_e, url) => {
    shell.openExternal(url);
  });

  // Windows auto-start on boot
  ipcMain.handle("system:get-auto-start", () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle("system:set-auto-start", (_e, enable) => {
    app.setLoginItemSettings({
      openAtLogin: !!enable,
      args: ["--hidden"],
    });
    return app.getLoginItemSettings().openAtLogin;
  });

  // --- Auto-Updater IPC ---
  ipcMain.handle("updater:check", async () => {
    try {
      if (isDev || !autoUpdater) {
        // Query GitHub releases API directly in dev or if native updater unconfigured
        const https = require("node:https");
        return new Promise((resolve) => {
          const req = https.get(
            `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`,
            { headers: { "User-Agent": "SecureX-Desktop" } },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                try {
                  if (res.statusCode === 200) {
                    const release = JSON.parse(data);
                    const latest = (release.tag_name || "").replace(/^v/, "").trim();
                    const current = app.getVersion();
                    if (latest && latest !== current) {
                      resolve({
                        status: "update-available",
                        version: latest,
                        releaseNotes: release.body,
                        downloadUrl: release.html_url,
                      });
                      return;
                    }
                  }
                  resolve({ status: "up-to-date", version: app.getVersion() });
                } catch (_) {
                  resolve({ status: "up-to-date", version: app.getVersion() });
                }
              });
            }
          );
          req.on("error", (err) => resolve({ status: "error", error: err.message }));
          req.setTimeout(6000, () => {
            req.destroy();
            resolve({ status: "error", error: "Request timed out" });
          });
        });
      }

      const res = await autoUpdater.checkForUpdates();
      if (res && res.updateInfo && res.updateInfo.version !== app.getVersion()) {
        return {
          status: "update-available",
          version: res.updateInfo.version,
          releaseNotes:
            typeof res.updateInfo.releaseNotes === "string"
              ? res.updateInfo.releaseNotes
              : undefined,
        };
      }
      return { status: "up-to-date", version: app.getVersion() };
    } catch (err) {
      return { status: "error", error: err.message };
    }
  });

  ipcMain.handle("updater:download", async () => {
    if (!autoUpdater) return { ok: false, error: "Auto-updater not initialized" };
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.on("updater:quit-and-install", () => {
    if (autoUpdater) {
      autoUpdater.quitAndInstall();
    }
  });

  // --- Secure Clipboard IPC ---
  ipcMain.handle("clipboard:clear", () => {
    try {
      const { clipboard } = require("electron");
      clipboard.clear();
      return true;
    } catch (_) {
      return false;
    }
  });

  ipcMain.handle("clipboard:write-secure", (_e, text) => {
    try {
      const { clipboard } = require("electron");
      clipboard.writeText(String(text || ""));
      return true;
    } catch (_) {
      return false;
    }
  });

  // --- Google Sign-In via System Browser (Chrome / Edge) ---
  let activeOAuthServer = null;

  ipcMain.handle("google:system-browser-auth", async (_e, { firebaseConfig }) => {
    if (activeOAuthServer) {
      try {
        activeOAuthServer.close();
      } catch (err) {}
      activeOAuthServer = null;
    }

    return new Promise((resolve, reject) => {
      let serverPort = 0;

      const server = http.createServer((req, res) => {
        try {
          const reqUrl = new URL(req.url, `http://localhost:${serverPort}`);

          if (req.method === "GET" && reqUrl.pathname === "/") {
            const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SecureX — Google Sign-In</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #000000;
      color: #e6edf3;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: #111111;
      border: 1px solid #333333;
      border-radius: 12px;
      padding: 2.5rem;
      text-align: center;
      max-width: 440px;
      width: 90%;
      box-shadow: 0 12px 36px rgba(0,0,0,0.7);
    }
    h2 { color: #ffffff; margin: 0 0 10px; font-size: 22px; font-weight: 600; }
    p { font-size: 14px; color: #888888; line-height: 1.5; margin: 0 0 24px; }
    .btn {
      background: #ffffff;
      color: #000000;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      transition: background 0.15s;
    }
    .btn:hover { background: #e0e0e0; }
    .status-box { margin-top: 16px; font-size: 13px; color: #aaaaaa; }
  </style>
  <script type="module">
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
    import { getAuth, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

    const config = ${JSON.stringify(firebaseConfig)};
    const app = initializeApp(config);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.addScope('openid');
    provider.addScope('email');
    provider.addScope('profile');

    async function startAuth() {
      const btn = document.getElementById('auth-btn');
      const status = document.getElementById('status');
      if (btn) btn.disabled = true;
      if (status) status.innerText = 'Connecting to Google...';

      try {
        const cred = await signInWithPopup(auth, provider);
        const googleCred = GoogleAuthProvider.credentialFromResult(cred);
        const googleIdToken = (googleCred && googleCred.idToken) || (cred._tokenResponse && cred._tokenResponse.oauthIdToken) || null;
        const googleAccessToken = (googleCred && googleCred.accessToken) || (cred._tokenResponse && cred._tokenResponse.oauthAccessToken) || null;
        
        document.getElementById('card-body').innerHTML = 
          '<div style="font-size: 42px; margin-bottom: 12px;">✅</div>' +
          '<h2>Signed In!</h2>' +
          '<p style="color:#2ea043; font-weight:500;">Authenticated as ' + cred.user.email + '</p>' +
          '<p style="color:#888;">You can close this tab and return to SecureX.</p>';

        await fetch('/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ok: true,
            googleIdToken,
            googleAccessToken,
            email: cred.user.email,
            displayName: cred.user.displayName,
            photoURL: cred.user.photoURL,
            uid: cred.user.uid,
          })
        });

        setTimeout(() => window.close(), 1500);
      } catch (err) {
        if (btn) btn.disabled = false;
        if (status) {
          const isBlocked = err && (err.code === 'auth/popup-blocked' || (err.message && err.message.includes('popup-blocked')));
          const msg = isBlocked
            ? 'Popup was blocked by your browser. Please allow popups for localhost and click Continue with Google again.'
            : (err.message || err);
          status.innerHTML = '<span style="color:#f85149;">' + msg + '</span><br><br><span style="color:#888;">Click Continue with Google to try again.</span>';
        }
      }
    }

    window.startAuth = startAuth;
  </script>
</head>
<body>
  <div class="card" id="card-body">
    <div style="font-size: 38px; margin-bottom: 12px;">🔐</div>
    <h2>Sign in to SecureX</h2>
    <p>Choose the Google account you are already signed into in this browser:</p>
    <button type="button" class="btn" id="auth-btn" onclick="startAuth()">
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
      </svg>
      <span>Continue with Google</span>
    </button>
    <div class="status-box" id="status"></div>
  </div>
</body>
</html>`;

            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
            return;
          }

          if (req.method === "POST" && reqUrl.pathname === "/callback") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
              try {
                const data = JSON.parse(body);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));

                clearTimeout(timer);
                server.close();
                activeOAuthServer = null;

                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.show();
                  mainWindow.focus();
                }

                resolve(data);
              } catch (err) {
                res.writeHead(400);
                res.end();
              }
            });
            return;
          }

          res.writeHead(404);
          res.end();
        } catch (err) {
          res.writeHead(500);
          res.end();
          clearTimeout(timer);
          server.close();
          activeOAuthServer = null;
          reject(err);
        }
      });

      const timer = setTimeout(() => {
        try {
          server.close();
        } catch (e) {}
        activeOAuthServer = null;
        reject(new Error("Google sign-in timed out"));
      }, 180000);

      server.listen(0, "127.0.0.1", () => {
        serverPort = server.address().port;
        activeOAuthServer = server;
        shell.openExternal(`http://localhost:${serverPort}/`);
      });

      server.on("error", (err) => {
        clearTimeout(timer);
        activeOAuthServer = null;
        reject(err);
      });
    });
  });

  // --- Safe HTTP Fetch Proxy (Node OS-level fetch, zero CORS) ---
  ipcMain.handle("net:fetch", async (_e, { url, method, headers, body }) => {
    try {
      const httpMethod = (method || "GET").toUpperCase();
      const hasBody = httpMethod !== "GET" && httpMethod !== "HEAD" && body != null && body !== "";
      const res = await fetch(url, {
        method: httpMethod,
        headers: headers || {},
        body: hasBody ? body : undefined,
      });

      const contentType = res.headers.get("content-type") || "";
      let data = null;
      let text = "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
          text = JSON.stringify(data);
        } catch {
          text = await res.text();
          data = text;
        }
      } else {
        text = await res.text();
        data = text;
      }

      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        data,
        text,
      };
    } catch (err) {
      console.error("[net:fetch] Error during fetch to", url, ":", err);
      return {
        ok: false,
        status: 0,
        statusText: err.message || "Network error",
        error: err.message || "Network error",
      };
    }
  });
}

let autofillRequests = new Map();
let autofillIdCounter = 0;

function startIpcServer() {
  const PIPE_NAME = '\\\\.\\pipe\\passwordmanager-ext-ipc';
  const server = net.createServer((socket) => {
    let dataBuffer = "";
    socket.on("data", (data) => {
      dataBuffer += data.toString();
      if (dataBuffer.endsWith("\n")) {
        try {
          const req = JSON.parse(dataBuffer.trim());

          // === CRIT-2: Validate session token ===
          if (!req.token || req.token !== ipcSessionToken) {
            socket.write(JSON.stringify({ id: req.id, error: "UNAUTHORIZED" }) + "\n");
            dataBuffer = "";
            return;
          }

          if (req.type === "REQUEST_AUTOFILL" && req.url) {
            const reqId = req.id || ++autofillIdCounter;
            autofillRequests.set(reqId, socket);
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("app:request-autofill", { id: reqId, url: req.url });
            } else {
              socket.write(JSON.stringify({ id: reqId, error: "APP_CLOSED" }) + "\n");
            }
          } else if (req.type === "SAVE_CREDENTIAL" && req.credential) {
            const reqId = req.id || ++autofillIdCounter;
            autofillRequests.set(reqId, socket);

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("app:save-credential", { id: reqId, credential: req.credential });
            } else {
              socket.write(JSON.stringify({ id: reqId, error: "APP_CLOSED" }) + "\n");
            }
          } else {
             socket.write(JSON.stringify({ id: req.id, error: "UNKNOWN_REQUEST" }) + "\n");
          }
        } catch(e) {
          socket.write(JSON.stringify({ error: "INVALID_JSON" }) + "\n");
        }
        dataBuffer = "";
      }
    });
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log('IPC server already running');
    }
  });

  server.listen(PIPE_NAME);
}

function setupUpdaterListeners() {
  if (!autoUpdater) return;

  autoUpdater.on("update-available", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:update-available", {
        version: info.version,
        releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
      });
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:download-progress", {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:update-downloaded", {
        version: info.version,
      });
    }
  });

  autoUpdater.on("error", (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:error", err.message);
    }
  });
}

app.whenReady().then(() => {
  vaultPaths.ensureDataDir(app);
  ipcSessionToken = generateSessionToken(app);
  registerIpc();
  startIpcServer();
  setupUpdaterListeners();
  createWindow();
  createTray();

  try {
    globalShortcut.register("CommandOrControl+Shift+Space", () => {
      showMainWindow();
      mainWindow?.webContents.send("app:toggle-quick-access");
    });
  } catch (e) {
    console.warn("[SecureX] Global shortcut registration failed:", e);
  }
});

app.on("window-all-closed", () => {
  /* keep tray alive on Windows */
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  shouldQuit = true;
});

app.on("activate", () => showMainWindow());

