// Shared screen recording state for the Home card and the floating dock.
// The Rust side owns the recorder; every window listens for
// "screen-recording-changed" so the dock, Home and tray always agree.
import { useEffect, useState } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkCameraPermission,
  checkMicrophonePermission,
  checkScreenRecordingPermission,
  requestCameraPermission,
  requestMicrophonePermission,
  requestScreenRecordingPermission,
} from "tauri-plugin-macos-permissions-api";
import type { ScreenRecordingStatus } from "@/bindings";
import { useRecordingOptions } from "@/lib/recordingOptions";

export type { ScreenRecordingStatus } from "@/bindings";

/** Plain messages the UI knows how to explain. */
export type RecordingNotice =
  | "permission_denied"
  | "microphone_denied"
  | "camera_denied"
  | "camera_failed"
  | "camera_missing"
  | "window_missing"
  | "failed"
  | "ended_early"
  | "reveal_failed";

/** "mm:ss", or "h:mm:ss" after an hour. */
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Map a backend error code to what we tell the user. */
export function noticeFor(
  code: string | null | undefined,
  hasFile: boolean,
): RecordingNotice | null {
  if (!code) return null;
  if (
    code === "permission_denied" ||
    code === "microphone_denied" ||
    code === "camera_denied" ||
    code === "camera_missing" ||
    code === "window_missing"
  )
    return code;
  if (code === "camera_failed") return "camera_failed";
  if (hasFile) return "ended_early";
  return "failed";
}

/** i18n key for why the button is disabled. `detailed` adds the steps to
 * update for places with room; the dock's one-line tooltip keeps it short. */
export function unsupportedKey(
  reason: string | null | undefined,
  { detailed = false }: { detailed?: boolean } = {},
) {
  if (reason === "windows_soon") return "screenRecording.windowsSoon";
  if (reason === "linux_unsupported") return "screenRecording.linuxUnsupported";
  return detailed
    ? "screenRecording.macosTooOldHelp"
    : "screenRecording.macosTooOld";
}

interface RecordingStore {
  status: ScreenRecordingStatus | null;
  /** Local clock time the recording started, for the ticking timer. */
  startedAt: number | null;
  pending: boolean;
  notice: RecordingNotice | null;
  /** A file was saved while this window was open. */
  justSaved: boolean;
  /** Just stopped: Record ignores clicks for a moment, so the second click
   * of a double-click on Stop can't start a new recording. */
  settling: boolean;
  apply: (status: ScreenRecordingStatus) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggle: () => Promise<void>;
  reveal: () => Promise<void>;
  openSettings: () => Promise<void>;
}

// A module flag, not state: a second click before React re-renders is
// still blocked.
let inFlight = false;
// How long Record stays inert after a stop, and the timer that lifts it.
const SETTLE_MS = 700;
let settleTimer: number | undefined;

export const useScreenRecording = create<RecordingStore>((set, get) => ({
  status: null,
  startedAt: null,
  pending: false,
  notice: null,
  justSaved: false,
  settling: false,
  apply: (status) => {
    const previous = get().status;
    const idle = status.state === "idle";
    const recording =
      status.state === "recording" || status.state === "stopping";
    const savedNow =
      idle &&
      previous !== null &&
      !!status.last_file &&
      status.last_file !== previous.last_file;
    set({
      status,
      startedAt: recording ? Date.now() - status.elapsed_ms : null,
      notice: idle
        ? noticeFor(status.error, savedNow || get().justSaved)
        : status.state === "starting"
          ? null
          : get().notice,
      justSaved: idle && (savedNow || get().justSaved),
    });
  },
  start: async () => {
    if (inFlight || get().settling) return;
    inFlight = true;
    set({ pending: true, notice: null });
    try {
      if (platform() === "macos" && !(await checkScreenRecordingPermission())) {
        // macOS shows its own prompt the first time. Either way the backend
        // checks again and tells every window if it is still missing.
        await requestScreenRecordingPermission();
      }
      get().apply(
        await invoke<ScreenRecordingStatus>("start_screen_recording"),
      );
    } catch (error) {
      set({ notice: noticeFor(String(error), false) ?? "failed" });
    } finally {
      inFlight = false;
      set({ pending: false });
    }
  },
  stop: async () => {
    if (inFlight) return;
    inFlight = true;
    set({ pending: true });
    try {
      get().apply(await invoke<ScreenRecordingStatus>("stop_screen_recording"));
    } catch (error) {
      set({ notice: noticeFor(String(error), false) ?? "failed" });
    } finally {
      inFlight = false;
      set({ pending: false, settling: true });
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(
        () => set({ settling: false }),
        SETTLE_MS,
      );
    }
  },
  toggle: async () => {
    const state = get().status?.state;
    if (state === "recording") await get().stop();
    else if (state === "idle" || !state) await get().start();
  },
  reveal: async () => {
    try {
      await invoke("show_screen_recording_in_folder");
    } catch {
      set({ notice: "reveal_failed" });
    }
  },
  openSettings: async () => {
    try {
      if (platform() === "macos" && !(await checkScreenRecordingPermission())) {
        // Puts Say Less in the Screen Recording list (macOS asks only once),
        // even when the failed start came from the menu bar or a voice cue.
        await requestScreenRecordingPermission().catch(() => undefined);
      }
      await invoke("open_screen_recording_settings");
    } catch {
      set({ notice: "permission_denied" });
    }
  },
}));

