import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands, events } from "@/bindings";
import type {
  StreamPhase,
  StreamPhaseEvent,
  StreamTextEvent,
  StreamWorkKind,
} from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { useStudio } from "@/lib/studio";
import { useMotionPolicy } from "@/hooks/useMotionAllowed";
import { Tooltip } from "@/components/ui/Tooltip";
import { VoiceSquiggle } from "@/components/companion/VoiceSquiggle";
import { Avatar } from "@/components/companion/Avatar";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState = "recording" | "streaming" | "transcribing" | "processing";

// Number of reactive bars in the waveform (the simple, smoothed style shared by
// every overlay form). Mic levels arrive as 16 FFT buckets; we take the first N.
const WAVE_BARS = 9;
// A low, rounded resting silhouette (px) so silent bars never sit dead flat.
// Loud input grows each bar from here; with motion off the bars hold this shape.
const REST_HEIGHTS = [4, 5, 6, 7, 8, 7, 6, 5, 4];
const MAX_BAR = 18;
// Exit fade before the component unmounts. The backend waits 300ms before it
// hides the native window, so this has time to play.
const EXIT_MS = 140;

const prefersReducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  // `present` keeps the card mounted through its exit fade; `isVisible` is
  // whether the backend currently wants it shown.
  const [present, setPresent] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  // `Stream::play()` returning does not mean hardware callbacks are flowing.
  // Stay visually in an arming state until the backend processes the first
  // actual microphone sample chunk.
  const [captureReady, setCaptureReady] = useState(false);
  const [levels, setLevels] = useState<number[]>(Array(WAVE_BARS).fill(0));
  const [streamText, setStreamText] = useState<StreamTextEvent>({
    committed: "",
    tentative: "",
  });
  const [phase, setPhase] = useState<StreamPhase>("listening");
  const [workKind, setWorkKind] = useState<StreamWorkKind>("transcribing");
  const [elapsed, setElapsed] = useState(0);
  // Bumped on each new streaming session so the Live card remounts fresh (replays
  // the pop-in, and never animates in from the previous panel's open size).
  const [session, setSession] = useState(0);
  // Overlay placement (top vs bottom of the screen). The Live panel grows downward
  // from a top overlay (oldest line under the pill) and upward from a bottom one.
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  // True once live text overflows the cap. A top overlay fades its top edge only
  // while overflowing, so the resting first line stays crisp flush under the pill.
  const [overflowing, setOverflowing] = useState(false);

  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));
  // Live-text scroll-back: the text region "sticks" to the newest line while the
  // user is at the bottom; if they scroll up to read history, auto-follow pauses
  // until they scroll back down.
  const capRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const direction = getLanguageDirection(i18n.language);
  const overlayVisual = useStudio((s) => s.settings.overlay_visual);
  const avatar = useStudio((s) => s.settings.avatar);
  const motion = useMotionPolicy();
  const moving = motion === "full";
  // Bumped by every show and hide. A show that finishes its settings reads
  // after a newer hide/show must not bring back the session that just ended.
  const generationRef = useRef(0);
  const exitTimerRef = useRef<number>();

  useEffect(() => {
    // Tauri's listen() resolves asynchronously. Collect each unlisten as it
    // arrives and return a synchronous cleanup, so a registration that lands
    // after unmount (React Strict Mode mounts twice) is released immediately.
    let disposed = false;
    const stops: Array<() => void> = [];
    const own = (registration: Promise<() => void>) => {
      registration
        .then((stop) => {
          if (disposed) stop();
          else stops.push(stop);
        })
        .catch((error) =>
          console.error("Overlay could not listen for events:", error),
        );
    };

    own(
      listen("show-overlay", async (event) => {
        const generation = ++generationRef.current;
        window.clearTimeout(exitTimerRef.current);
        const overlayState = event.payload as OverlayState;
        // Reset synchronously before settings I/O. A fast microphone can emit
        // recording-ready while the awaits below are in flight; resetting after
        // them would overwrite that event and leave the overlay stuck arming.
        if (overlayState === "recording" || overlayState === "streaming") {
          setCaptureReady(false);
          smoothedLevelsRef.current = Array(16).fill(0);
          setLevels(Array(WAVE_BARS).fill(0));
          setStreamText({ committed: "", tentative: "" });
        }

        await syncLanguageFromSettings();
        // The Live panel flows downward from a top overlay and upward from a
        // bottom one; read the placement so the layout can flip to match.
        let placement: "top" | "bottom" | null = null;
        try {
          const settings = await commands.getAppSettings();
          if (settings.status === "ok") {
            placement =
              settings.data.overlay_position === "top" ? "top" : "bottom";
          }
        } catch {
          // Keep the previous/default placement if settings can't be read.
        }
        // A hide (or a newer show) arrived while settings were loading. This
        // show belongs to a session that is already over, so drop it.
        if (disposed || generation !== generationRef.current) return;
        if (placement) setPosition(placement);
        setState(overlayState);
        if (overlayState === "streaming") {
          setPhase("listening");
          setWorkKind("transcribing");
          setElapsed(0);
          setSession((s) => s + 1); // remount the card fresh for this session
        }
        setPresent(true);
        setIsVisible(true);
      }),
    );

    own(
      listen("hide-overlay", () => {
        generationRef.current++;
        setIsVisible(false);
        setCaptureReady(false);
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = window.setTimeout(
          () => setPresent(false),
          prefersReducedMotion() ? 0 : EXIT_MS,
        );
      }),
    );

    own(
      listen("recording-ready", () => {
        setElapsed(0);
        setCaptureReady(true);
      }),
    );

    own(
      listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];
        // Exponential smoothing across the 16 buckets, then take the first N
        // bars for the shared waveform.
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const raw = Number(newLevels[i]);
          const target = Number.isFinite(raw)
            ? Math.min(1, Math.max(0, raw))
            : 0;
          return prev * 0.7 + target * 0.3;
        });
        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, WAVE_BARS));
      }),
    );

    own(
      events.streamTextEvent.listen((event) => {
        setStreamText(event.payload);
      }),
    );

    own(
      events.streamPhaseEvent.listen((event) => {
        const payload: StreamPhaseEvent = event.payload;
        setPhase(payload.phase);
        if (payload.kind) setWorkKind(payload.kind);
      }),
    );

    return () => {
      disposed = true;
      stops.splice(0).forEach((stop) => stop());
      window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  // Elapsed capture timer starts only once microphone samples are flowing.
  useEffect(() => {
    if (state !== "streaming" || !isVisible || !captureReady) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [state, isVisible, captureReady]);

  // Stick to the bottom as text streams in — but only while pinned, so a user who
  // has scrolled up to read history isn't yanked back down by the next chunk.
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    // Fade the top edge only once text actually overflows the cap.
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  // Each fresh streaming session starts pinned to the bottom, fade cleared.
  useEffect(() => {
    pinnedRef.current = true;
    setOverflowing(false);
  }, [session]);

  if (!present) return null;

  // Re-pin when the user is within ~a line of the bottom; unpin otherwise.
  const handleStreamScroll = () => {
    const el = capRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 16;
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ---- Shared building blocks (one visual language for every overlay form) ----
  // Voice visual chosen in Appearance: bars (default), squiggle, or avatar.
  const waveform =
    overlayVisual === "squiggle" ? (
      <VoiceSquiggle levels={levels} ready={captureReady} moving={moving} />
    ) : overlayVisual === "avatar" ? (
      <span className="savatar">
        <Avatar
          avatar={avatar}
          level={captureReady ? Math.max(0, ...levels) : 0}
          moving={moving}
          state={captureReady ? "listening" : "idle"}
          rings={1}
          small
        />
      </span>
    ) : (
      <div
        className={`swave ${captureReady ? "ready" : "arming"} ${moving ? "" : "is-still"}`}
      >
        {levels.map((v, i) => {
          // With motion off the bars hold the resting shape instead of
          // following the voice; the "Listening" text still says it's live.
          const voice = moving ? 3 + Math.pow(v, 0.7) * (MAX_BAR - 3) : 0;
          const height = Math.min(MAX_BAR, Math.max(REST_HEIGHTS[i], voice));
          return <i key={i} style={{ height: `${height}px` }} />;
        })}
      </div>
    );

  const cancelLabel = t("ux.overlay.cancel");
  const cancelBtn = (
    <Tooltip label={cancelLabel} placement="left">
      <button
        type="button"
        className="sx"
        onClick={() => {
          commands
            .cancelOperation()
            .catch((error) => console.error("Cancel recording failed:", error));
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 4 L12 12 M12 4 L4 12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </Tooltip>
  );

  // Status in words, so the state reads even with every animation frozen.
  const listeningLabel = captureReady
    ? t("ux.overlay.listening")
    : t("ux.overlay.starting");

  // dot + status (left) | voice-visual slot (fills the gap, visual centered in
  // it) | timer + cancel (right). Same structure for pill & panel, so the Live
  // morph is a pure width change.
  const listeningRow = (showTimer: boolean, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">
        <span className={`sdot ${captureReady ? "ready" : "arming"}`} />
        <span className="sstatus" aria-hidden="true">
          {listeningLabel}
        </span>
      </div>
      <div className="svis">{waveform}</div>
      <div className="sbase-r">
        {showTimer && <span className="stimer">{fmtTime(elapsed)}</span>}
        {showCancel && cancelBtn}
      </div>
    </div>
  );

  // spinner (left) | label (fills the middle, centered) | cancel (right), the
  // same zones as the listening row.
  const workingRow = (label: string, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">
        <span className="sspinner" />
      </div>
      <span className="swork-label" aria-hidden="true">
        {label}
      </span>
      <div className="sbase-r">{showCancel && cancelBtn}</div>
    </div>
  );

  // ---- Live overlay: a pill that sculpts open into a panel ----
  if (state === "streaming") {
    const hasText =
      streamText.committed.length > 0 || streamText.tentative.length > 0;
    const working = phase === "working";
    // Keep the panel open whenever there's text — even while finalizing — so the
    // transcript stays put under a working spinner instead of collapsing and
    // squishing the text mid-stream. Only fall back to the small working pill
    // when there was no text to preserve.
    const open = hasText;
    const collapsed = working && !hasText;
    const liveStatus = working
      ? workKind === "polishing"
        ? t("overlay.processing")
        : t("overlay.transcribing")
      : listeningLabel;

    return (
      <div
        dir={direction}
        className={`ov-stage ${position} ${motion === "paused" ? "is-paused" : ""}`}
      >
        <span
          className="ov-sr"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {liveStatus}
        </span>
        <div
          key={session}
          className={`scard ${open ? "open" : ""} ${collapsed ? "working" : ""} ${
            isVisible ? "" : "leaving"
          }`}
        >
          <div className="stext">
            <div className="stext-clip">
              <div
                className={`stext-cap ${overflowing ? "overflowing" : ""}`}
                ref={capRef}
                onScroll={handleStreamScroll}
              >
                <p>
                  <span className="committed">
                    {streamText.committed ? streamText.committed + " " : ""}
                  </span>
                  <span className="tentative">{streamText.tentative}</span>
                  {/* Drop the blinking caret once finalizing — it's no longer
                      capturing, and a static spinner conveys the work. */}
                  {!working && <span className="scaret" />}
                </p>
              </div>
            </div>
          </div>
          {working
            ? workingRow(
                workKind === "polishing"
                  ? t("overlay.processing")
                  : t("overlay.transcribing"),
                true,
              )
            : listeningRow(open, true)}
        </div>
      </div>
    );
  }

  // ---- Minimal overlay: exactly one row at a time — waveform (recording), or a
  // spinner + label (transcribing / processing). Never both. The pill animates its
  // width between them; the cancel button is in both rows so it stays put.
  const working = state === "transcribing" || state === "processing";
  const workLabel =
    state === "processing"
      ? t("overlay.processing")
      : t("overlay.transcribing");

  return (
    <div
      dir={direction}
      className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""} ${motion === "paused" ? "is-paused" : ""}`}
    >
      <span
        className="ov-sr"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {working ? workLabel : listeningLabel}
      </span>
      <div
        className={`scard compact ${working && isVisible ? "cworking" : ""}`}
      >
        {working ? workingRow(workLabel, true) : listeningRow(false, true)}
      </div>
    </div>
  );
};

export default RecordingOverlay;
