import { useEffect, useId, useState, type CSSProperties } from "react";
import { useStudio } from "@/lib/studio";
import { useMotionAllowed } from "@/hooks/useMotionAllowed";
import { Avatar } from "./Avatar";
import "./companion.css";

export const formations = ["orbit", "helix", "wave", "emblem"] as const;
type Formation = (typeof formations)[number];

const EMBLEM = "/brand/say-less-emblem.png";

/** Orbit: three chrome beads on a tilted ring. Angles are the resting pose. */
const ORBIT_BEADS = [20, 150, 265];
const ORBIT_SQUASH = 17 / 42; // ring height / width
const ORBIT_SECONDS = 14;
/** Helix: rows of paired beads; each row is a little further round the twist. */
const HELIX_ROWS = 9;
const HELIX_R = 22;
const HELIX_SECONDS = 5;
const HELIX_TWIST = 0.09; // of a turn per row

/** Shared brushed-silver stroke and chrome bead fills for one SVG. */
function ChromeDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#6f757e" />
        <stop offset="0.5" stopColor="#f4f6f8" />
        <stop offset="1" stopColor="#6f757e" />
      </linearGradient>
      <radialGradient id={`${id}-bead`} cx="0.36" cy="0.32" r="0.7">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.35" stopColor="#d7dbe0" />
        <stop offset="0.75" stopColor="#80868f" />
        <stop offset="1" stopColor="#3b4047" />
      </radialGradient>
    </defs>
  );
}

/** A point is in front of the core while it is on the lower half of the ring. */
const inFront = (degrees: number) => {
  const d = ((degrees % 360) + 360) % 360;
  return d > 0 && d < 180;
};

/**
 * One layer of the orbit. The back layer paints behind the center piece and
 * the front layer over it, so beads pass behind and in front of the core.
 * Each bead is counter-rotated and counter-squashed, so it stays round while
 * it travels the tilted ring.
 */
