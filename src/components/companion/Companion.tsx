import { useEffect, useState, type CSSProperties } from "react";
import { useStudio } from "@/lib/studio";
import { useMotionAllowed } from "@/hooks/useMotionAllowed";
import { Avatar } from "./Avatar";
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
  const [cycle, setCycle] = useState(0);
  const moving = useMotionAllowed(paused);
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
      className={`companion character-${settings.dock_character} formation-${selected} ${moving ? "is-moving" : "is-paused"} ${active ? "is-listening" : ""}`}
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
      {settings.dock_character === "avatar" ? (
        <div className="companion-avatar">
          <Avatar
            avatar={settings.avatar}
            level={active ? level : 0}
            moving={moving}
          />
        </div>
      ) : settings.dock_character === "buddy" ||
        settings.dock_character === "both" ? (
        <svg
          className="companion-buddy"
          viewBox="0 0 100 100"
          focusable="false"
        >
          <path
            className="buddy-body"
            d="M20 58C13 26 31 13 50 13S87 26 80 58L87 81Q78 87 69 78Q50 92 31 78Q22 87 13 81Z"
            fill="currentColor"
          />
          <rect x="25" y="31" width="50" height="31" rx="14" fill="#15181e" />
          <g className="buddy-eyes" fill="#fff">
            <ellipse cx="38" cy="46" rx="5" ry="8" />
            <ellipse cx="62" cy="46" rx="5" ry="8" />
          </g>
          <path
            d="M43 71Q50 77 57 71"
            fill="none"
            stroke="#15181e"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : settings.dock_character === "orb" ? (
        <div className="companion-orb" />
      ) : (
        <img
          className="companion-emblem"
          src="/brand/say-less-emblem.png"
          alt=""
        />
      )}
    </div>
  );
}
