import { useEffect, useRef } from "react";

const EVENTS: (keyof WindowEventMap)[] = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
];

export function useAutoLock(
  enabled: boolean,
  timeoutMs: number,
  onLock: () => void,
) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(onLock, timeoutMs);
    };

    reset();
    for (const event of EVENTS) {
      window.addEventListener(event, reset, { passive: true });
    }

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      for (const event of EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [enabled, timeoutMs, onLock]);
}
