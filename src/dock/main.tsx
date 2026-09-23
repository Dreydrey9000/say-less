import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  checkMicrophonePermission,
  checkAccessibilityPermission,
} from "tauri-plugin-macos-permissions-api";
import { platform } from "@tauri-apps/plugin-os";
import { useTranslation } from "react-i18next";
import { Mic, Square, Settings, GripVertical, X } from "lucide-react";
import { startStudioSync, useStudio } from "@/lib/studio";
import {
  applyTheme,
  getStoredTheme,
  syncThemeFromSettings,
} from "@/lib/utils/theme";
import "@/i18n";
import "./style.css";
applyTheme(getStoredTheme());
void syncThemeFromSettings();
void startStudioSync();
function Dock() {
  const { t } = useTranslation();
  const [state, setState] = useState("idle");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    void Promise.all([
      listen<string>("dock-state", (e) => {
        setState(e.payload);
        if (e.payload === "recording") setReady(false);
        setPending(false);
      }),
      listen("recording-ready", () => setReady(true)),
      listen<boolean>("voice-action-result", (e) => setError(!e.payload)),
    ]).then((list) => {
      if (disposed) list.forEach((fn) => fn());
      else unlisteners.push(...list);
    });
    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
    };
  }, []);
  async function record() {
    setError(false);
    setPending(true);
    try {
      if (
        platform() === "macos" &&
        (!(await checkMicrophonePermission()) ||
          !(await checkAccessibilityPermission()))
      ) {
        await invoke("show_main_window_command");
        throw Error("permissions");
      }
      await invoke("dock_toggle_recording");
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="floating-shell">
      <div className="floating-bar">
        <button
          className="dock-grip"
          aria-label={t("dock.drag")}
          title={t("dock.drag")}
          onPointerDown={(e) => {
            if (e.button === 0) void getCurrentWindow().startDragging();
          }}
        >
          <GripVertical size={18} />
        </button>
        <img src="/brand/say-less-emblem.png" alt="" />
        <button
          className="dock-record"
          disabled={pending || state === "transcribing"}
          onClick={() => void record()}
          aria-label={t(state === "recording" ? "dock.stop" : "dock.record")}
        >
          {state === "recording" ? <Square size={20} /> : <Mic size={20} />}
          <span>
            {t(
              state === "recording"
                ? "dock.stop"
                : state === "transcribing"
                  ? "dock.processing"
                  : "dock.record",
            )}
          </span>
        </button>
        <button
          aria-label={t("dock.settings")}
          onClick={() => void invoke("show_main_window_command")}
        >
          <Settings size={19} />
        </button>
        <button
          aria-label={t("dock.hide")}
          onClick={() =>
            void useStudio
              .getState()
              .save({ ...useStudio.getState().settings, floating: false })
          }
        >
          <X size={18} />
        </button>
      </div>
      <p role="status">
        {error
          ? t("dock.error")
          : t(
              state === "recording" && !ready ? "dock.arming" : `dock.${state}`,
            )}
      </p>
    </main>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(<Dock />);