function OrbitLayer({ id, layer }: { id: string; layer: "back" | "front" }) {
  return (
    <svg viewBox="0 0 100 100" className={`formation-svg orbit-${layer}`}>
      <ChromeDefs id={id} />
      <g transform="translate(50 50) rotate(-18)">
        {layer === "back" ? (
          <>
            <ellipse
              className="orbit-glow"
              rx="45"
              ry={45 * ORBIT_SQUASH + 2}
            />
            <ellipse
              rx="42"
              ry={42 * ORBIT_SQUASH}
              fill="none"
              stroke={`url(#${id}-steel)`}
              strokeWidth="1.1"
              opacity="0.55"
            />
          </>
        ) : (
          <path
            d={`M42 0A42 ${42 * ORBIT_SQUASH} 0 0 1 -42 0`}
            fill="none"
            stroke={`url(#${id}-steel)`}
            strokeWidth="1.3"
          />
        )}
        <g transform={`scale(1 ${ORBIT_SQUASH})`}>
          {ORBIT_BEADS.map((angle, i) => {
            const shown = inFront(angle) === (layer === "front");
            return (
              <g key={angle} transform={`rotate(${angle})`}>
                <g className="orbit-spin">
                  <g transform="translate(42 0)">
                    <g className="orbit-counter">
                      <g
                        transform={`rotate(${-angle}) scale(1 ${1 / ORBIT_SQUASH})`}
                      >
                        <circle
                          className={`orbit-bead bead-${layer}`}
                          r={i === 0 ? 3.4 : 2.6}
                          fill={`url(#${id}-bead)`}
                          style={
                            {
                              opacity: shown
                                ? layer === "front"
                                  ? 1
                                  : 0.5
                                : 0,
                              animationDelay: `${(-ORBIT_SECONDS * angle) / 360}s`,
                            } as CSSProperties
                          }
                        />
                      </g>
                    </g>
                  </g>
                </g>
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}

/**
 * Helix: bead pairs slide side to side a quarter-turn apart, with a rung
 * between them, which reads as a slowly turning double strand.
 */
function Helix({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 100 100" className="formation-svg">
      <ChromeDefs id={id} />
      <g transform="translate(50 0)">
        {Array.from({ length: HELIX_ROWS }, (_, row) => {
          const y = 14 + row * 9;
          const turn = row * HELIX_TWIST;
          const angle = turn * Math.PI * 2;
          const delay = -HELIX_SECONDS * turn;
          const bead = (offset: number) => {
            const a = angle + offset;
            const depth = Math.sin(a);
            return {
              transform: `translateX(${(HELIX_R * Math.cos(a)).toFixed(2)}px) scale(${(0.9 + 0.3 * depth).toFixed(2)})`,
              opacity: 0.72 + 0.28 * depth,
            };
          };
          return (
            <g key={row}>
              <line
                className="helix-rung"
                x1={-HELIX_R}
                x2={HELIX_R}
                y1={y}
                y2={y}
                stroke="#c9ced6"
                strokeWidth="0.8"
                style={{
                  transform: `scaleX(${Math.abs(Math.cos(angle)).toFixed(2)})`,
                  animationDelay: `${delay}s`,
                }}
              />
              {[0, Math.PI].map((offset) => (
                <circle
                  key={offset}
                  className="helix-bead"
                  cx="0"
                  cy={y}
                  r="2.4"
                  fill={`url(#${id}-bead)`}
                  style={{
                    ...bead(offset),
                    animationDelay: `${delay - (offset ? HELIX_SECONDS / 2 : 0)}s`,
                  }}
                />
              ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** A smooth periodic sine path from x=-50 to x=150 (one period = `period`). */
function sinePath(amp: number, period: number) {
  let d = "";
  for (let x = -50; x <= 150; x += 2.5) {
    const y = 50 + amp * Math.sin((x / period) * Math.PI * 2);
    d += `${d ? "L" : "M"}${x} ${y.toFixed(2)}`;
  }
  return d;
}
const WAVE_LINES = [
  { cls: "wave-back", amp: 6, width: 0.9 },
  { cls: "wave-mid", amp: 13, width: 1.1 },
  { cls: "wave-front", amp: 9, width: 1.7 },
];

/** Wave: three sine ribbons flowing sideways, faded out at the edges. */
function Wave({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 100 100" className="formation-svg">
      <ChromeDefs id={id} />
      <defs>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.06" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.94" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask
          id={`${id}-mask`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="100"
          height="100"
        >
          <rect width="100" height="100" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}-mask)`}>
        {WAVE_LINES.map((line) => (
          <path
            key={line.cls}
            className={`wave-line ${line.cls}`}
            d={sinePath(line.amp, 50)}
            fill="none"
            strokeWidth={line.width}
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}

/** Chrome S: a thin bezel ring with a glint travelling round it. */
function Bezel({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 100 100" className="formation-svg">
      <ChromeDefs id={id} />
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke={`url(#${id}-steel)`}
        strokeWidth="0.9"
        opacity="0.5"
      />
      <circle
        className="bezel-glint"
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="#f4f6f8"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="22 261"
      />
    </svg>
  );
}

function FormationArt({ kind, id }: { kind: Formation; id: string }) {
  if (kind === "helix") return <Helix id={id} />;
  if (kind === "wave") return <Wave id={id} />;
  if (kind === "emblem") return <Bezel id={id} />;
  return <OrbitLayer id={id} layer="back" />;
}

/** The real S emblem, blended onto the charcoal stage, with a slow sheen. */
function Emblem({ large }: { large: boolean }) {
  return (
    <span className={`companion-emblem ${large ? "is-large" : ""}`}>
      <img src={EMBLEM} alt="" />
      <span className="emblem-sheen" />
    </span>
  );
}

export function Companion({
  level = 0,
  active = false,
  thinking = false,
  formation,
  character,
  paused = false,
}: {
  level?: number;
  active?: boolean;
  /** True while the dictation is being turned into text. */
  thinking?: boolean;
  formation?: string;
  /** Overrides the saved character (the picker previews formations with it). */
  character?: string;
  paused?: boolean;
}) {
  const settings = useStudio((s) => s.settings);
  const id = `cmp-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
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
  const picked =
    formation ||
    (settings.dock_cycle && moving
      ? formations[cycle]
      : settings.dock_animation);
  const selected: Formation = (formations as readonly string[]).includes(picked)
    ? (picked as Formation)
    : "orbit";
  const who = character ?? settings.dock_character;
  // Chrome S always shows the real emblem, unless a face takes the center.
  const emblemCenter =
    selected === "emblem" && (who === "orb" || who === "emblem");
  return (
    <div
      aria-hidden="true"
      className={`companion character-${who} formation-${selected} ${moving ? "is-moving" : "is-paused"} ${active ? "is-listening" : ""} ${thinking ? "is-thinking" : ""}`}
      style={
        {
          "--voice-scale": 1 + (active && moving ? level * 0.28 : 0),
        } as CSSProperties
      }
    >
      <div className="companion-stage" />
      <div className="particle-world">
        <FormationArt kind={selected} id={id} />
      </div>
      {who === "avatar" ? (
        <div className="companion-avatar">
          <Avatar
            avatar={settings.avatar}
            level={active ? level : 0}
            moving={moving}
            state={thinking ? "thinking" : active ? "listening" : "idle"}
            rings={2}
          />
        </div>
      ) : who === "buddy" || who === "both" ? (
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
      ) : emblemCenter ? (
        <Emblem large />
      ) : who === "orb" ? (
        <div className="companion-orb" />
      ) : (
        <Emblem large={false} />
      )}
      {selected === "orbit" && who !== "avatar" && who !== "buddy" && (
        <div className="particle-front">
          <OrbitLayer id={`${id}f`} layer="front" />
        </div>
      )}
    </div>
  );
}
