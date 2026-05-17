import { useCallback, useMemo, useState } from "react";
import type { SetupData } from "@/components/setup/SetupWizard";
import {
  disableBiometricUnlock,
  isBiometricAvailable,
  unlockWithBiometric,
} from "@/shared/biometrics";
import { chromeRowToEntry, parseChromeCsv } from "@/shared/chromeCsv";
import { downloadAllCatalogIcons, type DownloadProgress } from "@/shared/iconCache";
import { validateMasterPassword } from "@/shared/passwordPolicy";
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

  const sync = useCallback(() => {
    setEntries([...service.entries]);
    setPeople([...service.people]);
    setUnlocked(service.isUnlocked);
    // MPIN presence must come from disk (refreshMeta / setMpin / removeMpin).
    // service.hasMpin is false while the vault is locked even if MPIN exists.
  }, [service]);

  const refreshMeta = useCallback(async () => {
    const [exists, prefs, bioAvailable, hasMpin] = await Promise.all([
      service.exists(),
      service.getPrefs(),
      isBiometricAvailable(),
      service.hasMpinOnDisk(),
    ]);
    setHasVault(exists);
    setBiometricsEnabled(prefs.biometricsEnabled);
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
    async (data: SetupData, onIconProgress: (p: DownloadProgress) => void) => {
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

        await downloadAllCatalogIcons(onIconProgress);

        const prefs = await loadPrefs();
        prefs.setupComplete = true;
        prefs.iconsBootstrapped = true;
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
      } catch {
        setError(null);
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
      await service.unlockWithVaultKey(vaultKey);
      vaultKey.fill(0);
      sync();
      return true;
    } catch {
      setError(null);
      return false;
    } finally {
      setBusy(false);
    }
  }, [service, sync]);

  const lock = useCallback(() => {
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
    setError,
    refreshMeta,
    resetApp,
  };
}
