// Shared screen recording state for the Home card and the floating dock.
// The Rust side owns the recorder; every window listens for
// "screen-recording-changed" so the dock, Home and tray always agree.
import { useEffect, useState } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkScreenRecordingPermission,
  requestScreenRecordingPermission,
} from "tauri-plugin-macos-permissions-api";
import type { ScreenRecordingStatus } from "@/bindings";

export type { ScreenRecordingStatus } from "@/bindings";

/** Plain messages the UI knows how to explain. */
export type RecordingNotice =
  | "permission_denied"
  | "microphone_denied"
  | "camera_denied"
  | "camera_failed"
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
    code === "window_missing"
  )
    return code;
  if (code === "camera_failed" || code === "camera_missing")
    return "camera_failed";
  if (hasFile) return "ended_early";
  return "failed";
}

/** i18n key for why the button is disabled. */
export function unsupportedKey(reason: string | null | undefined) {
  if (reason === "windows_soon") return "screenRecording.windowsSoon";
  if (reason === "linux_unsupported") return "screenRecording.linuxUnsupported";
  return "screenRecording.macosTooOld";
}

interface RecordingStore {
  status: ScreenRecordingStatus | null;
  /** Local clock time the recording started, for the ticking timer. */
  startedAt: number | null;
  pending: boolean;
  notice: RecordingNotice | null;
  /** A file was saved while this window was open. */
  justSaved: boolean;
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

export const useScreenRecording = create<RecordingStore>((set, get) => ({
  status: null,
  startedAt: null,
  pending: false,
  notice: null,
  justSaved: false,
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
    if (inFlight) return;
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
      set({ pending: false });
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
      await invoke("open_screen_recording_settings");
    } catch {
      set({ notice: "permission_denied" });
    }
  },
}));

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
