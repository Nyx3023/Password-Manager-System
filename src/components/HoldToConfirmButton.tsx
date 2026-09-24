import { useState, useRef, useCallback, useEffect } from "react";

interface HoldToConfirmButtonProps {
  label: string;
  activeLabel?: string;
  durationMs?: number;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

export function HoldToConfirmButton({
  label,
  activeLabel = "Keep holding to confirm…",
  durationMs = 3000,
  onConfirm,
  disabled = false,
  className = "",
}: HoldToConfirmButtonProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [secondsRemaining, setSecondsRemaining] = useState(Math.ceil(durationMs / 1000));

  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  const reset = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    startTimeRef.current = null;
    triggeredRef.current = false;
    setHolding(false);
    setProgress(0);
    setSecondsRemaining(Math.ceil(durationMs / 1000));
  }, [durationMs]);

  const tick = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    const pct = Math.min(100, (elapsed / durationMs) * 100);
    const remaining = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));

    setProgress(pct);
    setSecondsRemaining(remaining);

    if (elapsed >= durationMs) {
      if (!triggeredRef.current) {
        triggeredRef.current = true;
        reset();
        try {
          if (navigator.vibrate) {
            navigator.vibrate([40, 60, 100]);
          }
        } catch {}
        void onConfirm();
      }
    } else {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [durationMs, onConfirm, reset]);

  const startHold = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      // Prevent text selection / callout during hold
      e.preventDefault();
      setHolding(true);
      triggeredRef.current = false;
      startTimeRef.current = Date.now();
      animFrameRef.current = requestAnimationFrame(tick);
    },
    [disabled, tick],
  );

  const cancelHold = useCallback(() => {
    if (holding && !triggeredRef.current) {
      reset();
    }
  }, [holding, reset]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={`hold-confirm-btn${holding ? " holding" : ""}${disabled ? " disabled" : ""} ${className}`}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      }}
    >
      {/* Background progress fill */}
      <div
        className="hold-confirm-fill"
        style={{
          width: `${progress}%`,
        }}
        aria-hidden="true"
      />

      {/* Button content */}
      <div className="hold-confirm-content">
        <span className="hold-confirm-icon">⚠️</span>
        <span className="hold-confirm-text">
          {holding ? (
            <>
              {activeLabel} <span className="hold-countdown">({secondsRemaining}s)</span>
            </>
          ) : (
            label
          )}
        </span>
      </div>
    </div>
  );
}
