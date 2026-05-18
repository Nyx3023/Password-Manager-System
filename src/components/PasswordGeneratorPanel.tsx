import { useState } from "react";
import {
  generatePassword,
  generateWebsiteFormatPassword,
  type GeneratorOptions,
} from "@/shared/passwordGenerator";

type GeneratorMode = "website" | "random";

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
  const [preview, setPreview] = useState(() =>
    generateWebsiteFormatPassword(websiteLabel, userLabel),
  );

  const refresh = () => {
    if (mode === "website") {
      setPreview(generateWebsiteFormatPassword(websiteLabel, userLabel));
    } else {
      setPreview(generatePassword(genOptions));
    }
  };

  const switchMode = (next: GeneratorMode) => {
    setMode(next);
    setPreview(
      next === "website"
        ? generateWebsiteFormatPassword(websiteLabel, userLabel)
        : generatePassword(genOptions),
    );
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
      </div>

      {mode === "website" ? (
        <p className="muted small generator-hint">
          Template: <code>WEBSITE_user.######</code>
          <br />
          Example: <code>{siteExample}_{userExample}.123456</code>
        </p>
      ) : (
        <p className="muted small generator-hint">
          Random password with letters, numbers, and symbols.
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
