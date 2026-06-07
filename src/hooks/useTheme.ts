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

  const setTheme = (newTheme: ThemeType, forceReload = false) => {
    if (newTheme === theme) return;
    localStorage.setItem("app-theme", newTheme);
    if (forceReload) {
      window.location.reload();
    }
  };

  return { theme, setTheme };
}
