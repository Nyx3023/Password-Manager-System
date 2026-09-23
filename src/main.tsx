import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

try {
  localStorage.removeItem("app-theme");
  document.documentElement.dataset.theme = "nothing";
} catch {}

if (import.meta.env.VITE_DESKTOP === "true") {
  void import("./desktop/desktop.css");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
