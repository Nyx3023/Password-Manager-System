import { isDesktopApp } from "@/shared/platform";
import AppDesktop from "@/desktop/AppDesktop";
import AppMobile from "./AppMobile";

export default function App() {
  return isDesktopApp() ? <AppDesktop /> : <AppMobile />;
}
