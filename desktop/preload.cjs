const { contextBridge, ipcRenderer } = require("electron");

ipcRenderer.on("app:navigate-settings", () => {
  window.dispatchEvent(new Event("app:navigate-settings"));
});

contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true,
  readDataFile: (name) => ipcRenderer.invoke("storage:read", name),
  writeDataFile: (name, content) => ipcRenderer.invoke("storage:write", name, content),
  deleteDataFile: (name) => ipcRenderer.invoke("storage:delete", name),
  getVaultDirectory: () => ipcRenderer.invoke("storage:vaultDir"),
  lockApp: () => ipcRenderer.send("app:lock"),
  openSettings: () => ipcRenderer.send("app:open-settings"),
  openExtensionFolder: () => ipcRenderer.invoke("shell:open-extension-folder"),
  openUrl: (url) => ipcRenderer.invoke("shell:open-url", url),
  getAutoStart: () => ipcRenderer.invoke("system:get-auto-start"),
  setAutoStart: (enable) => ipcRenderer.invoke("system:set-auto-start", enable),
  onLockRequested: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("app:lock-requested", listener);
    return () => ipcRenderer.removeListener("app:lock-requested", listener);
  },
  onRequestAutofill: (handler) => {
    const listener = (_e, data) => handler(data);
    ipcRenderer.on("app:request-autofill", listener);
    return () => ipcRenderer.removeListener("app:request-autofill", listener);
  },
  onSaveCredential: (handler) => {
    const listener = (_e, data) => handler(data);
    ipcRenderer.on("app:save-credential", listener);
    return () => ipcRenderer.removeListener("app:save-credential", listener);
  },
  onToggleQuickAccess: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("app:toggle-quick-access", listener);
    return () => ipcRenderer.removeListener("app:toggle-quick-access", listener);
  },
  sendAutofillResponse: (id, result) => {
    ipcRenderer.send("app:autofill-response", { id, result });
  },
  googleStartAuth: (authUrlTemplate) =>
    ipcRenderer.invoke("google:start-auth", { authUrlTemplate }),
  netFetch: (url, options) =>
    ipcRenderer.invoke("net:fetch", { url, ...options }),
});
