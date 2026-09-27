import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MonitorPlay,
  Square,
  FolderOpen,
  ChevronDown,
  TriangleAlert,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  formatElapsed,
  openPrivacyPane,
  startScreenRecordingSync,
  unsupportedKey,
  useCameraBlocked,
  useElapsed,
  useScreenRecording,
} from "@/lib/screenRecording";
import {
  startRecordingOptionsSync,
  useRecordingOptions,
} from "@/lib/recordingOptions";
import { RecordingSetup } from "./RecordingSetup";
import { Button } from "./ui/Button";
import { Tooltip } from "./ui/Tooltip";

/** Home card: start and stop a screen recording, and find the file after. */
export function ScreenRecordingCard() {
  const { t } = useTranslation();
  const {
    status,
    startedAt,
    pending,
    settling,
    notice,
    justSaved,
    toggle,
    reveal,
    openSettings,
  } = useScreenRecording();
  useEffect(() => startScreenRecordingSync(), []);
  useEffect(() => startRecordingOptionsSync(), []);
  const [setupOpen, setSetupOpen] = useState(false);
  // "Show my face" opens Setup, then moves focus to its Show your face switch.
  const [focusFace, setFocusFace] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenFailed, setReopenFailed] = useState(false);
  // A ref, not state: the second click of a double-click is still ignored.
  const reopenClicked = useRef(false);
  // The dock's setup button opens this panel in the main window.
  const setupRequested = useRecordingOptions((state) => state.setupRequested);
  const webcam = useRecordingOptions((state) => state.options?.webcam);
  useEffect(() => {
    if (!setupRequested) return;
    useRecordingOptions.setState({ setupRequested: false });
    setSetupOpen(true);
    requestAnimationFrame(() =>
      document
        .getElementById("recording-setup")
        ?.scrollIntoView({ block: "nearest" }),
    );
  }, [setupRequested]);
  useEffect(() => {
    if (!setupOpen || !focusFace) return;
    // Setup may still be loading, so look for the switch for a few frames.
    let frames = 0;
    let frame = requestAnimationFrame(function find() {
      const target = document.getElementById("rec-setup-webcam");
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.focus({ preventScroll: true });
      } else if (++frames < 30) {
        frame = requestAnimationFrame(find);
        return;
      }
      setFocusFace(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [setupOpen, focusFace]);
  const elapsed = useElapsed(startedAt);
  const state = status?.state ?? "idle";
  const supported = status?.supported ?? false;
  const unsupported = !!status && !supported;
  const reason = status?.unsupported_reason ?? null;
  // Windows and Linux can't record yet, so there is nothing to set up.
  const comingSoon =
    unsupported &&
    (reason === "windows_soon" || reason === "linux_unsupported");
  const recording = state === "recording" || state === "stopping";
  const busy = pending || state === "starting" || state === "stopping";
  // Clicks are ignored, but unlike `disabled` the button keeps focus.
  const inert = busy || settling;
  const cameraBlocked = useCameraBlocked(supported && webcam === true);
  // The warning steps aside but keeps its space: while recording, while Setup
  // is open (Setup shows the camera problem itself and knows when the macOS
  // prompt is still up), and while the camera notice below says the same.
  const cameraWarningOff = recording || setupOpen || notice === "camera_denied";
  const fileParts = status?.last_file?.split(/[\\/]/) ?? [];
  const fileName = fileParts.pop();
  // "the Say Less folder in Movies": the two folders the video sits in.
  const [parent, folder] = fileParts.slice(-2);
  const needsPermission = notice === "permission_denied";
  const showSaved =
    state === "idle" &&
    justSaved &&
    (notice === null || notice === "ended_early");
  const announcement = recording
    ? t("screenRecording.startedAnnouncement")
    : showSaved
      ? t("screenRecording.savedAnnouncement")
      : "";
  const openFaceSetup = () => {
    setSetupOpen(true);
    setFocusFace(true);
  };
  const reopen = () => {
    if (reopenClicked.current) return;
    reopenClicked.current = true;
    setReopening(true);
    setReopenFailed(false);
    invoke("reopen_app").catch(() => {
      reopenClicked.current = false;
      setReopening(false);
      setReopenFailed(true);
    });
  };
  return (
    <section
      className="home-record"
      aria-labelledby="home-record-title"
      data-state={state}
      data-blocked={needsPermission || unsupported || undefined}
      data-testid="screen-recording-card"
    >
      <div className="home-record-text">
        <h2 id="home-record-title">{t("screenRecording.title")}</h2>
        <p>{t("screenRecording.description")}</p>
        {supported && (
          <>
            {/* Each slot holds its idle line and its recording line in the
                same space, so the buttons don't move when Record turns into
                Stop. */}
            <div className="home-record-slot">
              <p className="home-record-hint" data-off={recording || undefined}>
                {t("screenRecording.voiceHint")}
              </p>
              <p
                className="home-record-hint"
                data-off={!recording || undefined}
              >
                {t("screenRecording.stopHint")}
              </p>
            </div>
            <div className="home-record-slot home-record-face-slot">
              {cameraBlocked ? (
                <p
                  className="home-record-hint home-record-face home-record-warn"
                  data-off={cameraWarningOff || undefined}
                >
                  <TriangleAlert
                    size={14}
                    className="shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <span>{t("screenRecording.cameraBlocked")}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void openPrivacyPane("camera")}
                  >
                    {t("screenRecording.openSettings")}
                  </Button>
                </p>
              ) : (
                webcam === false && (
                  <p
                    className="home-record-hint home-record-face"
                    data-off={recording || undefined}
                  >
                    <span>{t("screenRecording.cameraOffHint")}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={openFaceSetup}
                    >
                      {t("screenRecording.showMyFace")}
                    </Button>
                  </p>
                )
              )}
              {recording && (
                <p className="home-record-live">
                  <span className="rec-dot" aria-hidden="true" />
                  <span>{t("screenRecording.recording")}</span>
                  <span role="timer" className="rec-time">
                    {formatElapsed(elapsed)}
                  </span>
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {unsupported && (
        <div className="home-record-notice rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
          <TriangleAlert
            size={16}
            className="shrink-0 text-warning"
            aria-hidden="true"
          />
          <p id="home-record-reason">
            <strong>{t(unsupportedKey(reason))}</strong>
            {!comingSoon && <> {t("screenRecording.macosTooOldSteps")}</>}
          </p>
        </div>
      )}
      {needsPermission && (
        <div
          className="home-record-notice rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5"
          role="alert"
        >
          <TriangleAlert
            size={16}
            className="shrink-0 text-warning"
            aria-hidden="true"
          />
          <p>
            <strong>{t("screenRecording.permissionDenied")}</strong>{" "}
            {t("screenRecording.permissionHint")}
          </p>
          <Button variant="accent" onClick={() => void openSettings()}>
            {t("screenRecording.openSettings")}
          </Button>
          <Button
            variant="secondary"
            aria-disabled={reopening || undefined}
            onClick={reopen}
          >
            {t(
              reopening
                ? "screenRecording.reopening"
                : "screenRecording.reopenApp",
            )}
          </Button>
          {reopenFailed && (
            <p className="home-record-error">
              {t("screenRecording.reopenFailed")}
            </p>
          )}
        </div>
      )}
      <div className="home-record-controls">
        <div className="home-record-buttons">
          <Button
            variant={
              recording
                ? "danger"
                : needsPermission || unsupported
                  ? "secondary"
                  : "accent"
            }
            className="home-record-button"
            disabled={!status || !supported}
            aria-disabled={inert || undefined}
            aria-busy={busy || undefined}
            aria-describedby={unsupported ? "home-record-reason" : undefined}
            aria-label={recording ? t("screenRecording.stopLabel") : undefined}
            onClick={() => {
              if (!inert) void toggle();
            }}
          >
            {recording ? (
              <Square size={16} aria-hidden="true" />
            ) : (
              <MonitorPlay size={16} aria-hidden="true" />
            )}
            {t(
              state === "starting"
                ? "screenRecording.starting"
                : state === "stopping"
                  ? "screenRecording.stopping"
                  : recording
                    ? "screenRecording.stop"
                    : "screenRecording.start",
            )}
          </Button>
          {!comingSoon && (
            <Tooltip
              label={t("recordingSetup.open")}
              placement="bottom"
              align="end"
            >
              <Button
                variant="secondary"
                className="home-record-setup"
                aria-expanded={setupOpen}
                aria-controls="recording-setup"
                onClick={() => {
                  setSetupOpen((open) => !open);
                  // A plain open or close drops a Show my face request that
                  // hasn't found its switch yet.
                  setFocusFace(false);
                }}
              >
                {t("recordingSetup.button")}
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={setupOpen ? "is-open" : ""}
                />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
      {supported && state === "idle" && !showSaved && (
        <Button
          variant="ghost"
          size="sm"
          className="home-record-folder inline-flex items-center gap-1.5"
          onClick={() => void reveal()}
        >
          <FolderOpen size={14} aria-hidden="true" />
          {t("screenRecording.openFolder")}
        </Button>
      )}
      {setupOpen && !comingSoon && (
        <RecordingSetup
          id="recording-setup"
          supported={supported}
          recording={recording}
          unsupportedReason={
            unsupported ? t(unsupportedKey(reason, { detailed: true })) : null
          }
        />
      )}
      {notice === "microphone_denied" && (
        <div className="home-record-notice" role="alert">
          <p>{t("screenRecording.microphoneDenied")}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openPrivacyPane("microphone")}
          >
            {t("screenRecording.openSettings")}
          </Button>
        </div>
      )}
      {notice === "camera_denied" && (
        <div className="home-record-notice" role="alert">
          <p>{t("recordingSetup.cameraDenied")}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openPrivacyPane("camera")}
          >
            {t("screenRecording.openSettings")}
          </Button>
        </div>
      )}
      {(notice === "window_missing" ||
        notice === "camera_failed" ||
        notice === "camera_missing") && (
        <div className="home-record-notice" role="alert">
          <p>
            {t(
              notice === "window_missing"
                ? "screenRecording.windowMissing"
                : notice === "camera_missing"
                  ? "screenRecording.cameraMissing"
                  : "screenRecording.cameraFailed",
            )}
          </p>
          {!setupOpen && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSetupOpen(true)}
            >
              {t("recordingSetup.open")}
            </Button>
          )}
        </div>
      )}
      {(notice === "failed" || notice === "reveal_failed") && (
        <p className="home-record-notice" role="alert">
          {t(
            notice === "failed"
              ? "screenRecording.failed"
              : "screenRecording.revealFailed",
          )}
        </p>
      )}
      {showSaved && (
        <div className="home-record-notice" role="status">
          <p>
            {t(
              notice === "ended_early"
                ? "screenRecording.endedEarly"
                : parent && folder
                  ? "screenRecording.savedIn"
                  : "screenRecording.saved",
              { folder, parent },
            )}{" "}
            {fileName && <span className="home-record-file">{fileName}</span>}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void reveal()}>
            <FolderOpen size={14} aria-hidden="true" />{" "}
            {t("screenRecording.showInFinder")}
          </Button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
