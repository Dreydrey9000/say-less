import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { prefersDarkInk, type AvatarSettings } from "@/lib/studio";
import "./avatar.css";

// Head geometry per style, in a 100x100 viewBox. Accessories and the mouth are
// placed from these numbers so every style/accessory pair lines up.
const heads = {
  stick: { cx: 50, cy: 33, r: 19, eyeY: 31, eyeDx: 7, mouthY: 41 },
  person: { cx: 50, cy: 44, r: 22, eyeY: 44, eyeDx: 8.5, mouthY: 55 },
  cat: { cx: 50, cy: 55, r: 26, eyeY: 52, eyeDx: 10, mouthY: 68 },
  dog: { cx: 50, cy: 54, r: 25, eyeY: 48, eyeDx: 10, mouthY: 70 },
} as const;
type Head = (typeof heads)[keyof typeof heads];

/** Volume below this is treated as silence so breathing/room noise keeps the mouth shut. */
const GATE = 0.06;

/**
 * How far the mouth should open for a given voice level: a fast attack and a
 * slower release, so syllables read as flaps instead of jitter.
 */
export function nextMouthOpen(previous: number, level: number) {
  const target = Math.min(1, Math.max(0, (level - GATE) / 0.45));
  const next =
    previous + (target - previous) * (target > previous ? 0.65 : 0.3);
  return next < 0.04 ? 0 : Math.round(next * 100) / 100;
}

function Accessory({
  kind,
  head,
  accent,
}: {
  kind: string;
  head: Head;
  accent: string;
}) {
  const { cx, cy, r, eyeY, eyeDx } = head;
  const band = cy - r * 0.3;
  switch (kind) {
    case "cap":
      return (
        <g className="avatar-accessory" fill={accent}>
          <path
            d={`M${cx - r * 1.02} ${band} A${r * 1.02} ${r * 1.02} 0 0 1 ${cx + r * 1.02} ${band} Z`}
          />
          <rect
            x={cx}
            y={band - r * 0.12}
            width={r * 1.45}
            height={r * 0.22}
            rx={r * 0.11}
          />
        </g>
      );
    case "beanie":
      return (
        <g className="avatar-accessory" fill={accent}>
          <path
            d={`M${cx - r} ${band} A${r} ${r * 1.08} 0 0 1 ${cx + r} ${band} Z`}
          />
          <rect
            x={cx - r * 1.08}
            y={band - r * 0.2}
            width={r * 2.16}
            height={r * 0.34}
            rx={r * 0.14}
          />
          <rect
            x={cx - r * 1.08}
            y={band - r * 0.2}
            width={r * 2.16}
            height={r * 0.34}
            rx={r * 0.14}
            fill="#000"
            opacity="0.22"
          />
          <circle cx={cx} cy={cy - r * 1.12} r={r * 0.2} />
        </g>
      );
    case "crown": {
      const base = cy - r * 0.62;
      const w = r * 0.62;
      const top = base - r * 0.55;
      return (
        <path
          className="avatar-accessory"
          fill="#f2c94c"
          stroke="#8a6a12"
          strokeWidth="1.2"
          strokeLinejoin="round"
          d={`M${cx - w} ${base} L${cx - w} ${top} L${cx - w / 2} ${base - r * 0.28} L${cx} ${top - r * 0.12} L${cx + w / 2} ${base - r * 0.28} L${cx + w} ${top} L${cx + w} ${base} Z`}
        />
      );
    }
    case "headphones":
      return (
        <g className="avatar-accessory">
          <path
            d={`M${cx - r * 1.02} ${cy} A${r * 1.06} ${r * 1.1} 0 0 1 ${cx + r * 1.02} ${cy}`}
            fill="none"
            stroke={accent}
            strokeWidth={r * 0.16}
            strokeLinecap="round"
          />
          {[-1, 1].map((side) => (
            <rect
              key={side}
              x={cx + side * r * 1.02 - r * 0.2}
              y={cy - r * 0.34}
              width={r * 0.4}
              height={r * 0.68}
              rx={r * 0.18}
              fill={accent}
            />
          ))}
        </g>
      );
    case "sunglasses": {
      const w = r * 0.5;
      const h = r * 0.32;
      return (
        <g className="avatar-accessory">
          <path
            d={`M${cx - eyeDx + w / 2} ${eyeY} L${cx + eyeDx - w / 2} ${eyeY}`}
            stroke="#15181e"
            strokeWidth="2"
          />
          {[-1, 1].map((side) => (
            <rect
              key={side}
              x={cx + side * eyeDx - w / 2}
              y={eyeY - h / 2}
              width={w}
              height={h}
              rx={h * 0.45}
              fill="#15181e"
            />
          ))}
        </g>
      );
    }
    default:
      return null;
  }
}

