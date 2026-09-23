import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { StudioSettings } from "@/bindings";
export type { StudioSettings, VoiceAction, WritingStyle } from "@/bindings";
export const defaultStudio: StudioSettings = {
  accent: "#b8ff65",
  floating: false,
  actions_enabled: false,
  actions: [],
  default_style: "original",
  app_styles: [],
  cleanup_on_dictation: false,
  dock_animation: "orbit",
  dock_motion: true,
  dock_cycle: false,
  dock_edge: "free",
  corrections: [],
};
export function applyAccent(accent: string) {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return;
  const channels = [1, 3, 5]
    .map((i) => parseInt(accent.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  document.documentElement.style.setProperty("--studio-accent", accent);
  document.documentElement.style.setProperty(
    "--studio-on-accent",
    luminance > 0.179 ? "#000000" : "#ffffff",
  );
}
interface StudioStore {
  settings: StudioSettings;
  loaded: boolean;
  busy: boolean;
  error: boolean;
  load: () => Promise<void>;
  save: (settings: StudioSettings) => Promise<boolean>;
}
export const useStudio = create<StudioStore>((set) => ({
  settings: defaultStudio,
  loaded: false,
  busy: false,
  error: false,
  load: async () => {
    try {
      const settings = await invoke<StudioSettings>("get_studio_settings");
      applyAccent(settings.accent);
      set({ settings, loaded: true, error: false });
    } catch {
      set({ error: true });
    }
  },
  save: async (settings) => {
    set({ busy: true, error: false });
    try {
      await invoke("save_studio_settings", { settings });
      applyAccent(settings.accent);
      set({ settings, loaded: true });
      return true;
    } catch {
      set({ error: true });
      return false;
    } finally {
      set({ busy: false });
    }
  },
}));
export async function startStudioSync() {
  const unlisten = await listen<StudioSettings>("studio-changed", (e) => {
    applyAccent(e.payload.accent);
    useStudio.setState({ settings: e.payload, loaded: true });
  });
  await useStudio.getState().load();
  return unlisten;
}
