interface LoadingIndicatorProps {
  label?: string;
  /** compact = inline; block = centered column */
  variant?: "compact" | "block";
}

export function LoadingIndicator({
  label,
  variant = "block",
}: LoadingIndicatorProps) {
  return (
    <div
      className={`loading-indicator loading-indicator--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-spinner" aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className={
              i % 3 === 0
                ? "loading-spinner-dot loading-spinner-dot--accent"
                : "loading-spinner-dot"
            }
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </div>
      {label && <p className="loading-label muted small">{label}</p>}
    </div>
  );
}
