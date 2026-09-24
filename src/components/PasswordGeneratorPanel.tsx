import { useState } from "react";
import {
  generatePassword,
  generateWebsiteFormatPassword,
  generatePassphrase,
  type GeneratorOptions,
  type PassphraseOptions,
} from "@/shared/passwordGenerator";

type GeneratorMode = "website" | "random" | "passphrase";

interface PasswordGeneratorPanelProps {
  websiteLabel: string;
  userLabel: string;
  onUse: (password: string) => void;
}

function siteTokenPreview(websiteLabel: string): string {
  const letters = websiteLabel.replace(/[^a-zA-Z0-9]/g, "");
  return (letters || "WEBSITE").toUpperCase();
}

function userTokenPreview(userLabel: string): string {
  const raw = userLabel.trim();
  const local = raw.includes("@") ? raw.split("@")[0]! : raw;
  const letters = local.replace(/[^a-zA-Z0-9]/g, "");
  return (letters || "user").toLowerCase();
}

export function PasswordGeneratorPanel({
  websiteLabel,
  userLabel,
  onUse,
}: PasswordGeneratorPanelProps) {
  const [mode, setMode] = useState<GeneratorMode>("website");
  const [genOptions, setGenOptions] = useState<GeneratorOptions>({
    length: 20,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
  });
  const [passphraseOptions, setPassphraseOptions] = useState<PassphraseOptions>({
    wordCount: 4,
    separator: "-",
    capitalize: true,
    includeNumber: true,
  });
  const [preview, setPreview] = useState(() =>
    generateWebsiteFormatPassword(websiteLabel, userLabel),
  );

  const refresh = () => {
    if (mode === "website") {
      setPreview(generateWebsiteFormatPassword(websiteLabel, userLabel));
    } else if (mode === "random") {
      setPreview(generatePassword(genOptions));
    } else {
      setPreview(generatePassphrase(passphraseOptions));
    }
  };

  const switchMode = (next: GeneratorMode) => {
    setMode(next);
    if (next === "website") {
      setPreview(generateWebsiteFormatPassword(websiteLabel, userLabel));
    } else if (next === "random") {
      setPreview(generatePassword(genOptions));
    } else {
      setPreview(generatePassphrase(passphraseOptions));
    }
  };

  const siteExample = siteTokenPreview(websiteLabel);
  const userExample = userTokenPreview(userLabel);

  return (
    <div className="generator-panel">
      <div className="generator-mode-tabs">
        <button
          type="button"
          className={`generator-mode-tab${mode === "website" ? " active" : ""}`}
          onClick={() => switchMode("website")}
        >
          Website format
        </button>
        <button
          type="button"
          className={`generator-mode-tab${mode === "random" ? " active" : ""}`}
          onClick={() => switchMode("random")}
        >
          Random
        </button>
        <button
          type="button"
          className={`generator-mode-tab${mode === "passphrase" ? " active" : ""}`}
          onClick={() => switchMode("passphrase")}
        >
          Passphrase
        </button>
      </div>

      {mode === "website" && (
        <p className="muted small generator-hint">
          Template: <code>WEBSITE_user.######</code>
          <br />
          Example: <code>{siteExample}_{userExample}.123456</code>
        </p>
      )}

      {mode === "random" && (
        <p className="muted small generator-hint">
          Random password with letters, numbers, and symbols.
        </p>
      )}

      {mode === "passphrase" && (
        <p className="muted small generator-hint">
          Memorable passphrase generated using EFF Diceware wordlist.
        </p>
      )}

      <div className="generated-row">
        <code>{preview || "-"}</code>
        <button type="button" className="ghost small" onClick={refresh}>
          Refresh
        </button>
      </div>

      {mode === "random" && (
        <>
          <label className="range-label">
            Length: {genOptions.length}
            <input
              type="range"
              min={8}
              max={48}
              value={genOptions.length}
              onChange={(e) => {
                const next = { ...genOptions, length: Number(e.target.value) };
                setGenOptions(next);
                setPreview(generatePassword(next));
              }}
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
                  onChange={(e) => {
                    const next = { ...genOptions, [key]: e.target.checked };
                    setGenOptions(next);
                    try {
                      setPreview(generatePassword(next));
                    } catch {
                      // ignore if none selected
                    }
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </>
      )}

      {mode === "passphrase" && (
        <>
          <label className="range-label">
            Words: {passphraseOptions.wordCount ?? 4}
            <input
              type="range"
              min={3}
              max={8}
              value={passphraseOptions.wordCount ?? 4}
              onChange={(e) => {
                const next = { ...passphraseOptions, wordCount: Number(e.target.value) };
                setPassphraseOptions(next);
                setPreview(generatePassphrase(next));
              }}
            />
          </label>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
            <span className="muted small">Separator:</span>
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { label: "Hyphen (-)", value: "-" },
                { label: "Period (.)", value: "." },
                { label: "Underscore (_)", value: "_" },
                { label: "Space ( )", value: " " },
              ].map((sep) => (
                <button
                  key={sep.value}
                  type="button"
                  className={`ghost small${passphraseOptions.separator === sep.value ? " active" : ""}`}
                  style={{
                    padding: "4px 8px",
                    borderColor: passphraseOptions.separator === sep.value ? "var(--accent)" : "var(--border)",
                    color: passphraseOptions.separator === sep.value ? "var(--accent)" : "inherit",
                  }}
                  onClick={() => {
                    const next = { ...passphraseOptions, separator: sep.value };
                    setPassphraseOptions(next);
                    setPreview(generatePassphrase(next));
                  }}
                >
                  {sep.label}
                </button>
              ))}
            </div>
          </div>

          <div className="checks">
            <label className="check">
              <input
                type="checkbox"
                checked={passphraseOptions.capitalize ?? false}
                onChange={(e) => {
                  const next = { ...passphraseOptions, capitalize: e.target.checked };
                  setPassphraseOptions(next);
                  setPreview(generatePassphrase(next));
                }}
              />
              Capitalize Words
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={passphraseOptions.includeNumber ?? false}
                onChange={(e) => {
                  const next = { ...passphraseOptions, includeNumber: e.target.checked };
                  setPassphraseOptions(next);
                  setPreview(generatePassphrase(next));
                }}
              />
              Append Number
            </label>
          </div>
        </>
      )}

      <button
        type="button"
        className="primary block"
        disabled={!preview}
        onClick={() => onUse(preview)}
      >
        Use this password
      </button>
    </div>
  );
}
