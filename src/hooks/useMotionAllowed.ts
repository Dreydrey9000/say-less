import { useEffect, useState } from "react";
import { useStudio } from "@/lib/studio";

/**
 * Decorative motion is allowed only when the user has not paused animations,
 * the OS is not asking for reduced motion, and the window is visible.
 */
export function useMotionAllowed(paused = false) {
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
  return dockMotion && visible && !reduced && !paused;
}
