import { isDesktopApp } from "@/shared/platform";
import AppDesktop from "@/desktop/AppDesktop";
import AppDesktopGlass from "@/desktop/AppDesktopGlass";
import AppMobile from "./AppMobile";
import AppMobileGlass from "./AppMobileGlass";
import { useTheme } from "@/hooks/useTheme";

export default function App() {
  const { theme } = useTheme(); // Initialize theme on app load
  if (isDesktopApp()) {
    return theme === "ios-glass" ? <AppDesktopGlass /> : <AppDesktop />;
  }
  return theme === "ios-glass" ? <AppMobileGlass /> : <AppMobile />;
}
