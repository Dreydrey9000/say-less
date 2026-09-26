import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { type } from "@tauri-apps/plugin-os";
import { RefreshCw } from "lucide-react";
import {
  checkCameraPermission,
  requestCameraPermission,
} from "tauri-plugin-macos-permissions-api";
import {
  WEBCAM_CORNERS,
  WEBCAM_SIZES,
  useRecordingOptions,
  windowLabel,
  type RecordingOptions,
} from "@/lib/recordingOptions";
import { Button } from "./ui/Button";
import { Dropdown } from "./ui/Dropdown";
import { SettingContainer } from "./ui/SettingContainer";
import { ToggleSwitch } from "./ui/ToggleSwitch";

type CameraAccess = "unknown" | "allowed" | "asking" | "denied";

/** Live camera frames for the thumbnail, only while it is on screen. */
function useCameraThumbnail(active: boolean, cameraId: string | null) {
  const [frame, setFrame] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active) {
      setFrame(null);
      return;
    }
    let disposed = false;
    let timer = 0;
    setFailed(false);
    const poll = async () => {
      try {
        const next = await invoke<string | null>("camera_preview_frame");
        if (!disposed && next) setFrame(next);
      } catch {
        // The next tick tries again.
      }
      if (!disposed) timer = window.setTimeout(poll, 150);
    };
    invoke("start_camera_preview", { cameraId })
      .then(() => {
        if (!disposed) void poll();
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      void invoke("stop_camera_preview").catch(() => undefined);
    };
  }, [active, cameraId]);
  return { frame, failed };
}

/** Camera permission: checked when the webcam is on, asked for only when the
 * user turns it on, and re-checked while the macOS prompt is up. */
