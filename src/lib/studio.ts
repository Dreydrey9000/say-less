import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AvatarSettings, StudioSettings } from "@/bindings";
export type {
  AvatarSettings,
  StudioSettings,
  VoiceAction,
  WritingStyle,
} from "@/bindings";
export const defaultAvatar: AvatarSettings = {
  kind: "person",
  body: "#e2b48f",
  accent: "#8796ab",
  background: "#22262e",
  accessory: "none",
};
export const avatarKinds = ["stick", "person", "cat", "dog"] as const;
export const avatarAccessories = [
  "none",
  "cap",
  "beanie",
  "crown",
  "headphones",
  "sunglasses",
] as const;
export const overlayVisuals = ["bars", "squiggle", "avatar"] as const;
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
  dock_compact: true,
  dock_character: "orb",
  learn_corrections: false,
  corrections: [],
  overlay_visual: "bars",
  avatar: defaultAvatar,
};
/** True when black text/ink reads better than white on this hex color. */
export function prefersDarkInk(hex: string) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179;
}
export function applyAccent(accent: string) {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return;
  document.documentElement.style.setProperty("--studio-accent", accent);
  document.documentElement.style.setProperty(
    "--studio-on-accent",
    prefersDarkInk(accent) ? "#000000" : "#ffffff",
  );
}
/** Fill fields a payload may lack (older saves, older test fixtures). */
function withDefaults(settings: StudioSettings): StudioSettings {
  return {
    ...defaultStudio,
    ...settings,
    avatar: { ...defaultAvatar, ...settings.avatar },
  };
}
interface StudioStore {
  settings: StudioSettings;
  loaded: boolean;
  busy: boolean;
  error: boolean;
  load: () => Promise<void>;
  save: (settings: StudioSettings) => Promise<boolean>;
}
// Saves can overlap (a quick second edit). Only the newest save may write its
// settings into the store, so a slower, older save can't undo a newer edit.
let saveSequence = 0;
export const useStudio = create<StudioStore>((set) => ({
  settings: defaultStudio,
  loaded: false,
  busy: false,
  error: false,
  load: async () => {
    try {
      const settings = withDefaults(
        await invoke<StudioSettings>("get_studio_settings"),
      );
      applyAccent(settings.accent);
      set({ settings, loaded: true, error: false });
    } catch {
      set({ error: true });
    }
  },
  save: async (settings) => {
    const sequence = ++saveSequence;
    const latest = () => sequence === saveSequence;
    set({ busy: true, error: false });
    try {
      await invoke("save_studio_settings", { settings });
      if (latest()) {
        applyAccent(settings.accent);
        set({ settings, loaded: true });
      }
      return true;
    } catch {
      if (latest()) set({ error: true });
      return false;
    } finally {
      if (latest()) set({ busy: false });
    }
  },
}));
export async function startStudioSync() {
  const unlisten = await listen<StudioSettings>("studio-changed", (e) => {
    applyAccent(e.payload.accent);
    useStudio.setState({ settings: withDefaults(e.payload), loaded: true });
  });
  await useStudio.getState().load();
  return unlisten;
}
