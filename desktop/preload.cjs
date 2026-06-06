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
  getTrayStatus: () => ipcRenderer.invoke("tray:status"),
  startLanServer: () => ipcRenderer.invoke("lan:start"),
  stopLanServer: () => ipcRenderer.invoke("lan:stop"),
  // LAN pairing (CRIT-1)
  startLanPairing: () => ipcRenderer.invoke("lan:start-pairing"),
  stopLanPairing: () => ipcRenderer.invoke("lan:stop-pairing"),
  getLanPairingCode: () => ipcRenderer.invoke("lan:get-pairing-code"),
  unpairLan: () => ipcRenderer.invoke("lan:unpair"),
  openSettings: () => ipcRenderer.send("app:open-settings"),
  openExtensionFolder: () => ipcRenderer.invoke("shell:open-extension-folder"),
  openUrl: (url) => ipcRenderer.invoke("shell:open-url", url),
  onLockRequested: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("app:lock-requested", listener);
    return () => ipcRenderer.removeListener("app:lock-requested", listener);
  },
  onLanVaultUpdated: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("lan-vault-updated", listener);
    return () => ipcRenderer.removeListener("lan-vault-updated", listener);
  },
  onRequestAutofill: (handler) => {
    const listener = (_e, data) => handler(data);
    ipcRenderer.on("app:request-autofill", listener);
    return () => ipcRenderer.removeListener("app:request-autofill", listener);
  },
  sendAutofillResponse: (id, result) => {
    ipcRenderer.send("app:autofill-response", { id, result });
  },
});
