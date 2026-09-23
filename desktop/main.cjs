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

async function loadRenderer() {
  if (!isDev) {
    await mainWindow.loadFile(DIST_INDEX);
    return;
  }

  if (await viteDevServerUp()) {
    await mainWindow.loadURL(VITE_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  if (fs.existsSync(DIST_INDEX)) {
    console.warn(
      "[Password Manager] Vite is not running. Loaded dist/ instead. For hot reload use: npm run electron:dev",
    );
    await mainWindow.loadFile(DIST_INDEX);
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

  mainWindow.once("ready-to-show", () => {
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

  // --- Google Drive OAuth Loopback Server ---
  let activeOAuthServer = null;

  ipcMain.handle("google:start-auth", async (_e, { authUrlTemplate }) => {
    if (activeOAuthServer) {
      try {
        activeOAuthServer.close();
      } catch (err) {}
      activeOAuthServer = null;
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const reqUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
          if (reqUrl.pathname === "/oauth2callback") {
            const code = reqUrl.searchParams.get("code");
            const error = reqUrl.searchParams.get("error");

            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            if (code) {
              res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>SecureX — Authenticated</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;padding:2.5rem;background:#161b22;border:1px solid #30363d;border-radius:12px;max-width:400px;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
    <div style="font-size:36px;margin-bottom:12px;">✅</div>
    <h2 style="color:#58a6ff;margin:0 0 8px 0;font-size:20px;">Connected to SecureX</h2>
    <p style="font-size:14px;color:#8b949e;margin:0 0 16px 0;">Authentication complete. You can close this window now and return to the SecureX application.</p>
  </div>
</body>
</html>`);
              server.close();
              activeOAuthServer = null;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show();
                mainWindow.focus();
              }
              resolve({ ok: true, code, redirectUri: `http://127.0.0.1:${serverPort}/oauth2callback` });
            } else {
              res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>SecureX — Error</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;padding:2.5rem;background:#161b22;border:1px solid #da3633;border-radius:12px;max-width:400px;">
    <div style="font-size:36px;margin-bottom:12px;">⚠️</div>
    <h2 style="color:#f85149;margin:0 0 8px 0;">Authentication Cancelled</h2>
    <p style="font-size:14px;color:#8b949e;">${error || "Access was not granted."}</p>
  </div>
</body>
</html>`);
              server.close();
              activeOAuthServer = null;
              reject(new Error(error || "Authentication cancelled"));
            }
          } else {
            res.writeHead(404);
            res.end();
          }
        } catch (err) {
          res.writeHead(500);
          res.end();
          server.close();
          activeOAuthServer = null;
          reject(err);
        }
      });

      let serverPort = 0;
      const timer = setTimeout(() => {
        try {
          server.close();
        } catch (e) {}
        activeOAuthServer = null;
        reject(new Error("Authentication timed out after 3 minutes"));
      }, 180000);

      server.listen(0, "127.0.0.1", () => {
        serverPort = server.address().port;
        const redirectUri = `http://127.0.0.1:${serverPort}/oauth2callback`;
        activeOAuthServer = server;

        const authUrl = authUrlTemplate.replace("__REDIRECT_URI__", encodeURIComponent(redirectUri));
        shell.openExternal(authUrl);
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

app.whenReady().then(() => {
  vaultPaths.ensureDataDir(app);
  ipcSessionToken = generateSessionToken(app);
  registerIpc();
  startIpcServer();
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

