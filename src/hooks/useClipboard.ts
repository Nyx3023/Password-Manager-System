import { useRef } from "react";

export function useClipboard(clearAfterMs = 10_000) {
  const timer = useRef<number | null>(null);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === text) {
          // Double-clear defeats clipboard managers that skip empty writes.
          await navigator.clipboard.writeText(" ");
          await navigator.clipboard.writeText("");
        }
      } catch {
        // Clipboard read may be blocked.
      }
    }, clearAfterMs);
  };

  return { copy };
}

