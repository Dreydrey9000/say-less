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
  preset: null,
};
export const avatarKinds = ["stick", "person", "cat", "dog", "bot"] as const;
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
  voice_recording: true,
};
/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
/** True when black text/ink reads better than white on this hex color. */
export function prefersDarkInk(hex: string) {
  return luminance(hex) > 0.179;
}
/** WCAG contrast ratio between two #rrggbb colors. */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/**
 * The accent for thin marks (the active nav bar, quote rules) on the light
 * background. Bright accents like lime vanish on near-white, so we mix toward
 * black in small steps until the mark reaches 3:1 contrast. Accents that
 * already pass come back unchanged.
 */
export function accentForLight(hex: string, background = "#fbfbfb") {
  let out = hex;
  for (let k = 1; k >= 0; k -= 0.02) {
    out = `#${[1, 3, 5]
      .map((i) =>
        Math.round(parseInt(hex.slice(i, i + 2), 16) * k)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
    if (contrastRatio(out, background) >= 3) return out;
  }
  return out;
}
export function applyAccent(accent: string) {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return;
  document.documentElement.style.setProperty("--studio-accent", accent);
  document.documentElement.style.setProperty(
    "--studio-on-accent",
    prefersDarkInk(accent) ? "#000000" : "#ffffff",
  );
  document.documentElement.style.setProperty(
    "--studio-accent-on-light",
    accentForLight(accent),
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
