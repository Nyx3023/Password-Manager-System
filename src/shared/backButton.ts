import { useEffect, useRef } from "react";

type BackHandler = () => boolean;

const handlerStack: BackHandler[] = [];

/**
 * Register a back handler callback.
 * Handlers are invoked in LIFO order (most recent first).
 * If the handler returns `true`, the back action was consumed and stops propagation.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  handlerStack.push(handler);
  return () => {
    const idx = handlerStack.lastIndexOf(handler);
    if (idx !== -1) {
      handlerStack.splice(idx, 1);
    }
  };
}

/**
 * Trigger the registered back handlers in LIFO order.
 * Returns `true` if any handler consumed the event.
 */
export function dispatchBackEvent(): boolean {
  for (let i = handlerStack.length - 1; i >= 0; i--) {
    const handler = handlerStack[i];
    try {
      const consumed = handler();
      if (consumed) {
        return true;
      }
    } catch (e) {
      console.error("[BackButton] Handler error:", e);
    }
  }
  return false;
}

/**
 * React hook to register a back button handler for modal, view, or step.
 * Automatically cleans up on unmount or when `active` is false.
 */
export function useBackHandler(handler: BackHandler, active: boolean = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    const unregister = registerBackHandler(() => handlerRef.current());
    return unregister;
  }, [active]);
}
