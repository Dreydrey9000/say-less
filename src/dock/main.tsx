import ReactDOM from "react-dom/client";
import { useEffect, useRef, useState } from "react";
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
  ChevronDown,
  MonitorPlay,
  FolderOpen,
} from "lucide-react";
import { Companion, formations } from "@/components/companion/Companion";
import { useVoiceActivity } from "@/hooks/useVoiceActivity";
import { startStudioSync, useStudio } from "@/lib/studio";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  formatElapsed,
  startScreenRecordingSync,
  unsupportedKey,
  useElapsed,
  useScreenRecording,
} from "@/lib/screenRecording";
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
startScreenRecordingSync();

/** How long the dock offers "Show in Finder" after a recording is saved. */
const SAVED_NOTE_MS = 12_000;

/** Screen recording controls shared by the compact and expanded dock. */
function useDockScreenRecording() {
  const rec = useScreenRecording();
  const elapsed = useElapsed(rec.startedAt);
  const [showSaved, setShowSaved] = useState(false);
  const lastFile = rec.status?.last_file;
  useEffect(() => {
    if (!rec.justSaved || !lastFile) return;
    setShowSaved(true);
    const id = window.setTimeout(() => setShowSaved(false), SAVED_NOTE_MS);
    return () => window.clearTimeout(id);
  }, [rec.justSaved, lastFile]);
  const state = rec.status?.state ?? "idle";
  const recording = state === "recording" || state === "stopping";
  return {
    ...rec,
    state,
    recording,
    time: formatElapsed(elapsed),
    busy: rec.pending || state === "starting" || state === "stopping",
    supported: rec.status?.supported ?? false,
    showSaved: showSaved && state === "idle" && rec.justSaved,
    async toggleFromDock() {
      await rec.toggle();
      const notice = useScreenRecording.getState().notice;
      // The dock is too small to explain permissions; the main window does.
      if (notice === "permission_denied" || notice === "microphone_denied")
        await invoke("show_main_window_command").catch(() => undefined);
    },
  };
}

function ScreenButton({ compact }: { compact: boolean }) {
  const { t } = useTranslation();
  const rec = useDockScreenRecording();
  if (!rec.status) return null;
  if (!rec.supported) {
    const reason = t(unsupportedKey(rec.status.unsupported_reason));
    return (
      <Tooltip
        label={reason}
        placement="bottom"
        align="end"
        className={compact ? "compact-screen-anchor" : ""}
      >
        {/* aria-disabled keeps it focusable so the reason can be read. */}
        <button
          className={compact ? "compact-screen" : "dock-screen"}
          aria-disabled="true"
          data-unsupported="true"
        >
          <MonitorPlay size={compact ? 15 : 18} aria-hidden="true" />
        </button>
      </Tooltip>
    );
  }
  if (rec.recording)
    return (
      <Tooltip
        label={t("screenRecording.stopLabel")}
        placement="bottom"
        align={compact ? "center" : "end"}
        className={compact ? "compact-screen-live-anchor" : ""}
      >
        <button
          className={compact ? "compact-screen-live" : "dock-screen is-live"}
          disabled={rec.busy}
          aria-busy={rec.busy || undefined}
          onClick={() => void rec.toggleFromDock()}
        >
          <span className="rec-dot" aria-hidden="true" />
          <span className="rec-time" role="timer">
            {rec.time}
          </span>
          {!compact && <Square size={14} aria-hidden="true" />}
        </button>
      </Tooltip>
    );
  return (
    <Tooltip
      label={t(
        rec.state === "starting"
          ? "screenRecording.starting"
          : "screenRecording.start",
      )}
      placement="bottom"
      align="end"
      className={compact ? "compact-screen-anchor" : ""}
    >
      <button
        className={compact ? "compact-screen" : "dock-screen"}
        disabled={rec.busy}
        aria-busy={rec.busy || undefined}
        onClick={() => void rec.toggleFromDock()}
      >
        <MonitorPlay size={compact ? 15 : 18} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

function Dock() {
  const { t } = useTranslation();
  const { state, ready, level, text } = useVoiceActivity();
  const { settings, save, busy, loaded } = useStudio();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const screen = useDockScreenRecording();
  // Expanding or collapsing swaps the whole dock, which would drop keyboard
  // focus to <body>. When the user toggled it here, land focus on the control
  // that undoes the change.
  const toggledHere = useRef(false);
  const expandRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!toggledHere.current) return;
    toggledHere.current = false;
    (settings.dock_compact ? expandRef : collapseRef).current?.focus();
  }, [settings.dock_compact]);
  function setCompact(compact: boolean) {
    toggledHere.current = true;
    void save({ ...settings, dock_compact: compact });
  }
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
        <ScreenButton compact />
        {screen.showSaved && (
          <Tooltip
            label={`${t("screenRecording.saved")} ${t("screenRecording.showInFinder")}`}
            placement="bottom"
            align="start"
            className="compact-saved-anchor"
          >
            <button
              className="compact-saved"
              onClick={() => void screen.reveal()}
            >
              <FolderOpen size={15} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        <Tooltip label={t("dock.expand")} placement="inside">
          <button
            ref={expandRef}
            className="compact-companion"
            disabled={!loaded || busy}
            onClick={() => setCompact(false)}
          >
            <Companion
              level={level}
              active={state === "recording"}
              thinking={state === "transcribing"}
              paused={!settings.floating}
            />
          </button>
        </Tooltip>
        {state === "recording" ? (
          <Tooltip
            label={t("dock.stop")}
            placement="top"
            align="end"
            className="compact-action-anchor"
          >
            <button className="compact-action" onClick={() => void record()}>
              <Square size={14} />
            </button>
          </Tooltip>
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
        <Tooltip label={t("dock.drag")} placement="bottom" align="start">
          <button
            className="dock-grip"
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
        </Tooltip>
        <Tooltip label={t("companion.next")} placement="bottom" align="start">
          <button
            className="dock-companion"
            disabled={!loaded || busy}
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
              thinking={state === "transcribing"}
              paused={!settings.floating}
            />
          </button>
        </Tooltip>
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
        <ScreenButton compact={false} />
        <Tooltip label={t("dock.settings")} placement="bottom" align="end">
          <button onClick={() => void invoke("show_main_window_command")}>
            <Settings size={19} />
          </button>
        </Tooltip>
        <Tooltip label={t("dock.collapse")} placement="bottom" align="end">
          <button
            ref={collapseRef}
            aria-label={t("dock.collapse")}
            disabled={!loaded || busy}
            onClick={() => setCompact(true)}
          >
            <ChevronDown size={18} />
          </button>
        </Tooltip>
        <Tooltip label={t("dock.hide")} placement="bottom" align="end">
          <button
            onClick={() =>
              void useStudio
                .getState()
                .save({ ...useStudio.getState().settings, floating: false })
            }
          >
            <X size={18} />
          </button>
        </Tooltip>
      </div>
      {screen.showSaved && state === "idle" && !error ? (
        <div className="dock-screen-note" role="status">
          <span>{t("screenRecording.saved")}</span>
          <button onClick={() => void screen.reveal()}>
            {t("screenRecording.showInFinder")}
          </button>
        </div>
      ) : (
        <p role="status">
          {error
            ? t("dock.error")
            : t(
                state === "recording" && !ready
                  ? "dock.arming"
                  : `dock.${state}`,
              )}
        </p>
      )}
      {state === "recording" && text && (
        <div className="dock-transcript" title={text}>
          {text}
        </div>
      )}
    </main>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(<Dock />);
