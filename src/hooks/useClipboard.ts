import { useEffect, useRef, useState } from "react";
import { isDesktopApp } from "@/shared/platform";

export function useClipboard(clearAfterMs = 20_000) {
  const timer = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const lastCopiedText = useRef<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const clear = async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSecondsRemaining(null);

    // Desktop: purge native clipboard via Electron
    if (isDesktopApp() && window.electronAPI?.clearClipboard) {
      try {
        await window.electronAPI.clearClipboard();
      } catch (_) {}
    }

    // Web / Mobile: double-clear to defeat managers skipping empty writes
    try {
      await navigator.clipboard.writeText(" ");
      await navigator.clipboard.writeText("");
    } catch (_) {}
    lastCopiedText.current = null;
  };

  const copy = async (text: string) => {
    lastCopiedText.current = text;

    if (isDesktopApp() && window.electronAPI?.writeSecureClipboard) {
      try {
        await window.electronAPI.writeSecureClipboard(text);
      } catch (_) {
        await navigator.clipboard.writeText(text);
      }
    } else {
      await navigator.clipboard.writeText(text);
    }

    if (timer.current) window.clearTimeout(timer.current);
    if (intervalRef.current) window.clearInterval(intervalRef.current);

    let remaining = Math.round(clearAfterMs / 1000);
    setSecondsRemaining(remaining);

    intervalRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        intervalRef.current = null;
        setSecondsRemaining(null);
      } else {
        setSecondsRemaining(remaining);
      }
    }, 1000);

    timer.current = window.setTimeout(async () => {
      try {
        if (isDesktopApp() && window.electronAPI?.clearClipboard) {
          await window.electronAPI.clearClipboard();
        } else {
          const current = await navigator.clipboard.readText();
          if (current === text) {
            await navigator.clipboard.writeText(" ");
            await navigator.clipboard.writeText("");
          }
        }
      } catch (_) {}
      lastCopiedText.current = null;
      setSecondsRemaining(null);
    }, clearAfterMs);
  };

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  return { copy, clear, secondsRemaining };
}
