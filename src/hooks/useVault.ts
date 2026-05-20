import { useCallback, useMemo, useRef, useState } from "react";
import type { SetupData } from "@/components/setup/SetupWizard";
import {
  disableBiometricUnlock,
  isBiometricAvailable,
  repairBiometricPrefsIfNeeded,
  unlockWithBiometric,
} from "@/shared/biometrics";
import { isVaultDecryptError } from "@/shared/vaultErrors";
import { clearAutofillSession, syncAutofillSession } from "@/shared/autofillSync";
import { chromeRowToEntry, parseChromeCsv } from "@/shared/chromeCsv";
import { validateMasterPassword } from "@/shared/passwordPolicy";
import type { SyncIconState } from "@/components/SyncIcon";
import {
  pullVaultFromPc,
  pushVaultToPc,
  isLanPaired,
  loadLanPrefs,
  loadStoredVaultEtag,
  loadLastSyncAt,
  storeLastSyncAt,
  fetchPcStatus,
  storeVaultEtag,
} from "@/shared/lanSync";
import { isCapacitorNative } from "@/shared/platform";
import { loadPrefs, resetAllAppData, savePrefs } from "@/shared/storage";
import { VaultService } from "@/shared/vaultService";
import type {
  ImportMode,
  Person,
  PersonCategoryId,
  VaultEntry,
} from "@/shared/types";

