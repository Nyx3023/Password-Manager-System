export type SyncIconState = "idle" | "syncing" | "success" | "error";

interface SyncIconProps {
  state: SyncIconState;
  className?: string;
}

/** Circular dual-arrow sync glyph (idle / spin / check / error center). */
export function SyncIcon({ state, className = "" }: SyncIconProps) {
  return (
    <svg
      className={`sync-icon sync-icon--${state}${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g className="sync-icon__arrows">
        <path
          d="M8.2 9.8a6.2 6.2 0 0 1 10.1-1.5M17.8 7.8l1.4-1.9M17.8 7.8l-2.3.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.8 14.2a6.2 6.2 0 0 1-10.1 1.5M6.2 16.2l-1.4 1.9M6.2 16.2l2.3-.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {state === "success" && (
        <g className="sync-icon__center">
          <circle
            cx="12"
            cy="12"
            r="4.2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M9.6 12.1l1.6 1.6 3.4-3.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {state === "error" && (
        <g className="sync-icon__center">
          <circle
            cx="12"
            cy="12"
            r="4.2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M12 9.2v4.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.1" r="0.9" fill="currentColor" />
        </g>
      )}
    </svg>
  );
}
