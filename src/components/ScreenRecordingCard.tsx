import { useEffect, useState } from "react";
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
    notice,
    justSaved,
    toggle,
    reveal,
    openSettings,
  } = useScreenRecording();
  useEffect(() => startScreenRecordingSync(), []);
  useEffect(() => startRecordingOptionsSync(), []);
  const [setupOpen, setSetupOpen] = useState(false);
  // The dock's setup button opens this panel in the main window.
  const setupRequested = useRecordingOptions((state) => state.setupRequested);
  const webcamOff = useRecordingOptions(
    (state) => state.options?.webcam === false,
  );
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
  const elapsed = useElapsed(startedAt);
  const state = status?.state ?? "idle";
  const supported = status?.supported ?? false;
  const recording = state === "recording" || state === "stopping";
  const busy = pending || state === "starting" || state === "stopping";
  const fileParts = status?.last_file?.split(/[\\/]/) ?? [];
  const fileName = fileParts.pop();
  // "the Say Less folder in Movies": the two folders the video sits in.
  const [parent, folder] = fileParts.slice(-2);
  const needsPermission = notice === "permission_denied";
  const showSaved =
    state === "idle" &&
    justSaved &&
    (notice === null || notice === "ended_early");
  return (
    <section
      className="home-record"
      aria-labelledby="home-record-title"
      data-state={state}
      data-testid="screen-recording-card"
    >
      <div className="home-record-text">
        <h2 id="home-record-title">{t("screenRecording.title")}</h2>
        <p>{t("screenRecording.description")}</p>
        {supported && (
          <p className="home-record-hint">{t("screenRecording.voiceHint")}</p>
        )}
        {supported && webcamOff && !recording && (
          <p className="home-record-hint">
            {t("screenRecording.cameraOffHint")}
          </p>
        )}
        {status && !supported && (
          <p id="home-record-reason" className="home-record-hint">
            {t(unsupportedKey(status.unsupported_reason, { detailed: true }))}
          </p>
        )}
      </div>
      <div className="home-record-controls">
        {recording && (
          <p className="home-record-live">
            <span className="rec-dot" aria-hidden="true" />
            <span>{t("screenRecording.recording")}</span>
            <span role="timer" className="rec-time">
              {formatElapsed(elapsed)}
            </span>
          </p>
        )}
        <div className="home-record-buttons">
          <Button
            variant={
              recording ? "danger" : needsPermission ? "secondary" : "accent"
            }
            className="home-record-button"
            disabled={!status || !supported || busy}
            aria-busy={busy || undefined}
            aria-describedby={
              status && !supported ? "home-record-reason" : undefined
            }
            aria-label={recording ? t("screenRecording.stopLabel") : undefined}
            onClick={() => void toggle()}
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
              onClick={() => setSetupOpen((open) => !open)}
            >
              {t("recordingSetup.button")}
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={setupOpen ? "is-open" : ""}
              />
            </Button>
          </Tooltip>
        </div>
        {supported && state === "idle" && !showSaved && (
          <Button
            variant="ghost"
            size="sm"
            className="inline-flex items-center gap-1.5 self-end"
            onClick={() => void reveal()}
          >
            <FolderOpen size={14} aria-hidden="true" />
            {t("screenRecording.openFolder")}
          </Button>
        )}
      </div>
      {setupOpen && (
        <RecordingSetup
          id="recording-setup"
          supported={supported}
          recording={recording}
          unsupportedReason={
            status && !supported
              ? t(unsupportedKey(status.unsupported_reason, { detailed: true }))
              : null
          }
        />
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
            onClick={() => void invoke("reopen_app").catch(() => undefined)}
          >
            {t("screenRecording.reopenApp")}
          </Button>
        </div>
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
    </section>
  );
}
