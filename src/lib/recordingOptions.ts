// Recording setup: what the next screen recording captures. The Rust side
// saves it (capture_options.rs); every window follows
// "recording-options-changed", so Home, the dock and voice cues agree.
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AudioDevice,
  RecordingOptions,
  RecordingSources,
  WebcamCorner,
  WebcamSize,
} from "@/bindings";

export type {
  RecordingOptions,
  RecordingSources,
  WebcamCorner,
  WebcamSize,
} from "@/bindings";

/** Same shape and defaults as `RecordingOptions::default()` in Rust. */
export const DEFAULT_RECORDING_OPTIONS: RecordingOptions = {
  source: "display",
  display_id: null,
  window_id: null,
  window_label: null,
  microphone: true,
  microphone_name: null,
  system_audio: true,
  webcam: false,
  camera_id: null,
  webcam_corner: "bottom_right",
  webcam_size: "medium",
  quality: "p1080",
  fps: 30,
};

export const WEBCAM_CORNERS: WebcamCorner[] = [
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
];
export const WEBCAM_SIZES: WebcamSize[] = ["small", "medium", "large"];

/** "Safari: Start page", or just the app when the window has no title. */
export function windowLabel(app: string, title: string) {
  return title.trim() ? `${app}: ${title.trim()}` : app;
}

interface RecordingOptionsStore {
  options: RecordingOptions | null;
  sources: RecordingSources | null;
  microphones: string[];
  loadingSources: boolean;
  /** Error code from the last save, such as "storage". */
  saveError: string | null;
  /** The dock asked for Recording setup; Home opens it and clears this. */
  setupRequested: boolean;
  load: () => Promise<void>;
  refreshSources: () => Promise<void>;
  update: (patch: Partial<RecordingOptions>) => Promise<boolean>;
}

export const useRecordingOptions = create<RecordingOptionsStore>(
  (set, get) => ({
    options: null,
    sources: null,
    microphones: [],
    loadingSources: false,
    saveError: null,
    setupRequested: false,
    load: async () => {
      try {
        set({
          options: await invoke<RecordingOptions>("get_recording_options"),
        });
      } catch {
        set({ options: DEFAULT_RECORDING_OPTIONS });
      }
    },
    refreshSources: async () => {
      if (get().loadingSources) return;
      set({ loadingSources: true });
      const [sources, mics] = await Promise.allSettled([
        invoke<RecordingSources>("list_recording_sources"),
        invoke<AudioDevice[]>("get_available_microphones"),
      ]);
      set({
        loadingSources: false,
        sources: sources.status === "fulfilled" ? sources.value : get().sources,
        // The dictation list, minus its "Default" row: "Same as dictation"
        // already covers that.
        microphones:
          mics.status === "fulfilled"
            ? mics.value
                .filter((mic) => mic.index !== "default")
                .map((mic) => mic.name)
            : get().microphones,
      });
    },
    update: async (patch) => {
      const previous = get().options ?? DEFAULT_RECORDING_OPTIONS;
      const next = { ...previous, ...patch };
      // Show the change right away; put it back if saving fails.
      set({ options: next, saveError: null });
      try {
        const saved = await invoke<RecordingOptions>("save_recording_options", {
          options: next,
        });
        set({ options: saved });
        return true;
      } catch (error) {
        set({ options: previous, saveError: String(error) });
        return false;
      }
    },
  }),
);

let syncStarted = false;
/** Load the saved options once per window and follow every change. */
export function startRecordingOptionsSync() {
  if (syncStarted) return;
  syncStarted = true;
  void useRecordingOptions.getState().load();
  void listen<RecordingOptions>("recording-options-changed", (event) =>
    useRecordingOptions.setState({ options: event.payload }),
  );
}

/** Window event: the dock asks the main window to open Recording setup. */
export const OPEN_RECORDING_SETUP_EVENT = "open-recording-setup";