export function useVault() {
  const service = useMemo(() => new VaultService(), []);
  const [ready, setReady] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [mpinEnabled, setMpinEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncVisual, setSyncVisual] = useState<SyncIconState>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() =>
    loadLastSyncAt(),
  );

  const sync = useCallback(() => {
    setEntries([...service.entries]);
    setPeople([...service.people]);
    setUnlocked(service.isUnlocked);
    // MPIN presence must come from disk (refreshMeta / setMpin / removeMpin).
    // service.hasMpin is false while the vault is locked even if MPIN exists.
    if (service.isUnlocked) {
      void syncAutofillSession(service.entries, service.people);
    }
  }, [service]);

  const syncInFlight = useRef(false);
  const syncDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncVisualTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localDirtyRef = useRef(false);

  const pulseSyncVisual = useCallback(
    (state: SyncIconState, revertMs?: number) => {
      setSyncVisual(state);
      if (syncVisualTimer.current) clearTimeout(syncVisualTimer.current);
      if (revertMs !== undefined && state !== "idle") {
        syncVisualTimer.current = setTimeout(() => {
          setSyncVisual("idle");
          syncVisualTimer.current = null;
        }, revertMs);
      }
    },
    [],
  );

  const markLocalDirty = useCallback(() => {
    localDirtyRef.current = true;
  }, []);

  const syncWithPc = useCallback(async () => {
    if (!isCapacitorNative() || !isLanPaired() || !service.isUnlocked) return;
    if (syncInFlight.current) return;

    const prefs = loadLanPrefs();
    if (!prefs.host) return;

    syncInFlight.current = true;
    try {
      const status = await fetchPcStatus(prefs.host, prefs.port);
      if (!status.running) return;

      const remoteEtag = status.vaultEtag ?? null;
      const knownEtag = loadStoredVaultEtag();
      const needsPull = !!(remoteEtag && remoteEtag !== knownEtag);
      const needsPush = localDirtyRef.current;

      if (!needsPull && !needsPush) return;

      pulseSyncVisual("syncing");

      let changed = false;

      if (needsPull) {
        const { content, etag } = await pullVaultFromPc({
          host: prefs.host,
          port: prefs.port,
        });
        await service.mergeUnlockedFromRaw(content);
        storeVaultEtag(etag ?? remoteEtag);
        sync();
        changed = true;
      }

      if (localDirtyRef.current) {
        const raw = await service.exportVault();
        let pushRes = await pushVaultToPc({
          host: prefs.host,
          port: prefs.port,
          vaultJson: raw,
          force: false,
        });

        if (
          !pushRes.ok &&
          (pushRes.message.includes("changed") ||
            pushRes.message.includes("Conflict") ||
            pushRes.message.includes("409"))
        ) {
          const { content, etag } = await pullVaultFromPc({
            host: prefs.host,
            port: prefs.port,
          });
          await service.mergeUnlockedFromRaw(content);
          storeVaultEtag(etag);
          sync();
          const merged = await service.exportVault();
          pushRes = await pushVaultToPc({
            host: prefs.host,
            port: prefs.port,
            vaultJson: merged,
            force: false,
          });
        }

        if (pushRes.ok) {
          localDirtyRef.current = false;
          changed = true;
        }
      }

      if (changed) {
        const at = storeLastSyncAt();
        setLastSyncAt(at);
        pulseSyncVisual("success", 2000);
      } else {
        pulseSyncVisual("idle");
      }
    } catch (e) {
      if (isVaultDecryptError(e)) {
        setError(
          "PC vault uses a different master password than this phone. Import the same .pms backup on both devices, or use Force push to replace the PC vault.",
        );
      }
      pulseSyncVisual("error", 3000);
    } finally {
      syncInFlight.current = false;
    }
  }, [service, sync, pulseSyncVisual]);

  const checkRemoteSync = useCallback(async () => {
    if (!isCapacitorNative() || !isLanPaired() || !service.isUnlocked) return;
    if (syncInFlight.current) return;

    const prefs = loadLanPrefs();
    if (!prefs.host) return;

    try {
      const status = await fetchPcStatus(prefs.host, prefs.port);
      if (!status.running) return;

      const remoteEtag = status.vaultEtag ?? null;
      const knownEtag = loadStoredVaultEtag();
      if (
        (remoteEtag && remoteEtag !== knownEtag) ||
        localDirtyRef.current
      ) {
        await syncWithPc();
      }
    } catch {
      /* ignore background poll errors */
    }
  }, [syncWithPc]);

  const scheduleSyncWithPc = useCallback(() => {
    if (!isCapacitorNative() || !isLanPaired()) return;
    markLocalDirty();
    if (syncDebounce.current) clearTimeout(syncDebounce.current);
    syncDebounce.current = setTimeout(() => {
      syncDebounce.current = null;
      void syncWithPc();
    }, 1500);
  }, [syncWithPc, markLocalDirty]);

  const refreshMeta = useCallback(async () => {
    const repairedBiometrics = await repairBiometricPrefsIfNeeded();
    const [exists, prefs, bioAvailable, hasMpin] = await Promise.all([
      service.exists(),
      service.getPrefs(),
      isBiometricAvailable(),
      service.hasMpinOnDisk(),
    ]);
    setHasVault(exists);
    setBiometricsEnabled(
      repairedBiometrics ? false : prefs.biometricsEnabled,
    );
    setBiometricsAvailable(bioAvailable);
    setMpinEnabled(hasMpin);
    sync();
    setReady(true);
  }, [service, sync]);

  const init = useCallback(async () => {
    await refreshMeta();
  }, [refreshMeta]);

  // ============================================================
  // Create / unlock / lock
  // ============================================================
  const completeSetup = useCallback(
    async (data: SetupData) => {
      setError(null);
      setBusy(true);
      try {
        await service.createVault(data.password);
        for (const person of data.people) {
          service.addPerson(person.name, person.category);
        }
        await service.save();

        if (data.enableBiometrics) {
          try {
            await service.enableBiometrics();
          } catch {
            // User can enable later in settings.
          }
        }

        if (!/^\d{8}$/.test(data.mpin)) {
          throw new Error("MPIN must be exactly 8 digits.");
        }
        await service.setMpin(data.mpin);

        const prefs = await loadPrefs();
        prefs.setupComplete = true;
        await savePrefs(prefs);

        setHasVault(true);
        setBiometricsEnabled(data.enableBiometrics || prefs.biometricsEnabled);
        setMpinEnabled(true);
        sync();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Setup failed.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  const unlockWithPassword = useCallback(
    async (password: string) => {
      setError(null);
      setBusy(true);
      try {
        await service.unlockWithPassword(password);
        sync();
        void syncWithPc();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unlock failed.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service, sync, syncWithPc],
  );

  const unlockWithMpin = useCallback(
    async (mpin: string) => {
      setError(null);
      setBusy(true);
      try {
        await service.unlockWithMpin(mpin);
        sync();
        void syncWithPc();
        return true;
      } catch {
        setError(null);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service, sync, syncWithPc],
  );

  const unlockWithBiometrics = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const vaultKey = await unlockWithBiometric();
      try {
        await service.unlockWithVaultKey(vaultKey, { biometric: true });
      } finally {
        vaultKey.fill(0);
      }
      const prefs = await service.getPrefs();
      setBiometricsEnabled(prefs.biometricsEnabled);
      sync();
      void syncWithPc();
      return true;
    } catch (e) {
      const prefs = await service.getPrefs();
      setBiometricsEnabled(prefs.biometricsEnabled);
      if (isVaultDecryptError(e) || (e instanceof Error && e.message.includes("Biometric"))) {
        setError(e instanceof Error ? e.message : "Biometric unlock failed.");
      } else {
        setError(e instanceof Error ? e.message : "Biometric unlock failed.");
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, [service, sync, syncWithPc]);

  const lock = useCallback(() => {
    void clearAutofillSession();
    service.lock();
    setUnlocked(false);
    setEntries([]);
    setPeople([]);
    setError(null);
  }, [service]);

  const resetApp = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      service.lock();
      await clearAutofillSession();
      await disableBiometricUnlock();
      await resetAllAppData();
      setHasVault(false);
      setUnlocked(false);
      setEntries([]);
      setPeople([]);
      setBiometricsEnabled(false);
      setMpinEnabled(false);
      await refreshMeta();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [service, refreshMeta]);

  // ============================================================
  // Entries
  // ============================================================
  const addEntry = useCallback(
    async (entry: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">) => {
      service.addEntry(entry);
      await service.save();
      sync();
      scheduleSyncWithPc();
    },
    [service, sync, scheduleSyncWithPc],
  );

  const updateEntry = useCallback(
    async (
      id: string,
      entry: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
    ) => {
      service.updateEntry(id, entry);
      await service.save();
      sync();
      scheduleSyncWithPc();
    },
    [service, sync, scheduleSyncWithPc],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      service.deleteEntry(id);
      await service.save();
      sync();
      scheduleSyncWithPc();
    },
    [service, sync, scheduleSyncWithPc],
  );

  // ============================================================
  // People
  // ============================================================
  const addPerson = useCallback(
    async (name: string, category: PersonCategoryId, emoji?: string) => {
      setError(null);
      try {
        const person = service.addPerson(name, category, emoji);
        await service.save();
        sync();
        scheduleSyncWithPc();
        return person;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add person.");
        return null;
      }
    },
    [service, sync, scheduleSyncWithPc],
  );

  const updatePerson = useCallback(
    async (
      id: string,
      update: { name?: string; category?: PersonCategoryId; emoji?: string },
    ) => {
      service.updatePerson(id, update);
      await service.save();
      sync();
      scheduleSyncWithPc();
    },
    [service, sync, scheduleSyncWithPc],
  );

  const deletePerson = useCallback(
    async (id: string) => {
      const result = service.deletePerson(id);
      await service.save();
      sync();
      scheduleSyncWithPc();
      return result;
    },
    [service, sync, scheduleSyncWithPc],
  );

  // ============================================================
  // Biometrics
  // ============================================================
  const enableBiometrics = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await service.enableBiometrics();
      setBiometricsEnabled(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable biometrics.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [service]);

  const disableBiometrics = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await service.disableBiometrics();
      setBiometricsEnabled(false);
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not disable biometrics.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, [service]);

  // ============================================================
  // MPIN
  // ============================================================
  const setMpin = useCallback(
    async (mpin: string, confirm: string) => {
      setError(null);
      if (!/^\d{8}$/.test(mpin)) {
        setError("MPIN must be exactly 8 digits.");
        return false;
      }
      if (mpin !== confirm) {
        setError("MPINs do not match.");
        return false;
      }
      setBusy(true);
      try {
        await service.setMpin(mpin);
        setMpinEnabled(true);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not set MPIN.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service],
  );

  const removeMpin = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await service.removeMpin();
      setMpinEnabled(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove MPIN.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [service]);

  // ============================================================
  // Master password change
  // ============================================================
  const changeMasterPassword = useCallback(
    async (current: string, next: string, confirm: string) => {
      setError(null);
      const policy = validateMasterPassword(next);
      if (!policy.valid) {
        setError(policy.errors.join(" "));
        return false;
      }
      if (next !== confirm) {
        setError("New passwords do not match.");
        return false;
      }
      setBusy(true);
      try {
        await service.changeMasterPassword(current, next);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change password.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service],
  );

  // ============================================================
  // Backup
  // ============================================================
  const exportVault = useCallback(async () => service.exportVault(), [service]);

  const importVault = useCallback(
    async (content: string, password: string, mode: ImportMode) => {
      setError(null);
      setBusy(true);
      try {
        await service.importVault(content, password, mode);
        setHasVault(true);
        sync();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  // ============================================================
  // Chrome CSV
  // ============================================================
  const importChromeCsv = useCallback(
    async (csv: string, personId: string) => {
      setError(null);
      setBusy(true);
      try {
        const rows = parseChromeCsv(csv);
        const prepared = rows.map(chromeRowToEntry);
        const count = await service.importEntriesBulk(
          personId,
          prepared.map((p) => ({ ...p })),
        );
        sync();
        return count;
      } catch (e) {
        setError(e instanceof Error ? e.message : "CSV import failed.");
        return 0;
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  const reloadFromDiskAfterSync = useCallback(async () => {
    setError(null);
    try {
      await service.mergeFromDiskAfterSync();
      sync();
      return true;
    } catch (e) {
      if (isVaultDecryptError(e)) {
        setError(
          "Phone sent a vault this PC cannot open (different master password). Restore the PC from a .pms backup, or set up both devices from the same backup.",
        );
      } else {
        setError(e instanceof Error ? e.message : "Reload failed.");
      }
      return false;
    }
  }, [service, sync]);

  const pullFromPc = useCallback(
    async (host: string, port: number) => {
      setError(null);
      setBusy(true);
      try {
        const { content, etag } = await pullVaultFromPc({ host, port });
        await service.mergeUnlockedFromRaw(content);
        storeVaultEtag(etag);
        sync();
        const at = storeLastSyncAt();
        setLastSyncAt(at);
        localDirtyRef.current = false;
        return { ok: true, message: "Merged vault from PC." };
      } catch (e) {
        let message = e instanceof Error ? e.message : "Pull failed.";
        if (isVaultDecryptError(e)) {
          message =
            "PC vault cannot be opened with this phone's key. Use Push to PC to copy the phone vault to the PC, or import the same .pms backup on both devices first.";
        }
        setError(message);
        return { ok: false, message };
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  const pushToPc = useCallback(
    async (host: string, port: number, force = false) => {
      setError(null);
      setBusy(true);
      try {
        if (!force) {
          try {
            const { content, etag } = await pullVaultFromPc({ host, port });
            await service.mergeUnlockedFromRaw(content);
            storeVaultEtag(etag);
            sync();
          } catch (e) {
            if (isVaultDecryptError(e)) {
              const message =
                "PC vault uses a different master password. Import the same .pms backup on both devices, or use Force push to replace the PC vault.";
              setError(message);
              return { ok: false, message };
            }
            const msg = e instanceof Error ? e.message : "";
            if (!msg.includes("No vault on the PC")) {
              throw e;
            }
          }
        }

        const raw = await service.exportVault();
        const result = await pushVaultToPc({
          host,
          port,
          vaultJson: raw,
          force,
        });
        if (result.ok) {
          localDirtyRef.current = false;
          const at = storeLastSyncAt();
          setLastSyncAt(at);
        } else {
          setError(result.message);
        }
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Push failed.";
        setError(message);
        return { ok: false, message };
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  return {
    ready,
    hasVault,
    unlocked,
    entries,
    people,
    biometricsEnabled,
    biometricsAvailable,
    mpinEnabled,
    error,
    busy,
    init,
    completeSetup,
    unlockWithPassword,
    unlockWithMpin,
    unlockWithBiometrics,
    lock,
    addEntry,
    updateEntry,
    deleteEntry,
    addPerson,
    updatePerson,
    deletePerson,
    enableBiometrics,
    disableBiometrics,
    setMpin,
    removeMpin,
    changeMasterPassword,
    exportVault,
    importVault,
    importChromeCsv,
    reloadFromDiskAfterSync,
    syncWithPc,
    checkRemoteSync,
    syncVisual,
    lastSyncAt,
    pulseSyncVisual,
    pullFromPc,
    pushToPc,
    setError,
    refreshMeta,
    resetApp,
  };
}
