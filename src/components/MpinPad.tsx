interface MpinPadProps {
  value: string;
  length?: number;
  size?: "default" | "large";
  /** Shake dots and flash red (e.g. wrong MPIN). */
  errorFlash?: boolean;
  onChange: (value: string) => void;
  /** Called when the user enters the full PIN; receives the completed value. */
  onComplete?: (value: string) => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "<"];

export function MpinPad({
  value,
  length = 8,
  size = "default",
  errorFlash = false,
  onChange,
  onComplete,
}: MpinPadProps) {
  const dots = Array.from({ length });

  const press = (key: string) => {
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

  return (
    <div className={`mpin-pad${size === "large" ? " mpin-pad--large" : ""}`}>
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

      <div className="mpin-keys">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              className="mpin-key"
              onClick={() => press(key)}
            >
              {key === "<" ? "⌫" : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
