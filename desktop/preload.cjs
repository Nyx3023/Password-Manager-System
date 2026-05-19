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
  newLanPairingCode: () => ipcRenderer.invoke("lan:newPairing"),
  openSettings: () => ipcRenderer.send("app:open-settings"),
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
});
