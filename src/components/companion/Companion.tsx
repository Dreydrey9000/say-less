import { useEffect, useState, type CSSProperties } from "react";
import { useStudio } from "@/lib/studio";
import "./companion.css";

export const formations = ["orbit", "helix", "wave", "emblem"] as const;
export function Companion({
  level = 0,
  active = false,
  formation,
  paused = false,
}: {
  level?: number;
  active?: boolean;
  formation?: string;
  paused?: boolean;
}) {
  const settings = useStudio((s) => s.settings);
  const [visible, setVisible] = useState(!document.hidden);
  const [reduced, setReduced] = useState(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [cycle, setCycle] = useState(0);
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
  const moving = settings.dock_motion && visible && !reduced && !paused;
  useEffect(() => {
    if (!moving || !settings.dock_cycle || formation) return;
    const timer = setInterval(
      () => setCycle((v) => (v + 1) % formations.length),
      20000,
    );
    return () => clearInterval(timer);
  }, [moving, settings.dock_cycle, formation]);
  const selected =
    formation ||
    (settings.dock_cycle && moving
      ? formations[cycle]
      : settings.dock_animation);
  return (
    <div
      aria-hidden="true"
      className={`companion formation-${selected} ${moving ? "is-moving" : "is-paused"} ${active ? "is-listening" : ""}`}
      style={
        {
          "--voice-scale": 1 + (active && moving ? level * 0.28 : 0),
        } as CSSProperties
      }
    >
      <div className="particle-world">
        {Array.from({ length: 48 }, (_, i) => {
          const angle = i * 2.399963;
          const radius = Math.sqrt((i + 0.5) / 48) * 43;
          const x =
            selected === "helix"
              ? Math.sin(i * 0.42) * 32
              : selected === "wave"
                ? (i % 12) * 7 - 38
                : Math.cos(angle) * radius;
          const y =
            selected === "helix"
              ? (i / 47) * 80 - 40
              : selected === "wave"
                ? Math.sin(i * 0.45) * 23 + Math.floor(i / 12) * 7 - 10
                : Math.sin(angle) * radius;
          return (
            <i
              key={i}
              style={
                {
                  left: `${50 + x}%`,
                  top: `${50 + y}%`,
                  "--delay": `${-i * 0.23}s`,
                  "--dot-size": `${2 + (i % 3)}px`,
                } as CSSProperties
              }
            />
          );
        })}
      </div>
      <img
        className="companion-emblem"
        src="/brand/say-less-emblem.png"
        alt=""
      />
    </div>
  );
}
