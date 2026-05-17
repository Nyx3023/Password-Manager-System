import { validateMasterPassword } from "@/shared/passwordPolicy";

interface PasswordRequirementsProps {
  password: string;
}

const RULES = [
  {
    id: "len",
    test: (p: string) => p.length >= 12,
    label: "At least 12 characters",
  },
  {
    id: "letter",
    test: (p: string) => /[a-zA-Z]/.test(p),
    label: "At least one letter",
  },
  {
    id: "digit",
    test: (p: string) => /\d/.test(p),
    label: "At least one number",
  },
  {
    id: "special",
    test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p),
    label: "At least one special character",
  },
] as const;

export function PasswordRequirements({ password }: PasswordRequirementsProps) {
  const { valid } = validateMasterPassword(password);

  if (!password) {
    return (
      <p className="password-rules muted small">
        At least 12 characters with a letter, number, and special character.
      </p>
    );
  }

  return (
    <ul className={`password-rules${valid ? " password-rules--ok" : ""}`}>
      {RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={ok ? "ok" : ""}>
            <span className="password-rule-mark" aria-hidden>
              {ok ? "*" : "o"}
            </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