function Figure({
  kind,
  ink,
  colors,
}: {
  kind: string;
  ink: string;
  colors: { body: string; accent: string; bg: string };
}) {
  const { body, accent, bg } = colors;
  if (kind === "stick")
    return (
      <g
        fill="none"
        stroke={body}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M50 53V77" stroke={accent} strokeWidth="5" />
        <path d="M50 60L33 71M50 60L67 71M50 77L38 96M50 77L62 96" />
        <circle cx="50" cy="33" r="19" fill={bg} />
      </g>
    );
  if (kind === "cat")
    return (
      <g>
        <path d="M27 46L29 17L49 33Z" fill={body} />
        <path d="M73 46L71 17L51 33Z" fill={body} />
        <path d="M31 38L32 25L42 33Z" fill={accent} />
        <path d="M69 38L68 25L58 33Z" fill={accent} />
        <circle cx="50" cy="55" r="26" fill={body} />
        <path d="M46 60H54L50 64Z" fill={accent} />
        <path
          d="M28 60H40M29 66L40 63M72 60H60M71 66L60 63"
          stroke={ink}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>
    );
  if (kind === "dog")
    return (
      <g>
        <ellipse
          cx="27"
          cy="50"
          rx="9"
          ry="18"
          transform="rotate(18 27 50)"
          fill={accent}
        />
        <ellipse
          cx="73"
          cy="50"
          rx="9"
          ry="18"
          transform="rotate(-18 73 50)"
          fill={accent}
        />
        <circle cx="50" cy="54" r="25" fill={body} />
        <ellipse cx="50" cy="64" rx="13" ry="10" fill="#fff" opacity="0.35" />
        <ellipse cx="50" cy="59" rx="5" ry="3.6" fill={ink} />
      </g>
    );
  return (
    <g>
      <path d="M20 104C20 80 33 71 50 71S80 80 80 104Z" fill={accent} />
      <rect x="44" y="60" width="12" height="14" fill={body} />
      <circle cx="50" cy="44" r="22" fill={body} />
      <path
        d="M28 44C26 26 38 18 51 18C64 18 75 27 72 44C67 35 59 31 47 32C39 33 32 37 28 44Z"
        fill={accent}
      />
      {/* Hair sits a shade darker than the accent so hats stay distinct. */}
      <path
        d="M28 44C26 26 38 18 51 18C64 18 75 27 72 44C67 35 59 31 47 32C39 33 32 37 28 44Z"
        fill="#000"
        opacity="0.28"
      />
    </g>
  );
}

/**
 * Flat SVG talking avatar. The mouth follows voice volume (not words), with a
 * closed-mouth idle and a CSS blink. With motion off it holds a static pose.
 */
export function Avatar({
  avatar,
  level = 0,
  moving = false,
  label,
  className = "",
}: {
  avatar: AvatarSettings;
  level?: number;
  moving?: boolean;
  label?: string;
  className?: string;
}) {
  const clip = `avatar-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [open, setOpen] = useState(0);
  const latest = useRef(level);
  useEffect(() => {
    latest.current = level;
  }, [level]);
  // Step the mouth on a steady clock rather than per level event, so it still
  // closes when the level stops changing (silence, or recording ending). The
  // clock stops once the mouth is shut and the room is quiet.
  const idle = open === 0 && level <= GATE;
  useEffect(() => {
    if (!moving) {
      setOpen(0);
      return;
    }
    if (idle) return;
    const timer = setInterval(
      () => setOpen((previous) => nextMouthOpen(previous, latest.current)),
      40,
    );
    return () => clearInterval(timer);
  }, [moving, idle]);
  const kind = avatar.kind in heads ? avatar.kind : "person";
  const head = heads[kind as keyof typeof heads];
  // Stick figures draw their face in the line color; filled faces pick
  // whichever ink contrasts with the skin/fur color.
  const ink =
    kind === "stick"
      ? avatar.body
      : prefersDarkInk(avatar.body)
        ? "#15181e"
        : "#f4f6f8";
  const mouthW = head.r * 0.22;
  return (
    <svg
      className={`avatar avatar-${kind} ${moving ? "is-moving" : "is-still"} ${open > 0 ? "is-talking" : ""} ${className}`}
      viewBox="0 0 100 100"
      focusable="false"
      data-mouth={open}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="50" fill={avatar.background} />
      <g
        clipPath={`url(#${clip})`}
        style={{ transform: `translateY(${-open * 1.5}px)` } as CSSProperties}
      >
        <Figure
          kind={kind}
          ink={ink}
          colors={{
            body: avatar.body,
            accent: avatar.accent,
            bg: avatar.background,
          }}
        />
        <g className="avatar-eyes" fill={ink}>
          {[-1, 1].map((side) =>
            kind === "cat" ? (
              <ellipse
                key={side}
                cx={head.cx + side * head.eyeDx}
                cy={head.eyeY}
                rx="2.8"
                ry="4"
              />
            ) : (
              <circle
                key={side}
                cx={head.cx + side * head.eyeDx}
                cy={head.eyeY}
                r={kind === "stick" ? 2.4 : 2.8}
              />
            ),
          )}
        </g>
        {open > 0 ? (
          <ellipse
            className="avatar-mouth"
            cx={head.cx}
            cy={head.mouthY}
            rx={mouthW * (1 + open * 0.25)}
            ry={0.8 + open * head.r * 0.2}
            fill={ink}
          />
        ) : (
          <path
            className="avatar-mouth"
            d={`M${head.cx - mouthW} ${head.mouthY - 1}Q${head.cx} ${head.mouthY + 3} ${head.cx + mouthW} ${head.mouthY - 1}`}
            fill="none"
            stroke={ink}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        )}
        <Accessory kind={avatar.accessory} head={head} accent={avatar.accent} />
      </g>
    </svg>
  );
}
