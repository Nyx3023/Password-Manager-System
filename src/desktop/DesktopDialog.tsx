import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface DesktopDialogProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Centered desktop dialog - one scroll area, no mobile sheet chrome. */
export function DesktopDialog({
  title,
  open,
  onClose,
  children,
}: DesktopDialogProps) {
  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="desktop-dialog-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="desktop-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="desktop-dialog__header">
          <h2 id="desktop-dialog-title">{title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            x
          </button>
        </header>
        <div className="desktop-dialog__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
