import { useState } from "react";
import { PasswordGeneratorPanel } from "../PasswordGeneratorPanel";

export interface CredentialsState {
  username: string;
  password: string;
  url: string;
  notes: string;
}

interface StepCredentialsProps {
  defaultUrl?: string;
  websiteLabel?: string;
  userLabel?: string;
  value: CredentialsState;
  onChange: (next: CredentialsState) => void;
}

export function StepCredentials({
  defaultUrl,
  websiteLabel = "WEBSITE",
  userLabel = "",
  value,
  onChange,
}: StepCredentialsProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);

  const url = value.url || defaultUrl || "";
  const set = (patch: Partial<CredentialsState>) =>
    onChange({ ...value, url, ...patch });

  const generatorUser = value.username.trim() || userLabel;

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
        onClick={() => setShowGenerator((v) => !v)}
      >
        {showGenerator ? "Hide generator" : "Generate password"}
      </button>

      {showGenerator && (
        <PasswordGeneratorPanel
          websiteLabel={websiteLabel}
          userLabel={generatorUser}
          onUse={(password) => {
            set({ password });
            setShowGenerator(false);
          }}
        />
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
