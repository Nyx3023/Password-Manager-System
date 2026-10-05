import { useCallback, useMemo, useState } from "react";
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
import { clearActiveVaultSlot, getVaultOwnerInfo, loadPrefs, resetAllAppData, savePrefs } from "@/shared/storage";
import { archiveCurrentVault, removeArchivedVault } from "@/shared/accountVaults";
import {
  deleteRemoteVaultFromFirebase,
  saveFirebaseSyncState,
  signOutFirebase,
  stopRemoteVaultSubscription,
  uploadVaultToFirebase,
} from "@/shared/firebaseSync";
import { VaultService } from "@/shared/vaultService";
import type {
  ImportMode,
  Person,
  PersonCategoryId,
  TrashEntry,
  VaultEntry,
} from "@/shared/types";

/** Default auto-lock timeout: 5 minutes of inactivity. */
export const DEFAULT_AUTO_LOCK_MS = 5 * 60 * 1000;

export function useVault() {
  const service = useMemo(() => new VaultService(), []);
  const [ready, setReady] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [mpinEnabled, setMpinEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(() => {
    setEntries([...service.entries]);
    setTrashEntries([...service.trashEntries]);
    setPeople([...service.people]);
    setUnlocked(service.isUnlocked);
    // MPIN presence must come from disk (refreshMeta / setMpin / removeMpin).
    // service.hasMpin is false while the vault is locked even if MPIN exists.
    if (service.isUnlocked) {
      void syncAutofillSession(service.entries, service.people);
    }
  }, [service]);

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
        await service.createVault(
          data.password,
          data.ownerUid ? { uid: data.ownerUid, email: data.ownerEmail } : undefined,
        );
        for (const person of data.people) {
          service.addPerson(person.name, person.category);
        }
        await service.save();

        if (data.cloudMode && data.ownerUid) {
          await saveFirebaseSyncState({
            enabled: true,
            userId: data.ownerUid,
            userEmail: data.ownerEmail,
            ownerUid: data.ownerUid,
            ownerEmail: data.ownerEmail,
            lastSyncStatus: "idle",
            lastError: null,
          });
          try {
            const raw = await service.exportVault();
            await uploadVaultToFirebase(raw);
          } catch (e) {
            console.warn("[useVault] Immediate cloud upload notice:", e);
          }
        }

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
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unlock failed.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  const unlockWithMpin = useCallback(
    async (mpin: string) => {
      setError(null);
      setBusy(true);
      try {
        await service.unlockWithMpin(mpin);
        sync();
        return true;
      } catch (e) {
        // Surface rate-limit and MPIN-wipe errors from the service.
        const msg = e instanceof Error ? e.message : "";
        if (
          msg.includes("Too many") ||
          msg.includes("MPIN disabled") ||
          msg.includes("not set")
        ) {
          setError(msg);
          if (msg.includes("MPIN disabled")) {
            setMpinEnabled(false);
          }
        } else {
          setError(null);
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
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
  }, [service, sync]);

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
      stopRemoteVaultSubscription();
      try {
        await signOutFirebase();
      } catch {}
      service.lock();
      await clearAutofillSession();
      await disableBiometricUnlock();
      await resetAllAppData();
      setHasVault(false);
      setUnlocked(false);
      setEntries([]);
      setTrashEntries([]);
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

  const switchAccount = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const ownerInfo = await getVaultOwnerInfo();
      const currentUid = ownerInfo?.ownerUid || service.ownerUid;
      const currentEmail = ownerInfo?.ownerEmail || service.ownerEmail;

      // 1. Archive current vault if present
      await archiveCurrentVault(currentUid, currentEmail);

      // 2. Stop cloud listener
      stopRemoteVaultSubscription();

      // 3. Disconnect Firebase / Google session
      try {
        await signOutFirebase();
      } catch {}

      // 4. Clear memory and autofill
      service.lock();
      await clearAutofillSession();
      await disableBiometricUnlock();

      // 5. Wipe active slot files so SetupWizard / account picker is shown (keeps auth tokens intact)
      await clearActiveVaultSlot();

      // 5. Reset hook states
      setHasVault(false);
      setUnlocked(false);
      setEntries([]);
      setTrashEntries([]);
      setPeople([]);
      setBiometricsEnabled(false);
      setMpinEnabled(false);
      await refreshMeta();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to switch account.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [service, refreshMeta]);

  const deleteAccountAndVault = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const ownerInfo = await getVaultOwnerInfo();
      const currentUid = ownerInfo?.ownerUid || service.ownerUid;

      // 1. Delete remote cloud vault from Firestore
      try {
        await deleteRemoteVaultFromFirebase();
      } catch (e) {
        console.warn("[useVault] Cloud vault deletion notice:", e);
      }
      // 2. Disconnect and sign out of Firebase
      try {
        await signOutFirebase();
      } catch {}

      // 3. Stop active listeners
      stopRemoteVaultSubscription();

      // 4. Lock in-memory vault and clear credentials
      service.lock();
      await clearAutofillSession();
      await disableBiometricUnlock();

      // 5. Remove any local archives for this account
      if (currentUid) {
        await removeArchivedVault(currentUid);
      }

      // 6. Factory reset all local storage files (vault, backups, mpin, prefs, etc.)
      await resetAllAppData();

      // 7. Reset hook states
      setHasVault(false);
      setUnlocked(false);
      setEntries([]);
      setTrashEntries([]);
      setPeople([]);
      setBiometricsEnabled(false);
      setMpinEnabled(false);
      await refreshMeta();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete account.");
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
    },
    [service, sync],
  );

  const updateEntry = useCallback(
    async (
      id: string,
      entry: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
    ) => {
      service.updateEntry(id, entry);
      await service.save();
      sync();
    },
    [service, sync],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      service.deleteEntry(id);
      await service.save();
      sync();
    },
    [service, sync],
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
        return person;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add person.");
        return null;
      }
    },
    [service, sync],
  );

  const updatePerson = useCallback(
    async (
      id: string,
      update: { name?: string; category?: PersonCategoryId; emoji?: string },
    ) => {
      service.updatePerson(id, update);
      await service.save();
      sync();
    },
    [service, sync],
  );

  const deletePerson = useCallback(
    async (id: string) => {
      const result = service.deletePerson(id);
      await service.save();
      sync();
      return result;
    },
    [service, sync],
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
        if (mode === "replace") {
          setBiometricsEnabled(false);
          setMpinEnabled(false);
          const prefs = await loadPrefs();
          prefs.setupComplete = true;
          await savePrefs(prefs);
        }
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

  const verifyBackupPassword = useCallback(
    async (content: string, password: string) => {
      setError(null);
      setBusy(true);
      try {
        await service.verifyVaultBackup(content, password);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid password or corrupted backup.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service]
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

  const mergeUnlockedFromRaw = useCallback(
    async (fileContent: string) => {
      setError(null);
      await service.mergeUnlockedFromRaw(fileContent);
      sync();
    },
    [service, sync],
  );

  const restoreTrashEntry = useCallback(
    async (id: string) => {
      setError(null);
      setBusy(true);
      try {
        const item = service.restoreTrashEntry(id);
        await service.save();
        sync();
        return item;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Restore failed.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  const purgeTrashEntry = useCallback(
    async (id: string) => {
      setError(null);
      setBusy(true);
      try {
        service.purgeTrashEntry(id);
        await service.save();
        sync();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  const emptyTrash = useCallback(
    async () => {
      setError(null);
      setBusy(true);
      try {
        service.emptyTrash();
        await service.save();
        sync();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Empty trash failed.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  const importTotpAccounts = useCallback(
    async (
      accounts: { name: string; issuer?: string; secret: string; digits?: number; period?: number }[],
      personId: string,
    ) => {
      setError(null);
      setBusy(true);
      try {
        const count = await service.importTotpAccounts(accounts, personId);
        sync();
        return count;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
        return 0;
      } finally {
        setBusy(false);
      }
    },
    [service, sync],
  );

  return {
    ready,
    hasVault,
    vaultId: service.vaultId,
    ownerUid: service.ownerUid,
    ownerEmail: service.ownerEmail,
    setOwner: service.setOwner,
    unlocked,
    entries,
    trashEntries,
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
    restoreTrashEntry,
    purgeTrashEntry,
    emptyTrash,
    importTotpAccounts,
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
    mergeUnlockedFromRaw,
    setError,
    refreshMeta,
    resetApp,
    switchAccount,
    deleteAccountAndVault,
    verifyBackupPassword,
  };
}
