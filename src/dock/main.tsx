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
import {
  Mic,
  Square,
  Settings,
  GripVertical,
  X,
  Pause,
  Play,
  ChevronDown,
} from "lucide-react";
import { Companion, formations } from "@/components/companion/Companion";
import { useVoiceActivity } from "@/hooks/useVoiceActivity";
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
  const { state, ready, level, text } = useVoiceActivity();
  const { settings, save, busy, loaded } = useStudio();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    void Promise.all([
      listen<boolean>("voice-action-result", (e) => setError(!e.payload)),
      listen("recording-error", () => setError(true)),
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
  if (settings.dock_compact)
    return (
      <main className="compact-dock" data-state={state}>
        <button
          className="compact-companion"
          disabled={!loaded || busy}
          aria-label={t("dock.expand")}
          title={t("dock.expand")}
          onClick={() => void save({ ...settings, dock_compact: false })}
        >
          <Companion
            level={level}
            active={state === "recording"}
            paused={!settings.floating}
          />
        </button>
        {state === "recording" ? (
          <button
            className="compact-action"
            aria-label={t("dock.stop")}
            onClick={() => void record()}
          >
            <Square size={14} />
          </button>
        ) : (
          <span
            className={`compact-indicator ${error ? "has-error" : ""}`}
            role="status"
            aria-label={t(error ? "dock.error" : `dock.${state}`)}
          />
        )}
      </main>
    );
  return (
    <main className="floating-shell" data-state={state}>
      <div className="floating-bar">
        <button
          className="dock-grip"
          aria-label={t("dock.drag")}
          title={t("dock.drag")}
          onPointerDown={(e) => {
            if (e.button === 0)
              void (async () => {
                if (
                  settings.dock_edge !== "free" &&
                  !(await save({ ...settings, dock_edge: "free" }))
                )
                  return;
                await getCurrentWindow().startDragging();
              })().catch(() => setError(true));
          }}
        >
          <GripVertical size={18} />
        </button>
        <button
          className="dock-companion"
          disabled={!loaded || busy}
          aria-label={t("companion.next")}
          title={t("companion.next")}
          onClick={() => {
            const index = formations.indexOf(
              settings.dock_animation as (typeof formations)[number],
            );
            void save({
              ...settings,
              dock_animation: formations[(index + 1) % formations.length],
              dock_cycle: false,
            });
          }}
        >
          <Companion
            level={level}
            active={state === "recording"}
            paused={!settings.floating}
          />
        </button>
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
          disabled={!loaded || busy}
          aria-label={t(
            settings.dock_motion ? "companion.pause" : "companion.play",
          )}
          onClick={() =>
            void save({ ...settings, dock_motion: !settings.dock_motion })
          }
        >
          {settings.dock_motion ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          disabled={!loaded || busy}
          aria-label={t("dock.collapse")}
          title={t("dock.collapse")}
          onClick={() => void save({ ...settings, dock_compact: true })}
        >
          <ChevronDown size={18} />
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
      {state === "recording" && text && (
        <div className="dock-transcript" title={text}>
          {text}
        </div>
      )}
    </main>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(<Dock />);
