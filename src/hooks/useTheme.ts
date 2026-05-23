import { useState, useEffect } from "react";

export type ThemeType = "nothing" | "ios-glass";

export function useTheme() {
  const [theme] = useState<ThemeType>(() => {
    const saved = localStorage.getItem("app-theme") as ThemeType;
    return saved || "nothing";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = (newTheme: ThemeType) => {
    if (newTheme === theme) return;
    localStorage.setItem("app-theme", newTheme);
    const ok = window.confirm(`Theme set to ${newTheme === "ios-glass" ? "iOS Glass" : "Nothing OS"}.\nThe app must be restarted to apply this completely new layout.\n\nRestart now?`);
    if (ok) {
      window.location.reload();
    }
  };

  return { theme, setTheme };
}
