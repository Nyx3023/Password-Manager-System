import { useEffect, useState } from "react";

interface MpinPadProps {
  value: string;
  length?: number;
  size?: "default" | "large" | "desktop" | "wide-mobile";
  disabled?: boolean;
  /** Shake dots and flash red (e.g. wrong MPIN). */
  errorFlash?: boolean;
  onChange: (value: string) => void;
  /** Called when the user enters the full PIN; receives the completed value. */
  onComplete?: (value: string) => void;
  /** Whether to listen to physical keyboard (0-9, Backspace). Defaults to true. */
  enableKeyboard?: boolean;
  /** Allow collapsing on-screen keypad with a toggle button. */
  collapsibleKeypad?: boolean;
  /** Initial keypad open state when collapsibleKeypad is true. Defaults to false. */
  defaultKeypadOpen?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "<"];

export function MpinPad({
  value,
  length = 8,
  size = "default",
  errorFlash = false,
  disabled = false,
  onChange,
  onComplete,
  enableKeyboard = true,
  collapsibleKeypad,
  defaultKeypadOpen,
}: MpinPadProps) {
  const isDesktop = size === "desktop";
  const shouldCollapse = collapsibleKeypad ?? isDesktop;
  const [showKeypad, setShowKeypad] = useState<boolean>(
    defaultKeypadOpen ?? !shouldCollapse,
  );

  const dots = Array.from({ length });

  const press = (key: string) => {
    if (disabled) return;
    if (key === "<") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    const next = (value + key).slice(0, length);
    onChange(next);
    if (next.length === length && onComplete) {
      onComplete(next);
    }
  };

  useEffect(() => {
    if (!enableKeyboard || disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an active text input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        press("<");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableKeyboard, disabled, value, length]);

  const sizeClass =
    size === "large"
      ? " mpin-pad--large"
      : size === "desktop"
        ? " mpin-pad--desktop"
        : size === "wide-mobile"
          ? " mpin-pad--wide-mobile"
          : "";

  return (
    <div className={`mpin-pad${sizeClass}${disabled ? " mpin-pad--disabled" : ""}`}>
      <div
        className={`mpin-dots${errorFlash ? " mpin-dots--error mpin-dots--shake" : ""}`}
      >
        {dots.map((_, i) => (
          <span
            key={i}
            className={`mpin-dot${i < value.length ? " filled" : ""}`}
          />
        ))}
      </div>

      {shouldCollapse && (
        <div className="mpin-desktop-controls">
          <p className="mpin-keyboard-hint">
            Type {length} digits on your physical keyboard
          </p>
          <button
            type="button"
            className="ghost small mpin-keypad-toggle"
            onClick={() => setShowKeypad((prev) => !prev)}
            aria-expanded={showKeypad}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
            </svg>
            <span>{showKeypad ? "Hide on-screen keypad" : "Show on-screen keypad"}</span>
          </button>
        </div>
      )}

      {showKeypad && (
        <div className="mpin-keys">
          {KEYS.map((key, i) =>
            key === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                className="mpin-key"
                disabled={disabled}
                onClick={() => press(key)}
              >
                {key === "<" ? "⌫" : key}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
