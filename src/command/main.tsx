import { startStudioSync } from "@/lib/studio";
import React from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import CommandPreview from "./CommandPreview";
import {
  applyTheme,
  getStoredTheme,
  syncThemeFromSettings,
} from "@/lib/utils/theme";
import type { Theme } from "@/bindings";
import "@/i18n";

// Its own webview, like the recording overlay: set the theme before the first
// paint, then follow live changes from the settings window.
applyTheme(getStoredTheme());
void startStudioSync();
syncThemeFromSettings();
listen<Theme>("theme-changed", (event) => applyTheme(event.payload));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CommandPreview />
  </React.StrictMode>,
);
