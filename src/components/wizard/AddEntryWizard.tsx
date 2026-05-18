import { useState } from "react";
import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_SUBCATEGORY_ID,
  getSubcategory,
} from "@/shared/catalog";
import { suggestedTitle } from "@/shared/entryUtils";
import type { Person, PersonCategoryId, VaultEntry } from "@/shared/types";
import { StepCategory } from "./StepCategory";
import { StepCredentials, type CredentialsState } from "./StepCredentials";
import { StepPerson } from "./StepPerson";
import { StepService } from "./StepService";
import { WizardShell } from "./WizardShell";

interface AddEntryWizardProps {
  people: Person[];
  onCancel: () => void;
  onAddPerson: (
    name: string,
    category: PersonCategoryId,
    emoji?: string,
  ) => Promise<Person | null>;
  onSave: (
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
}

export function AddEntryWizard({
  people,
  onCancel,
  onAddPerson,
  onSave,
}: AddEntryWizardProps) {
  const [step, setStep] = useState(1);
  const [personId, setPersonId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CredentialsState>({
    username: "",
    password: "",
    url: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const totalSteps = 4;
  const person = people.find((p) => p.id === personId);
  const sub = categoryId && subcategoryId
    ? getSubcategory(categoryId, subcategoryId)
    : null;

  const handleNext = async () => {
    if (step === 1 && !personId) return;
    if (step === 2 && !categoryId) return;
    if (step === 3 && !subcategoryId) return;
    if (step === 4) {
      if (!personId || !categoryId || !subcategoryId) return;
      if (!credentials.password) return;
      setSaving(true);
      try {
        const personName = person?.name ?? "";
        await onSave({
          title: suggestedTitle(categoryId, subcategoryId, personName),
          personId,
          personName,
          categoryId,
          subcategoryId,
          username: credentials.username,
          password: credentials.password,
          url: credentials.url || sub?.defaultUrl || "",
          notes: credentials.notes,
        });
      } finally {
        setSaving(false);
      }
      return;
    }
    setStep(step + 1);
  };

  if (step === 1) {
    return (
      <WizardShell
        step={1}
        totalSteps={totalSteps}
        title="Whose account is this?"
        subtitle="Pick the person this login belongs to."
        onCancel={onCancel}
        primaryLabel="Next"
        primaryDisabled={!personId}
        onPrimary={handleNext}
      >
        <StepPerson
          people={people}
          selectedId={personId}
          onSelect={setPersonId}
          onAddPerson={onAddPerson}
        />
      </WizardShell>
    );
  }

  if (step === 2) {
    return (
      <WizardShell
        step={2}
        totalSteps={totalSteps}
        title="What kind of account?"
        subtitle={person ? `For ${person.name}` : undefined}
        onBack={() => setStep(1)}
        onCancel={onCancel}
        primaryLabel="Next"
        primaryDisabled={!categoryId}
        onPrimary={handleNext}
      >
        <StepCategory
          selected={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            setSubcategoryId(null);
          }}
        />
      </WizardShell>
    );
  }

  if (step === 3) {
    return (
      <WizardShell
        step={3}
        totalSteps={totalSteps}
        title="Which app or site?"
        onBack={() => setStep(2)}
        onCancel={onCancel}
        primaryLabel="Next"
        primaryDisabled={!subcategoryId}
        onPrimary={handleNext}
      >
        <StepService
          categoryId={categoryId ?? DEFAULT_CATEGORY_ID}
          selected={subcategoryId}
          onSelect={setSubcategoryId}
        />
      </WizardShell>
    );
  }

  // step 4
  return (
    <WizardShell
      step={4}
      totalSteps={totalSteps}
      title="Login details"
      subtitle={
        sub && person ? `${sub.name} - ${person.name}` : undefined
      }
      onBack={() => setStep(3)}
      onCancel={onCancel}
      primaryLabel={saving ? "Saving..." : "Save entry"}
      primaryDisabled={saving || !credentials.password}
      onPrimary={handleNext}
    >
      <StepCredentials
        defaultUrl={sub?.defaultUrl}
        websiteLabel={sub?.name ?? "Website"}
        userLabel={person?.name ?? ""}
        value={credentials}
        onChange={setCredentials}
      />
    </WizardShell>
  );
}

export const WIZARD_DEFAULTS = {
  categoryId: DEFAULT_CATEGORY_ID,
  subcategoryId: DEFAULT_SUBCATEGORY_ID,
};
