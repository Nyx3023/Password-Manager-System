const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  shell,
} = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const net = require("node:net");
const vaultPaths = require("./vaultPaths.cjs");
const { createLanServer } = require("./lanServer.cjs");

const isDev = !app.isPackaged;
const VITE_DEV_URL = "http://127.0.0.1:5173/";
const DIST_INDEX = path.join(__dirname, "..", "dist", "index.html");

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

const lan = createLanServer({
  app,
  vaultPaths,
  onVaultWritten: () => {
    mainWindow?.webContents.send("lan-vault-updated");
    refreshTray();
  },
});

app.setName("Password Manager");

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
  const st = lan.status();
  const syncLabel = st.lastSyncAt
    ? `Last sync: ${st.lastSyncAt}`
    : "LAN sync (same Wi-Fi as phone)";

  return Menu.buildFromTemplate([
    {
      label: "Open Password Manager",
      click: () => showMainWindow(),
    },
    {
      label: "Lock vault",
      click: () => requestLock(),
    },
    { type: "separator" },
    { label: syncLabel, enabled: false },
    {
      label: `LAN: ${st.address}`,
      click: () => {
        shell.clipboard.writeText(st.address);
      },
    },
    st.running
      ? { label: "LAN server running", enabled: false }
      : { label: "LAN server stopped", enabled: false },
    st.running
      ? {
          label: "Stop LAN server",
          click: () => {
            void lan.stop().then((st) => refreshTray(st));
          },
        }
      : {
          label: "Start LAN server",
          click: () => {
            void lan.start().then((st) => refreshTray(st));
          },
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
      webSecurity: true,
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
  ipcMain.handle("storage:read", (_e, name) => {
    try {
      if (name === vaultPaths.VAULT_FILE) {
        return vaultPaths.loadVault(app);
      }
      return vaultPaths.readText(app, name);
    } catch {
      return null;
    }
  });

  ipcMain.handle("storage:write", (_e, name, content) => {
    if (name === vaultPaths.VAULT_FILE) {
      vaultPaths.saveVault(app, content);
    } else {
      vaultPaths.writeText(app, name, content);
    }
    return true;
  });

  ipcMain.handle("storage:delete", (_e, name) => {
    vaultPaths.deleteFile(app, name);
    return true;
  });

  ipcMain.handle("storage:vaultDir", () => vaultPaths.getDataDir(app));

  ipcMain.handle("tray:status", () => lan.status());

  ipcMain.handle("lan:start", async () => {
    const st = await lan.start();
    refreshTray();
    return st;
  });

  ipcMain.handle("lan:stop", async () => {
    const st = await lan.stop();
    refreshTray();
    return st;
  });

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
      // Keep socket open for persistent connections!
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
          if (req.type === "REQUEST_AUTOFILL" && req.url) {
            const reqId = req.id || ++autofillIdCounter;
            autofillRequests.set(reqId, socket);
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("app:request-autofill", { id: reqId, url: req.url });
            } else {
              socket.write(JSON.stringify({ id: reqId, error: "APP_CLOSED" }) + "\n");
            }
          } else {
             socket.write(JSON.stringify({ id: req.id, error: "UNKNOWN_REQUEST" }) + "\n");
          }
        } catch(e) {
          socket.write(JSON.stringify({ error: "INVALID_JSON" }) + "\n");
        }
        dataBuffer = ""; // Reset buffer after processing
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
  registerIpc();
  startIpcServer();
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  /* keep tray alive on Windows */
});

app.on("before-quit", () => {
  shouldQuit = true;
});

app.on("activate", () => showMainWindow());
