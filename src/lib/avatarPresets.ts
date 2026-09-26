/**
 * The painted avatar pack. Each character is a static WebP in
 * `public/avatars/` (256px for the dock and preview, 128px for small spots),
 * painted once for this project and shipped with the app, so it works offline.
 *
 * The paintings have bead eyes and no mouth. The talking mouth and the blinking
 * lids are the same live SVG shapes the custom avatar uses, placed on each face
 * with the anchor numbers below (a 100x100 box over the square image).
 *
 * Keep the ids in sync with `AVATAR_PRESETS` in `src-tauri/src/studio.rs`.
 */
export interface AvatarFace {
  /** Horizontal center of the face. */
  cx: number;
  /** Center line of the painted eyes. */
  eyeY: number;
  /** Distance from `cx` to each eye center. */
  eyeDx: number;
  /** Eyelid radius, a little larger than the painted eye. */
  lidR: number;
  /** Top of the mouth. */
  mouthY: number;
  /** Mouth scale: the same "head radius" the SVG avatar sizes its mouth by. */
  mouthR: number;
  /**
   * Left and right eyelid colors, sampled from the skin, fur or shell around
   * each eye (the key light comes from the upper left, so they differ).
   */
  lids: readonly [string, string];
  /** Mouth color when the default dark mouth would vanish (a dark visor). */
  mouth?: string;
}

export interface AvatarPreset {
  id: string;
  group: "people" | "animals" | "characters";
  face: AvatarFace;
}

export const avatarPresets: readonly AvatarPreset[] = [
  {
    id: "woman-curls",
    group: "people",
    face: {
      cx: 50.0,
      eyeY: 45.0,
      eyeDx: 12.14,
      lidR: 3.09,
      mouthY: 64.43,
      mouthR: 24.6,
      lids: ["#b57f64", "#6d3e36"],
    },
  },
  {
    id: "man-beard",
    group: "people",
    face: {
      cx: 50.0,
      eyeY: 45.03,
      eyeDx: 12.83,
      lidR: 3.17,
      mouthY: 65.55,
      mouthR: 26.0,
      lids: ["#d3b08e", "#987059"],
    },
  },
  {
    id: "silver-bob",
    group: "people",
    face: {
      cx: 50.07,
      eyeY: 45.05,
      eyeDx: 12.83,
      lidR: 3.22,
      mouthY: 65.57,
      mouthR: 26.0,
      lids: ["#c4937f", "#e5c1ad"],
    },
  },
  {
    id: "fade",
    group: "people",
    face: {
      cx: 49.93,
      eyeY: 45.0,
      eyeDx: 12.79,
      lidR: 2.94,
      mouthY: 65.46,
      mouthR: 25.9,
      lids: ["#7e5a49", "#3b231f"],
    },
  },
  {
    id: "hijab",
    group: "people",
    face: {
      cx: 50.0,
      eyeY: 45.02,
      eyeDx: 12.83,
      lidR: 3.4,
      mouthY: 65.04,
      mouthR: 26.0,
      lids: ["#884f35", "#bc8b6e"],
    },
  },
  {
    id: "grey-hair",
    group: "people",
    face: {
      cx: 50.0,
      eyeY: 44.97,
      eyeDx: 12.83,
      lidR: 3.54,
      mouthY: 65.5,
      mouthR: 26.0,
      lids: ["#ddb48e", "#9e7258"],
    },
  },
  {
    id: "cat",
    group: "animals",
    face: {
      cx: 50.39,
      eyeY: 45.9,
      eyeDx: 14.36,
      lidR: 3.72,
      mouthY: 56.23,
      mouthR: 29.1,
      lids: ["#e0985e", "#af6939"],
    },
  },
  {
    id: "dog",
    group: "animals",
    face: {
      cx: 50.15,
      eyeY: 40.58,
      eyeDx: 13.53,
      lidR: 4.38,
      mouthY: 58.43,
      mouthR: 27.4,
      lids: ["#a28265", "#dec099"],
    },
  },
  {
    id: "fox",
    group: "animals",
    face: {
      cx: 50.59,
      eyeY: 48.97,
      eyeDx: 14.06,
      lidR: 4.38,
      mouthY: 60.79,
      mouthR: 28.5,
      lids: ["#c86b44", "#944226"],
    },
  },
  {
    id: "frog",
    group: "animals",
    face: {
      cx: 50.24,
      eyeY: 25.88,
      eyeDx: 22.02,
      lidR: 4.81,
      mouthY: 53.19,
      mouthR: 44.6,
      lids: ["#9fa572", "#6a754e"],
    },
  },
  {
    id: "bear",
    group: "animals",
    face: {
      cx: 51.27,
      eyeY: 48.88,
      eyeDx: 14.16,
      lidR: 4.23,
      mouthY: 63.04,
      mouthR: 28.7,
      lids: ["#b28063", "#603625"],
    },
  },
  {
    id: "owl",
    group: "animals",
    face: {
      cx: 50.34,
      eyeY: 44.78,
      eyeDx: 13.13,
      lidR: 3.92,
      mouthY: 58.44,
      mouthR: 26.6,
      lids: ["#c3a690", "#917969"],
    },
  },
  {
    id: "robot",
    group: "characters",
    face: {
      cx: 49.76,
      eyeY: 49.41,
      eyeDx: 15.77,
      lidR: 3.67,
      mouthY: 60.77,
      mouthR: 31.9,
      lids: ["#201d1f", "#161519"],
      mouth: "#5fd6ea",
    },
  },
  {
    id: "alien",
    group: "characters",
    face: {
      cx: 50.0,
      eyeY: 44.95,
      eyeDx: 12.83,
      lidR: 3.69,
      mouthY: 66.77,
      mouthR: 26.0,
      lids: ["#acc3a1", "#829a79"],
    },
  },
  {
    id: "chrome-bubble",
    group: "characters",
    face: {
      cx: 50.0,
      eyeY: 46.73,
      eyeDx: 14.75,
      lidR: 3.72,
      mouthY: 61.47,
      mouthR: 29.8,
      lids: ["#a8a4a3", "#787677"],
    },
  },
  {
    id: "chrome-bot",
    group: "characters",
    face: {
      cx: 50.2,
      eyeY: 50.59,
      eyeDx: 16.5,
      lidR: 4.38,
      mouthY: 67.75,
      mouthR: 33.4,
      lids: ["#bcb4ad", "#7d7978"],
    },
  },
];

export function findPreset(id: string | null | undefined) {
  return id ? avatarPresets.find((p) => p.id === id) : undefined;
}

export function presetImage(id: string, size: 128 | 256 = 256) {
  return `/avatars/${id}-${size}.webp`;
}
