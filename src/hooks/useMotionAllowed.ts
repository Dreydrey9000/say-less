import { useEffect, useState } from "react";
import { useStudio } from "@/lib/studio";

/**
 * How decorative motion should behave right now:
 * - "full": animate normally.
 * - "paused": the user paused animations (or the window is hidden). Freeze in
 *   place, keeping the current pose, so resuming continues from there.
 * - "reduced": the OS asks for reduced motion. Draw a still, deliberate pose.
 */
export type MotionPolicy = "full" | "paused" | "reduced";

export function useMotionPolicy(paused = false): MotionPolicy {
  const dockMotion = useStudio((s) => s.settings.dock_motion);
  const [visible, setVisible] = useState(!document.hidden);
  const [reduced, setReduced] = useState(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const visibility = () => setVisible(!document.hidden);
    const motion = () => setReduced(media.matches);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", motion);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", motion);
    };
  }, []);
  if (reduced) return "reduced";
  return dockMotion && visible && !paused ? "full" : "paused";
}

/**
 * Decorative motion is allowed only when the user has not paused animations,
 * the OS is not asking for reduced motion, and the window is visible.
 */
export function useMotionAllowed(paused = false) {
  return useMotionPolicy(paused) === "full";
}
