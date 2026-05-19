import { Capacitor } from "@capacitor/core";

export function isDesktopApp(): boolean {
  if (import.meta.env.VITE_DESKTOP === "true") return true;
  return typeof window !== "undefined" && !!window.electronAPI?.isDesktop;
}

export function isCapacitorNative(): boolean {
  if (isDesktopApp()) return false;
  return Capacitor.isNativePlatform();
}
