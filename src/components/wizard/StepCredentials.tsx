import { useState } from "react";
import { generatePassword, type GeneratorOptions } from "@/shared/passwordGenerator";

export interface CredentialsState {
  username: string;
  password: string;
  url: string;
  notes: string;
}

interface StepCredentialsProps {
  defaultUrl?: string;
  value: CredentialsState;
  onChange: (next: CredentialsState) => void;
}

export function StepCredentials({
  defaultUrl,
  value,
  onChange,
}: StepCredentialsProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [genOptions, setGenOptions] = useState<GeneratorOptions>({
    length: 20,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
  });
  const [preview, setPreview] = useState("");

  // initialize URL once if empty
  const url = value.url || defaultUrl || "";
  const set = (patch: Partial<CredentialsState>) =>
    onChange({ ...value, url, ...patch });

  return (
    <div className="step-body stack">
      <label>
        Username / email
        <input
          autoFocus
          value={value.username}
          onChange={(e) => set({ username: e.target.value })}
          placeholder="user@example.com"
          autoComplete="off"
        />
      </label>

      <label>
        Password
        <div className="inline-input">
          <input
            type={showPassword ? "text" : "password"}
            value={value.password}
            onChange={(e) => set({ password: e.target.value })}
            placeholder="Type or generate"
            autoComplete="off"
          />
          <button
            type="button"
            className="ghost small"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      <button
        type="button"
        className="ghost block"
        onClick={() => {
          setShowGenerator((v) => !v);
          if (!preview) setPreview(generatePassword(genOptions));
        }}
      >
        {showGenerator ? "Hide generator" : "🎲 Generate a password"}
      </button>

      {showGenerator && (
        <div className="generator-panel">
          <div className="generated-row">
            <code>{preview || "-"}</code>
            <button
              type="button"
              className="ghost small"
              onClick={() => setPreview(generatePassword(genOptions))}
            >
              ↻
            </button>
          </div>

          <label className="range-label">
            Length: {genOptions.length}
            <input
              type="range"
              min={8}
              max={48}
              value={genOptions.length}
              onChange={(e) =>
                setGenOptions((o) => ({
                  ...o,
                  length: Number(e.target.value),
                }))
              }
            />
          </label>

          <div className="checks">
            {(
              [
                ["lowercase", "a-z"],
                ["uppercase", "A-Z"],
                ["digits", "0-9"],
                ["symbols", "!@#"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={genOptions[key]}
                  onChange={(e) =>
                    setGenOptions((o) => ({ ...o, [key]: e.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <button
            type="button"
            className="primary block"
            disabled={!preview}
            onClick={() => set({ password: preview })}
          >
            Use this password
          </button>
        </div>
      )}

      <label>
        Website (optional)
        <input
          value={url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://"
          inputMode="url"
          autoComplete="off"
        />
      </label>

      <label>
        Notes (optional)
        <textarea
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={3}
        />
      </label>
    </div>
  );
}
