import ReactDOM from "react-dom/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
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
  Video,
} from "lucide-react";
import {
  OPEN_RECORDING_SETUP_EVENT,
  startRecordingOptionsSync,
  useRecordingOptions,
} from "@/lib/recordingOptions";
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
startRecordingOptionsSync();

/** After Stop, Record takes its place under the pointer. Clicks are ignored
 * this long, so a double-click saves the video and doesn't start a new one. */
const AFTER_STOP_MS = 700;

/** Screen recording controls shared by the compact and expanded dock. */
function useDockScreenRecording() {
  const rec = useScreenRecording();
  const elapsed = useElapsed(rec.startedAt);
  const [showSaved, setShowSaved] = useState(false);
  const lastFile = rec.status?.last_file;
  // "Show in Finder" is the dock's only way to the new video, so it stays
  // until the next recording or dictation starts, or the user closes it.
  useEffect(() => {
    if (rec.justSaved && lastFile) setShowSaved(true);
  }, [rec.justSaved, lastFile]);
  const hideSaved = useCallback(() => setShowSaved(false), []);
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
    hideSaved,
    async toggleFromDock() {
      await rec.toggle();
      // TODO(card-permissions merge): drop the string widening so these
      // names are checked against RecordingNotice again.
      const notice: string | null = useScreenRecording.getState().notice;
      // The dock is too small to explain permissions; the main window does.
      if (
        notice === "permission_denied" ||
        notice === "microphone_denied" ||
        notice === "camera_denied" ||
        notice === "camera_failed" ||
        notice === "camera_missing" ||
        notice === "window_missing"
      ) {
        await invoke("show_main_window_command").catch(() => undefined);
        await emit("open-recording-home").catch(() => undefined);
      }
    },
  };
}

function ScreenButton({
  compact,
  dictating = false,
}: {
  compact: boolean;
  dictating?: boolean;
}) {
  const { t } = useTranslation();
  const rec = useDockScreenRecording();
  // A ref, not state: the second click of a double-click can arrive before
  // React re-renders.
  const ignoreUntil = useRef(0);
  const [settling, setSettling] = useState(false);
  // After a Stop click the pointer is still on the button, and its tooltip
  // would cover the Saved line. It stays hidden until the pointer leaves.
  const [quietTip, setQuietTip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!settling) return;
    const id = window.setTimeout(() => setSettling(false), AFTER_STOP_MS);
    return () => window.clearTimeout(id);
  }, [settling]);
  // WebKit sends no pointer events to a disabled button, so a pointer that
  // left while the video was saving was never seen leaving. Once the button
  // works again, ask whether the pointer is still on it.
  useEffect(() => {
    const idle = !settling && !rec.busy;
    if (quietTip && idle && !buttonRef.current?.matches(":hover"))
      setQuietTip(false);
  }, [quietTip, settling, rec.busy]);
  async function press(byPointer: boolean) {
    if (Date.now() < ignoreUntil.current) return;
    const stopping = rec.recording;
    if (stopping && byPointer) setQuietTip(true);
    await rec.toggleFromDock();
    if (stopping) {
      ignoreUntil.current = Date.now() + AFTER_STOP_MS;
      setSettling(true);
    }
  }
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
          ref={buttonRef}
          className={compact ? "compact-screen-live" : "dock-screen is-live"}
          disabled={rec.busy}
          aria-busy={rec.busy || undefined}
          onPointerLeave={() => setQuietTip(false)}
          onClick={(event) => void press(event.detail > 0)}
        >
          <span className="rec-dot" aria-hidden="true" />
          <span className="rec-time" role="timer">
            {rec.time}
          </span>
          {!compact && (
            <>
              <Square size={14} fill="currentColor" aria-hidden="true" />
              {/* While dictating, the Talk pill owns the word Stop. */}
              {!dictating && <span>{t("dock.stop")}</span>}
            </>
          )}
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
      className={`${compact ? "compact-screen-anchor" : ""} ${quietTip ? "tip-hidden" : ""}`}
    >
      <button
        ref={buttonRef}
        className={compact ? "compact-screen" : "dock-screen"}
        disabled={rec.busy}
        aria-busy={rec.busy || undefined}
        // aria-disabled, not disabled, so keyboard focus stays put.
        aria-disabled={settling || undefined}
        onPointerLeave={() => setQuietTip(false)}
        onClick={(event) => void press(event.detail > 0)}
      >
        <MonitorPlay size={compact ? 15 : 18} aria-hidden="true" />
        {!compact && <span>{t("dock.screen")}</span>}
      </button>
    </Tooltip>
  );
}

