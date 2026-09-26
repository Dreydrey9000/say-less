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
  bot: { cx: 50, cy: 51, r: 29, eyeY: 50, eyeDx: 7.5, mouthY: 66 },
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
  uid,
}: {
  kind: string;
  ink: string;
  colors: { body: string; accent: string; bg: string };
  uid: string;
}) {
  const { body, accent, bg } = colors;
  // A glossy orb: flat body color, a soft light from the top left, shade
  // toward the bottom right and one specular highlight.
  if (kind === "bot")
    return (
      <g>
        <defs>
          <radialGradient id={`bot-light-${uid}`} cx="32%" cy="26%" r="70%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`bot-shade-${uid}`} cx="36%" cy="30%" r="78%">
            <stop offset="0.5" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.38" />
          </radialGradient>
        </defs>
        <ellipse cx="50" cy="88" rx="21" ry="3.2" fill="#000" opacity="0.28" />
        <circle cx="50" cy="51" r="29" fill={body} />
        <circle cx="50" cy="51" r="29" fill={`url(#bot-light-${uid})`} />
        <circle cx="50" cy="51" r="29" fill={`url(#bot-shade-${uid})`} />
        <ellipse
          cx="39"
          cy="34"
          rx="7.5"
          ry="4"
          transform="rotate(-32 39 34)"
          fill="#fff"
          opacity="0.75"
        />
      </g>
    );
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

/** The bot's resting eyes: two tall pills. */
const BOT_EYE = { w: 6, h: 13 };

/**
 * The bot has no mouth. While you talk its eyes become three voice bars whose
 * height follows the same `open` value that drives the other mouths.
 */
function BotBars({ head, open }: { head: Head; open: number }) {
  const w = 4.6;
  const gap = 2.4;
  const x0 = head.cx - (w * 3 + gap * 2) / 2;
  return (
    <g className="avatar-bot-bars" opacity={open > 0 ? 1 : 0}>
      {[0.62, 1, 0.62].map((k, i) => {
        const h = 6 + open * 15 * k;
        return (
          <rect
            key={i}
            x={x0 + i * (w + gap)}
            y={head.eyeY - h / 2}
            width={w}
            height={h}
            rx={w / 2}
          />
        );
      })}
    </g>
  );
}

/** What the avatar is doing. "Done" is played on its own when listening ends. */
export type AvatarState = "idle" | "listening" | "thinking";

/**
 * One mouth outline for every opening, so talking morphs smoothly instead of
 * swapping a smile line for an oval. Closed, it is a thin smiling crescent;
 * as `open` grows the bottom lip drops into a rounded bowl.
 */
export function mouthPath(head: Head, open: number) {
  const { cx, mouthY, r } = head;
  const w = r * 0.22 * (1 + open * 0.2);
  const y0 = mouthY - 1;
  const top = mouthY + 1.9 - open * 2.2;
  const bottom = mouthY + 2.53 + open * r * 0.38;
  const f = (n: number) => n.toFixed(2);
  return (
    `M${f(cx - w)} ${f(y0)}Q${f(cx)} ${f(top)} ${f(cx + w)} ${f(y0)}` +
    `C${f(cx + w * 0.95)} ${f(bottom)} ${f(cx - w * 0.95)} ${f(bottom)} ${f(cx - w)} ${f(y0)}Z`
  );
}

/**
 * Flat SVG talking avatar. The mouth follows voice volume (not words); the
 * eyes blink on a random timer and drift a little; it breathes while
 * listening, looks up while thinking, and squashes when listening starts or
 * ends. Everything holds still with Reduce Motion or Pause.
 */
export function Avatar({
  avatar,
  level = 0,
  moving = false,
  state = "idle",
  rings = 0,
  label,
  className = "",
}: {
  avatar: AvatarSettings;
  level?: number;
  moving?: boolean;
  state?: AvatarState;
  /** Faint voice-reactive rings behind the face (0 to 2). */
  rings?: number;
  label?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clip = `avatar-clip-${uid}`;
  const mouthClip = `avatar-mouth-${uid}`;
  const [open, setOpen] = useState(0);
  const latest = useRef(level);
  const eyes = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const previous = useRef(state);
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
  // Blink on a random 2.2-5.4s timer so it never looks mechanical. The class
  // goes on the eye group directly, so React re-renders never cut a blink short.
  useEffect(() => {
    if (!moving) return;
    let next: ReturnType<typeof setTimeout>;
    let reopen: ReturnType<typeof setTimeout>;
    const blink = () => {
      eyes.current?.classList.add("is-blinking");
      reopen = setTimeout(
        () => eyes.current?.classList.remove("is-blinking"),
        140,
      );
      next = setTimeout(blink, 2200 + Math.random() * 3200);
    };
    next = setTimeout(blink, 1200 + Math.random() * 2000);
    const group = eyes.current;
    return () => {
      clearTimeout(next);
      clearTimeout(reopen);
      group?.classList.remove("is-blinking");
    };
  }, [moving]);
  // Squash-and-bounce when listening starts, a happy squint when it ends.
  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    const group = body.current;
    if (!moving || was === state || !group) return;
    const cls = state === "idle" ? "is-happy" : "is-squash";
    group.classList.remove("is-squash", "is-happy");
    void group.getBoundingClientRect(); // restart the animation
    group.classList.add(cls);
    const done = () => group.classList.remove(cls);
    group.addEventListener("animationend", done, { once: true });
    return () => group.removeEventListener("animationend", done);
  }, [state, moving]);

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
  // Eyelids match the skin, so a blink reads as a lid closing.
  const lid = kind === "stick" ? avatar.background : avatar.body;
  const eyeR = kind === "stick" ? 2.4 : 2.8;
  const bot = kind === "bot";
  const mouth = mouthPath(head, open);
  const mouthW = head.r * 0.22 * (1 + open * 0.2);
  const lipBottom = head.mouthY + 1.65 + open * head.r * 0.285;
  const tongueRy = 1 + open * head.r * 0.13;
  return (
    <svg
      className={`avatar avatar-${kind} state-${state} ${moving ? "is-moving" : "is-still"} ${open > 0 ? "is-talking" : ""} ${className}`}
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
        <clipPath id={mouthClip}>
          <path d={mouth} />
        </clipPath>
      </defs>
      {rings > 0 && (
        <g className="avatar-rings">
          {Array.from({ length: Math.min(2, rings) }, (_, i) => (
            <circle
              key={i}
              className={`avatar-ring ring-${i + 1}`}
              cx="50"
              cy="50"
              r={53 + i * 4}
              style={{ transform: `scale(${1 + open * (0.05 + i * 0.03)})` }}
            />
          ))}
        </g>
      )}
      <g className="avatar-body" ref={body}>
        <g className="avatar-breath">
          <circle cx="50" cy="50" r="50" fill={avatar.background} />
          <g
            clipPath={`url(#${clip})`}
            style={
              { transform: `translateY(${-open * 1.5}px)` } as CSSProperties
            }
          >
            <Figure
              kind={kind}
              ink={ink}
              uid={uid}
              colors={{
                body: avatar.body,
                accent: avatar.accent,
                bg: avatar.background,
              }}
            />
            <g className="avatar-eyes" ref={eyes}>
              <g className="avatar-look" fill={ink}>
                {bot && <BotBars head={head} open={open} />}
                {[-1, 1].map((side) =>
                  bot ? (
                    <rect
                      key={side}
                      className="avatar-bot-eye"
                      x={head.cx + side * head.eyeDx - BOT_EYE.w / 2}
                      y={head.eyeY - BOT_EYE.h / 2}
                      width={BOT_EYE.w}
                      height={BOT_EYE.h}
                      rx={BOT_EYE.w / 2}
                      opacity={open > 0 ? 0 : 1}
                    />
                  ) : kind === "cat" ? (
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
                      r={eyeR}
                    />
                  ),
                )}
              </g>
              {[-1, 1].map((side) => (
                <ellipse
                  key={side}
                  className="avatar-lid"
                  cx={head.cx + side * head.eyeDx}
                  cy={head.eyeY}
                  rx={(bot ? BOT_EYE.w / 2 : kind === "cat" ? 2.8 : eyeR) + 1.4}
                  ry={(bot ? BOT_EYE.h / 2 : kind === "cat" ? 4 : eyeR) + 1.4}
                  fill={lid}
                />
              ))}
            </g>
            <g
              className="avatar-mouth-group"
              display={bot ? "none" : undefined}
            >
              <path
                className="avatar-mouth"
                d={mouth}
                fill={ink === "#15181e" ? ink : "#2b1418"}
                stroke={ink}
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <ellipse
                className="avatar-tongue"
                clipPath={`url(#${mouthClip})`}
                cx={head.cx}
                cy={lipBottom - tongueRy * 0.35}
                rx={mouthW * 0.62}
                ry={tongueRy}
                fill="#e8737f"
                opacity={Math.min(1, Math.max(0, (open - 0.12) / 0.3))}
              />
            </g>
            <Accessory
              kind={avatar.accessory}
              head={head}
              accent={avatar.accent}
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
