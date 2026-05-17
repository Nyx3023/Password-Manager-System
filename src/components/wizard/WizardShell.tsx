import type { ReactNode } from "react";

interface WizardShellProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onCancel: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  children: ReactNode;
}

export function WizardShell({
  step,
  totalSteps,
  title,
  subtitle,
  onBack,
  onCancel,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  children,
}: WizardShellProps) {
  return (
    <div className="wizard">
      <header className="wizard-header">
        <div className="wizard-top">
          {onBack ? (
            <button type="button" className="ghost small" onClick={onBack}>
              ← Back
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="ghost small" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <div className="wizard-progress" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`wizard-dot${i + 1 === step ? " active" : ""}${i + 1 < step ? " done" : ""}`}
            />
          ))}
        </div>
        <h2 className="wizard-title">{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </header>

      <main className="wizard-body">{children}</main>

      <footer className="wizard-footer">
        <button
          type="button"
          className="primary block"
          disabled={primaryDisabled}
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
      </footer>
    </div>
  );
}