function Dock() {
  const { t } = useTranslation();
  const { state, ready, level, text, listening } = useVoiceActivity();
  const { settings, save, busy, loaded } = useStudio();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const screen = useDockScreenRecording();
  // Show your face, from the saved setup the main window edits. Until it
  // loads the camera button only names what it opens.
  const faceOn = useRecordingOptions((store) => store.options?.webcam);
  const setupLabel = t(
    faceOn === undefined
      ? "dock.recordingSetup"
      : faceOn
        ? "dock.recordingSetupFaceOn"
        : "dock.recordingSetupFaceOff",
  );
  // Starting to talk clears the Saved line, just as a new recording does.
  const { hideSaved } = screen;
  useEffect(() => {
    if (state === "recording") hideSaved();
  }, [state, hideSaved]);
  // Without screen recording (Windows, older Macs) there is no Screen button
  // for the idle hint to point at.
  const stateKey =
    state === "idle" && !screen.supported
      ? "dock.idleTalkOnly"
      : `dock.${state}`;
  const talkHint = screen.recording && state !== "recording";
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
              active={listening}
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
              <Square size={14} fill="currentColor" />
            </button>
          </Tooltip>
        ) : (
          <span
            className={`compact-indicator ${error ? "has-error" : ""}`}
            role="status"
            aria-label={t(error ? "dock.error" : stateKey)}
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
              active={listening}
              thinking={state === "transcribing"}
              paused={!settings.floating}
            />
          </button>
        </Tooltip>
        {/* While the screen records, the red Stop pill takes room and leads,
            so this pill turns to an outline (.is-secondary), keeps its word
            only if the word fits whole (.word-if-room) and says what it does
            in a tooltip. While dictating too, it stays filled and keeps Stop
            instead, so the caption's "Click Stop" points here. */}
        <Tooltip
          label={t(
            talkHint
              ? "dock.talkHint"
              : state === "recording"
                ? "dock.stop"
                : "dock.record",
          )}
          placement="bottom"
          className={`dock-record-anchor ${talkHint ? "" : "tip-hidden"}`}
        >
          <button
            className={`dock-record ${talkHint ? "word-if-room is-secondary" : ""}`}
            disabled={pending || state === "transcribing"}
            onClick={() => void record()}
          >
            {state === "recording" ? (
              <Square size={20} fill="currentColor" />
            ) : (
              <Mic size={20} />
            )}
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
        </Tooltip>
        <ScreenButton compact={false} dictating={state === "recording"} />
        <Tooltip label={setupLabel} placement="bottom" align="end">
          {/* The dock never takes keyboard focus from the app you're in, so
              the setup lives in the main window, where it can. Filled with
              your color while Show your face is on, like the switch. */}
          <button
            className="dock-screen-setup"
            aria-label={setupLabel}
            data-face={faceOn === undefined ? undefined : faceOn ? "on" : "off"}
            onClick={async () => {
              await invoke("show_main_window_command").catch(() => undefined);
              await emit(OPEN_RECORDING_SETUP_EVENT).catch(() => undefined);
            }}
          >
            <Video size={16} aria-hidden="true" />
          </button>
        </Tooltip>
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
        {/* Hiding the dock mid-recording would take its Stop away, so the
            X waits for the recording to end. aria-disabled, not disabled, so
            it stays focusable and the tooltip can say why. */}
        <Tooltip
          label={t(screen.recording ? "dock.hideWhileRecording" : "dock.hide")}
          placement="bottom"
          align="end"
        >
          <button
            className="dock-hide"
            aria-disabled={screen.recording || undefined}
            onClick={() => {
              if (screen.recording) return;
              void useStudio
                .getState()
                .save({ ...useStudio.getState().settings, floating: false });
            }}
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
          <Tooltip label={t("dock.closeSaved")} placement="top" align="end">
            <button className="dock-screen-note-close" onClick={hideSaved}>
              <X size={12} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      ) : (
        <p role="status">
          {error
            ? t("dock.error")
            : screen.recording && state === "idle"
              ? t("screenRecording.dockCaption")
              : t(state === "recording" && !ready ? "dock.arming" : stateKey)}
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
