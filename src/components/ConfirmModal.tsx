import { useState, useRef, useEffect } from "react";
import { Modal } from "./Modal";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

interface HoldButtonProps {
  onTrigger: () => void;
  className?: string;
  children: React.ReactNode;
}

function HoldButton({ onTrigger, className = "", children }: HoldButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [shake, setShake] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startHold = (e: React.MouseEvent | React.TouchEvent) => {
    // Avoid double triggering for mouse/touch interactions
    if (e.type === "touchstart") {
      // Prevent scrolling while holding
      if (e.cancelable) e.preventDefault();
    }
    
    setIsHolding(true);
    startTimeRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      onTrigger();
      setIsHolding(false);
    }, 1000);
  };

  const cancelHold = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed < 300) {
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
    }
    setIsHolding(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      className={`${className} hold-btn${isHolding ? " holding" : ""}${shake ? " shake" : ""}`}
      style={{
        position: "relative",
        overflow: "hidden",
        flex: 1,
      }}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
    >
      <span
        className="hold-btn-fill"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: isHolding ? "100%" : "0%",
          background: "var(--accent)",
          opacity: 0.35,
          transition: isHolding ? "width 1s linear" : "width 0.15s ease-out",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
    </button>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmModalProps) {
  return (
    <Modal title={title} open={open} onClose={onCancel}>
      <div className="stack" style={{ gap: "16px" }}>
        <p className="muted small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
          <button type="button" className="ghost" onClick={onCancel} style={{ flex: 1 }}>
            {cancelText}
          </button>
          {danger ? (
            <HoldButton
              className="ghost danger"
              onTrigger={onConfirm}
            >
              Hold to {confirmText}
            </HoldButton>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={onConfirm}
              style={{ flex: 1 }}
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