// A module flag, not state, like `inFlight`: the second click of a
// double-click opens System Settings only once, from any button.
let settingsOpening = false;
/** True when it opened, false when it failed, and undefined for the ignored
 * second click of a double-click. */
async function openSettingsOnce(
  open: () => Promise<unknown>,
): Promise<boolean | undefined> {
  if (settingsOpening) return undefined;
  settingsOpening = true;
  try {
    await open();
    return true;
  } catch {
    // The notice stays; a caller with room can say it didn't open.
    return false;
  } finally {
    window.setTimeout(() => {
      settingsOpening = false;
    }, SETTLE_MS);
  }
}

/** Open the Camera or Microphone pane of System Settings. macOS lists an app
 * there only after it has asked once, so ask first if it never did. */
export function openPrivacyPane(kind: "camera" | "microphone") {
  const camera = kind === "camera";
  return openSettingsOnce(async () => {
    if (platform() === "macos") {
      const allowed = camera
        ? await checkCameraPermission()
        : await checkMicrophonePermission();
      if (!allowed)
        await (
          camera ? requestCameraPermission() : requestMicrophonePermission()
        ).catch(() => undefined);
    }
    await invoke(
      camera ? "open_camera_settings" : "open_microphone_privacy_settings",
    );
  });
}

/** Open Software Update in System Settings, for a Mac too old to record.
 * Resolves false when it couldn't open. */
export function openSoftwareUpdate() {
  return openSettingsOnce(() => invoke("open_software_update"));
}

/** Camera permission, shared by the card and Setup. "asking" means the macOS
 * prompt we raised is still waiting for an answer, so that isn't blocked
 * yet. */
export type CameraAccess = "unknown" | "allowed" | "asking" | "denied";
const useCameraStore = create<{ access: CameraAccess }>(() => ({
  access: "unknown",
}));
// A module flag, like `inFlight`: we raised the macOS camera prompt and it
// hasn't been answered yet.
let cameraPromptUp = false;

/** What macOS says about the camera, straight from the backend, so a prompt
 * that never showed can't look like one still waiting. */
async function cameraStatus(): Promise<"allowed" | "denied" | "not_asked"> {
  try {
    const status = await invoke<string>("camera_permission_status");
    if (status === "allowed" || status === "not_asked") return status;
    return "denied";
  } catch {
    // Can't tell whether macOS asked yet, so offer the fix.
    return (await checkCameraPermission().catch(() => false))
      ? "allowed"
      : "denied";
  }
}

function accessFor(status: "allowed" | "denied" | "not_asked"): CameraAccess {
  if (status !== "not_asked") cameraPromptUp = false;
  if (status === "allowed") return "allowed";
  // Not asked and no prompt of ours up (say, Say Less quit while it was
  // showing): the warning's Open System Settings raises the prompt.
  return status === "not_asked" && cameraPromptUp ? "asking" : "denied";
}

/** Turn Show your face on or off. The card's Show my face button and Setup's
 * switch both come here, so both raise the macOS camera prompt. Returns
 * whether the change was saved. */
export async function setShowFace(on: boolean) {
  const mac = platform() === "macos";
  const status = on && mac ? await cameraStatus() : null;
  const ask = status === "not_asked";
  // Set before the switch flips, so nothing says blocked while macOS asks,
  // and a camera refused before says blocked right away.
  if (ask) cameraPromptUp = true;
  if (status) useCameraStore.setState({ access: accessFor(status) });
  const ok = await useRecordingOptions.getState().update({ webcam: on });
  if (!ok) {
    if (ask) cameraPromptUp = false;
    if (status) useCameraStore.setState({ access: "unknown" });
    return false;
  }
  if (!on) {
    cameraPromptUp = false;
    useCameraStore.setState({ access: "unknown" });
  }
  // macOS shows its own prompt only when it hasn't asked before.
  // useCameraAccess keeps checking for the answer.
  if (ask)
    await requestCameraPermission().catch(() => {
      cameraPromptUp = false;
      useCameraStore.setState({ access: "denied" });
    });
  return true;
}

/** Camera permission while `watch` is on (the webcam is on). Checked when
 * `watch` turns on, every 1.5 seconds until allowed, and when the window gets
 * focus back, such as from System Settings. */
export function useCameraAccess(watch: boolean): CameraAccess {
  const access = useCameraStore((state) => state.access);
  const allowed = access === "allowed";
  useEffect(() => {
    if (!watch || platform() !== "macos") return;
    let disposed = false;
    const check = () =>
      void cameraStatus().then((status) => {
        if (!disposed) useCameraStore.setState({ access: accessFor(status) });
      });
    check();
    window.addEventListener("focus", check);
    const id = allowed ? undefined : window.setInterval(check, 1500);
    return () => {
      disposed = true;
      window.removeEventListener("focus", check);
      window.clearInterval(id);
    };
  }, [watch, allowed]);
  return watch ? access : "unknown";
}

let syncStarted = false;
/** Load the current status once per window and follow every change. */
export function startScreenRecordingSync() {
  if (syncStarted) return;
  syncStarted = true;
  const { apply } = useScreenRecording.getState();
  invoke<ScreenRecordingStatus>("screen_recording_status")
    .then(apply)
    .catch(() => undefined);
  void listen<ScreenRecordingStatus>("screen-recording-changed", (event) =>
    apply(event.payload),
  );
}

/** Milliseconds since `startedAt`, updated once a second (text only, so it
 * is safe with reduced motion). */
export function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}