function useCameraAccess(watch: boolean) {
  const isMac = type() === "macos";
  const [access, setAccess] = useState<CameraAccess>("unknown");
  useEffect(() => {
    if (!watch || !isMac) return;
    let disposed = false;
    const check = async () => {
      try {
        const allowed = await checkCameraPermission();
        if (!disposed)
          setAccess((current) =>
            allowed ? "allowed" : current === "asking" ? "asking" : "denied",
          );
      } catch {
        if (!disposed) setAccess("denied");
      }
    };
    void check();
    const id = window.setInterval(check, 1500);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [watch, isMac]);
  const ask = async () => {
    if (!isMac) return;
    try {
      if (await checkCameraPermission()) {
        setAccess("allowed");
        return;
      }
      setAccess("asking");
      // macOS shows its own prompt the first time. The check above keeps
      // watching for the answer.
      await requestCameraPermission();
    } catch {
      setAccess("denied");
    }
  };
  return { access, ask };
}

/**
 * Recording setup: what the next recording captures. Every change saves
 * right away, so the Record button, the dock and "Say less, start recording"
 * all use it.
 */
export function RecordingSetup({
  id,
  supported,
  unsupportedReason,
  recording,
}: {
  id: string;
  supported: boolean;
  /** Plain sentence shown when this computer can't record. */
  unsupportedReason: string | null;
  recording: boolean;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const {
    options: saved,
    sources,
    microphones,
    loadingSources,
    saveError,
    load,
    refreshSources,
    update,
  } = useRecordingOptions();
  const options = saved;
  const [wantWindow, setWantWindow] = useState(false);
  const disabled = !supported || !options;
  const webcamOn = !!options?.webcam && supported;
  const { access, ask } = useCameraAccess(webcamOn);
  const thumbnail = useCameraThumbnail(
    webcamOn && access === "allowed" && !recording,
    options?.camera_id ?? null,
  );

  useEffect(() => {
    if (!saved) void load();
    if (supported) void refreshSources();
  }, [saved, load, supported, refreshSources]);

  if (!options)
    return (
      <div id={id} className="rec-setup" aria-busy="true">
        <p className="rec-setup-note">{t("recordingSetup.loading")}</p>
      </div>
    );

  const save = (patch: Partial<RecordingOptions>) => void update(patch);
  const windows = sources?.windows ?? [];
  const displays = sources?.displays ?? [];
  const cameras = sources?.cameras ?? [];
  const showWindow = options.source === "window" || wantWindow;
  const windowOptions = windows.map((w) => ({
    value: String(w.id),
    label: windowLabel(w.app, w.title),
  }));
  // Keep naming a saved window that is not open right now.
  if (
    options.window_id !== null &&
    !windows.some((w) => w.id === options.window_id)
  )
    windowOptions.unshift({
      value: String(options.window_id),
      label: t("recordingSetup.windowClosed", {
        name: options.window_label ?? t("recordingSetup.savedWindow"),
      }),
    });

  const pickWindow = (value: string) => {
    const match = windows.find((w) => String(w.id) === value);
    if (!match) return;
    setWantWindow(false);
    save({
      source: "window",
      window_id: match.id,
      window_label: windowLabel(match.app, match.title),
    });
  };
  const pickSource = (value: string) => {
    if (value === "display") {
      setWantWindow(false);
      save({ source: "display" });
      return;
    }
    // A window source needs a window; pick the first open one.
    const first = windows[0];
    if (first) pickWindow(String(first.id));
    else setWantWindow(true);
  };
  const toggleWebcam = async (on: boolean) => {
    const ok = await update({ webcam: on });
    if (ok && on) await ask();
  };

  return (
    <div
      id={id}
      className="rec-setup"
      role="region"
      aria-labelledby={headingId}
      data-testid="recording-setup"
    >
      <h3 id={headingId} className="rec-setup-title">
        {t("recordingSetup.title")}
      </h3>
      {!supported && unsupportedReason && (
        <p className="rec-setup-note">{unsupportedReason}</p>
      )}
      {recording && supported && (
        <p className="rec-setup-note">{t("recordingSetup.nextRecording")}</p>
      )}

      <fieldset className="rec-setup-group" disabled={disabled}>
        <legend>{t("recordingSetup.whatTitle")}</legend>
        <SettingContainer
          title={t("recordingSetup.source")}
          description=""
          grouped
          disabled={disabled}
        >
          <Dropdown
            selectedValue={showWindow ? "window" : "display"}
            onSelect={pickSource}
            disabled={disabled}
            options={[
              { value: "display", label: t("recordingSetup.wholeScreen") },
              { value: "window", label: t("recordingSetup.oneWindow") },
            ]}
          />
        </SettingContainer>
        {!showWindow && displays.length > 1 && (
          <SettingContainer
            title={t("recordingSetup.display")}
            description=""
            grouped
            disabled={disabled}
          >
            <Dropdown
              selectedValue={String(
                options.display_id ??
                  displays.find((d) => d.is_main)?.id ??
                  displays[0].id,
              )}
              onSelect={(value) => save({ display_id: Number(value) })}
              disabled={disabled}
              options={displays.map((d) => ({
                value: String(d.id),
                label: d.is_main
                  ? t("recordingSetup.mainDisplay", { name: d.name })
                  : d.name,
              }))}
            />
          </SettingContainer>
        )}
        {showWindow && (
          <SettingContainer
            title={t("recordingSetup.window")}
            description=""
            grouped
            disabled={disabled}
          >
            <div className="rec-setup-inline">
              <Dropdown
                selectedValue={
                  options.source === "window" && options.window_id !== null
                    ? String(options.window_id)
                    : null
                }
                onSelect={pickWindow}
                onRefresh={() => void refreshSources()}
                placeholder={t("recordingSetup.pickWindow")}
                disabled={disabled || windowOptions.length === 0}
                options={windowOptions}
              />
              <Button
                variant="ghost"
                className="rec-setup-icon"
                aria-label={t("recordingSetup.refreshWindows")}
                title={t("recordingSetup.refreshWindows")}
                aria-busy={loadingSources || undefined}
                disabled={disabled}
                onClick={() => void refreshSources()}
              >
                <RefreshCw size={16} aria-hidden="true" />
              </Button>
            </div>
          </SettingContainer>
        )}
        {showWindow && sources?.windows_need_permission && (
          <div className="rec-setup-alert">
            <p>{t("recordingSetup.windowsNeedPermission")}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void invoke("open_screen_recording_settings").catch(
                  () => undefined,
                )
              }
            >
              {t("screenRecording.openSettings")}
            </Button>
          </div>
        )}
        {showWindow &&
          !sources?.windows_need_permission &&
          windows.length === 0 && (
            <p className="rec-setup-note">{t("recordingSetup.noWindows")}</p>
          )}
      </fieldset>

      <fieldset className="rec-setup-group" disabled={disabled}>
        <legend>{t("recordingSetup.soundTitle")}</legend>
        <ToggleSwitch
          label={t("recordingSetup.microphone")}
          description=""
          grouped
          checked={options.microphone}
          disabled={disabled}
          onChange={(on) => save({ microphone: on })}
        />
        {options.microphone && (
          <SettingContainer
            title={t("recordingSetup.whichMicrophone")}
            description=""
            grouped
            disabled={disabled}
          >
            <Dropdown
              selectedValue={options.microphone_name ?? ""}
              onSelect={(value) => save({ microphone_name: value || null })}
              onRefresh={() => void refreshSources()}
              disabled={disabled}
              options={[
                { value: "", label: t("recordingSetup.sameAsDictation") },
                ...microphones.map((name) => ({ value: name, label: name })),
              ]}
            />
          </SettingContainer>
        )}
        <ToggleSwitch
          label={t("recordingSetup.systemAudio")}
          description=""
          grouped
          checked={options.system_audio}
          disabled={disabled}
          onChange={(on) => save({ system_audio: on })}
        />
      </fieldset>

      <fieldset className="rec-setup-group" disabled={disabled}>
        <legend>{t("recordingSetup.cameraTitle")}</legend>
        <ToggleSwitch
          label={t("recordingSetup.webcam")}
          description=""
          grouped
          checked={options.webcam}
          disabled={disabled}
          onChange={(on) => void toggleWebcam(on)}
        />
        {options.webcam && (
          <>
            {cameras.length > 1 && (
              <SettingContainer
                title={t("recordingSetup.whichCamera")}
                description=""
                grouped
                disabled={disabled}
              >
                <Dropdown
                  selectedValue={options.camera_id ?? cameras[0].id}
                  onSelect={(value) => save({ camera_id: value })}
                  disabled={disabled}
                  options={cameras.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                />
              </SettingContainer>
            )}
            <div className="rec-cam">
              <div
                className="rec-cam-screen"
                role="img"
                aria-label={t("recordingSetup.previewLabel", {
                  corner: t(`recordingSetup.corner.${options.webcam_corner}`),
                  size: t(`recordingSetup.size.${options.webcam_size}`),
                })}
              >
                <div
                  className="rec-cam-bubble"
                  data-corner={options.webcam_corner}
                  data-size={options.webcam_size}
                  data-testid="webcam-bubble-preview"
                >
                  {thumbnail.frame ? (
                    <img src={thumbnail.frame} alt="" />
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </div>
              </div>
              <div className="rec-cam-controls">
                <div
                  role="radiogroup"
                  aria-label={t("recordingSetup.position")}
                  className="rec-choice rec-choice-grid"
                >
                  <span className="rec-choice-label" aria-hidden="true">
                    {t("recordingSetup.position")}
                  </span>
                  {WEBCAM_CORNERS.map((corner) => (
                    <label key={corner}>
                      <input
                        type="radio"
                        name={`${id}-corner`}
                        value={corner}
                        checked={options.webcam_corner === corner}
                        disabled={disabled}
                        onChange={() => save({ webcam_corner: corner })}
                      />
                      <span>{t(`recordingSetup.corner.${corner}`)}</span>
                    </label>
                  ))}
                </div>
                <div
                  role="radiogroup"
                  aria-label={t("recordingSetup.bubbleSize")}
                  className="rec-choice"
                >
                  <span className="rec-choice-label" aria-hidden="true">
                    {t("recordingSetup.bubbleSize")}
                  </span>
                  {WEBCAM_SIZES.map((size) => (
                    <label key={size}>
                      <input
                        type="radio"
                        name={`${id}-size`}
                        value={size}
                        checked={options.webcam_size === size}
                        disabled={disabled}
                        onChange={() => save({ webcam_size: size })}
                      />
                      <span>{t(`recordingSetup.size.${size}`)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <p className="rec-setup-note">{t("recordingSetup.webcamHint")}</p>
            {supported && (access === "denied" || access === "asking") && (
              <div className="rec-setup-alert" role="alert">
                <p>
                  {t(
                    access === "asking"
                      ? "recordingSetup.cameraAsking"
                      : "recordingSetup.cameraDenied",
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void invoke("open_camera_settings").catch(() => undefined)
                  }
                >
                  {t("screenRecording.openSettings")}
                </Button>
              </div>
            )}
            {thumbnail.failed && access === "allowed" && (
              <p className="rec-setup-note" role="status">
                {t("recordingSetup.previewFailed")}
              </p>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="rec-setup-group" disabled={disabled}>
        <legend>{t("recordingSetup.qualityTitle")}</legend>
        <SettingContainer
          title={t("recordingSetup.quality")}
          description=""
          grouped
          disabled={disabled}
        >
          <Dropdown
            selectedValue={options.quality}
            onSelect={(value) =>
              save({ quality: value as RecordingOptions["quality"] })
            }
            disabled={disabled}
            options={[
              { value: "p720", label: t("recordingSetup.q720") },
              { value: "p1080", label: t("recordingSetup.q1080") },
              { value: "native", label: t("recordingSetup.qNative") },
            ]}
          />
        </SettingContainer>
        <SettingContainer
          title={t("recordingSetup.frameRate")}
          description=""
          grouped
          disabled={disabled}
        >
          <Dropdown
            selectedValue={String(options.fps)}
            onSelect={(value) => save({ fps: Number(value) })}
            disabled={disabled}
            options={[
              { value: "30", label: t("recordingSetup.fps30") },
              { value: "60", label: t("recordingSetup.fps60") },
            ]}
          />
        </SettingContainer>
        <p className="rec-setup-note">{t("recordingSetup.qualityHint")}</p>
      </fieldset>
      {saveError && (
        <p className="rec-setup-alert" role="alert">
          {t("recordingSetup.saveFailed")}
        </p>
      )}
    </div>
  );
}
