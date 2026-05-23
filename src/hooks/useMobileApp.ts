import { useCallback, useEffect, useState, useMemo } from "react";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useClipboard } from "@/hooks/useClipboard";
import { useVault } from "@/hooks/useVault";
import { isLanPaired } from "@/shared/lanSync";
import { autofillSupported, VaultAutofill } from "@/shared/vaultAutofill";
import {
  startLanServerNative,
  stopLanServerNative,
  setServerVaultNative,
  listenForVaultPushNative,
} from "@/shared/vaultLanHttp";
import type { TrayStatus } from "@/shared/electron.d";
import { loadVaultFile, saveVaultFile } from "@/shared/storage";

const AUTO_LOCK_MS = 5 * 60 * 1000;

export function useMobileApp() {
  const vault = useVault();
  const { copy } = useClipboard();
  const [toast, setToast] = useState<string | null>(null);
  const [lanStatus, setLanStatus] = useState<TrayStatus | null>(null);

  useEffect(() => {
    void vault.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autofillSupported()) return;

    const listener = VaultAutofill.addListener("autofillUnlockRequired", () => {
      if (vault.unlocked) {
        void VaultAutofill.notifyUnlocked();
      }
    });

    void VaultAutofill.getPendingAuthentication().then(({ pending }) => {
      if (pending && vault.unlocked) {
        void VaultAutofill.notifyUnlocked();
      }
    });

    return () => {
      void listener.then((h) => h.remove());
    };
  }, [vault.unlocked]);

  useEffect(() => {
    if (!autofillSupported() || !vault.unlocked) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void VaultAutofill.notifyUnlocked();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [vault.unlocked]);

  useAutoLock(vault.unlocked, AUTO_LOCK_MS, vault.lock);

  useEffect(() => {
    if (!vault.unlocked || !isLanPaired()) return;

    void vault.checkRemoteSync();

    const interval = window.setInterval(() => {
      void vault.checkRemoteSync();
    }, 45_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void vault.checkRemoteSync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [vault.unlocked, vault.checkRemoteSync]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const handleCopy = useCallback(
    async (label: string, value: string) => {
      if (!value) return;
      await copy(value);
      showToast(`${label} copied - clears in 30s`);
    },
    [copy, showToast],
  );

  const startLan = useCallback(async () => {
    const raw = await loadVaultFile();
    if (raw) await setServerVaultNative(raw);
    const st = await startLanServerNative();
    setLanStatus(st);
    showToast("LAN server started");
  }, [showToast]);

  const stopLan = useCallback(async () => {
    const st = await stopLanServerNative();
    setLanStatus(st);
    showToast("LAN server stopped");
  }, [showToast]);

  const refreshLanStatus = useCallback(async () => {
    if (lanStatus?.running) {
      const raw = await loadVaultFile();
      if (raw) await setServerVaultNative(raw);
    }
  }, [lanStatus?.running]);

  useEffect(() => {
    void refreshLanStatus();
  }, [vault.lastSyncAt, refreshLanStatus]);

  useEffect(() => {
    if (!lanStatus?.running) return;

    const unsubPromise = listenForVaultPushNative(({ vaultData }) => {
      void saveVaultFile(vaultData).then(() => {
        if (!vault.unlocked) return;
        vault.pulseSyncVisual("syncing");
        void vault.reloadFromDiskAfterSync().then((ok) => {
          if (ok) {
            vault.pulseSyncVisual("success", 2000);
          } else {
            vault.pulseSyncVisual("error", 3000);
          }
        });
      });
    });

    return () => {
      void unsubPromise.then((unsub) => unsub());
    };
  }, [lanStatus?.running, vault]);

  const desktopLan = useMemo(() => {
    return {
      status: lanStatus,
      busy: vault.busy,
      isPhone: true,
      onRefresh: refreshLanStatus,
      onStart: startLan,
      onStop: stopLan,
      onCopyAddress: (address: string) => {
        void copy(address);
        showToast("Address copied.");
      },
    };
  }, [lanStatus, vault.busy, refreshLanStatus, startLan, stopLan, copy, showToast]);

  return { vault, toast, desktopLan, handleCopy, showToast };
}
