import { useEffect, useId, useLayoutEffect, useRef } from "react";

const POINTS = 40;

/** Each strand: phase offset (rad), amplitude scale, stroke width, opacity. */
export const STRANDS = [
  { phase: 0, amp: 1, width: 2.2, opacity: 1 },
  { phase: 0.9, amp: 0.7, width: 1.4, opacity: 0.55 },
  { phase: -1.4, amp: 0.45, width: 1, opacity: 0.3 },
] as const;

type Mode = "live" | "arming" | "still";

/** Linear read of the level buckets at position x (0..1). */
function sample(levels: number[], x: number) {
  if (levels.length === 0) return 0;
  const at = x * (levels.length - 1);
  const i = Math.floor(at);
  const a = levels[i] ?? 0;
  const b = levels[Math.min(levels.length - 1, i + 1)] ?? a;
  return a + (b - a) * (at - i);
}

function clean(levels: number[]) {
  return levels.map((v) =>
    Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0,
  );
}

/** How tall the line should be for this input: quiet speech still moves a bit. */
export function targetGain(levels: number[], mode: Mode) {
  if (mode === "arming") return 0.06;
  if (mode === "still") return 0.9;
  const loudest = Math.max(0, ...clean(levels));
  return Math.min(1, 0.18 + Math.pow(loudest, 0.7) * 1.05);
}

/**
 * Critically-damped-ish spring (damping ratio ~0.65), so a loud syllable
 * overshoots a touch and settles instead of snapping. `dt` is in seconds.
 */
export function springStep(
  value: number,
  velocity: number,
  target: number,
  dt: number,
) {
  const stiffness = 240;
  const damping = 2 * 0.65 * Math.sqrt(stiffness);
  const v = velocity + ((target - value) * stiffness - velocity * damping) * dt;
  return { value: value + v * dt, velocity: v };
}

/**
 * SVG path for one voice strand. `gain` is the (spring-smoothed) loudness,
 * `shape` the per-position level buckets, `phase` slides the wave along and
 * `time` moves a slow swell down the length so the line never looks uniform.
 */
export function strandPath(
  shape: number[],
  gain: number,
  phase: number,
  time: number,
  width: number,
  height: number,
  strand: (typeof STRANDS)[number],
  live: boolean,
) {
  const mid = height / 2;
  const reach = height / 2 - 1.5;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < POINTS; i++) {
    const x = i / (POINTS - 1);
    const taper = Math.pow(Math.sin(Math.PI * x), 1.2);
    const swell = 0.62 + 0.38 * Math.cos(Math.PI * 2 * 1.1 * x - time * 0.9);
    const body = live ? 0.45 + 0.55 * Math.pow(sample(shape, x), 0.7) : 0.7;
    const p = phase + strand.phase;
    const wave =
      0.65 * Math.sin(Math.PI * 2 * 2.2 * x + p) +
      0.35 * Math.sin(Math.PI * 2 * 4.1 * x - p * 1.6);
    points.push([
      x * width,
      mid + reach * gain * strand.amp * taper * swell * body * wave,
    ]);
  }
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += `Q${x.toFixed(1)} ${y.toFixed(2)} ${((x + nx) / 2).toFixed(1)} ${((y + ny) / 2).toFixed(2)}`;
  }
  const last = points[points.length - 1];
  return `${d}L${last[0].toFixed(1)} ${last[1].toFixed(2)}`;
}

/**
 * Wavy voice line for the recording overlay: three phase-offset strands (a
 * bright front strand with a silver core and glow, two fainter ones behind),
 * over a faint baseline so an idle pill never looks empty. Loudness drives a
 * spring, so the line swells and settles instead of jumping. It redraws on one
 * animation-frame loop by writing the paths directly, so the overlay does not
 * re-render 60 times a second, and the loop stops whenever motion is off or
 * the window is hidden (the caller's `moving`).
 */
export function VoiceSquiggle({
  levels,
  ready,
  moving,
  width = 84,
  height = 24,
}: {
  levels: number[];
  ready: boolean;
  moving: boolean;
  width?: number;
  height?: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const paths = useRef<Array<SVGPathElement | null>>([]);
  const latest = useRef(levels);
  const mode: Mode = !ready ? "arming" : moving ? "live" : "still";
  // Spring state survives re-renders, so a new level event never restarts it.
  const motion = useRef({ gain: 0.06, velocity: 0, shape: [] as number[] });

  const draw = (phase: number, time: number, gain: number, live: boolean) => {
    const shape = live ? motion.current.shape : [];
    STRANDS.forEach((strand, i) =>
      paths.current[i]?.setAttribute(
        "d",
        strandPath(shape, gain, phase, time, width, height, strand, live),
      ),
    );
  };

  // The paths are written imperatively (never through a `d` prop), so parent
  // re-renders on each level event cannot reset the travelling phase.
  useLayoutEffect(() => {
    latest.current = levels;
    if (mode === "live") return;
    const gain = targetGain(levels, mode);
    motion.current.gain = gain;
    motion.current.velocity = 0;
    // A fixed, pleasant pose for Reduce Motion / Pause; a near-flat line while arming.
    draw(mode === "still" ? 0.8 : 0, 0, gain, false);
  }, [levels, mode, width, height]);

  useEffect(() => {
    if (mode !== "live") return;
    let phase = 0;
    let time = 0;
    let frame = 0;
    let last = performance.now();
    const m = motion.current;
    const tick = (now: number) => {
      // Clamp the step so a stalled frame (window was busy) can't fling the spring.
      const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
      last = now;
      const target = clean(latest.current);
      m.shape = target.map((v, i) => {
        const prev = m.shape[i] ?? v;
        return prev + (v - prev) * (1 - Math.exp(-dt * 18));
      });
      const next = springStep(
        m.gain,
        m.velocity,
        targetGain(target, "live"),
        dt,
      );
      m.gain = Math.max(0, next.value);
      m.velocity = next.velocity;
      phase = (phase + dt * (6 + m.gain * 4)) % (Math.PI * 20);
      time = (time + dt) % 1000;
      draw(phase, time, m.gain, true);
      frame = requestAnimationFrame(tick);
    };
    draw(phase, time, m.gain, true);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, width, height]);

  const front = `sq-front-${id}`;
  const back = `sq-back-${id}`;
  const base = `sq-base-${id}`;
  const glow = `sq-glow-${id}`;
  return (
    <svg
      className={`ssquiggle ${ready ? "ready" : "arming"} ${mode === "still" ? "is-still" : ""}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* User-space units: a flat line has a zero-height box, which would
            otherwise hide both the gradient and the glow. */}
        <linearGradient
          id={front}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={width}
          y2="0"
        >
          <stop offset="0" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="0.2" stopColor="currentColor" stopOpacity="0.85" />
          {/* Silver-white core; CSS mutes it while the mic is arming. */}
          <stop offset="0.5" className="ssquiggle-core" stopColor="#f4f6f8" />
          <stop offset="0.8" stopColor="currentColor" stopOpacity="0.85" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient
          id={back}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={width}
          y2="0"
        >
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.5" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={base}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={width}
          y2="0"
        >
          <stop offset="0" stopColor="#f4f6f8" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f4f6f8" stopOpacity="0.28" />
          <stop offset="1" stopColor="#f4f6f8" stopOpacity="0" />
        </linearGradient>
        <filter
          id={glow}
          filterUnits="userSpaceOnUse"
          x={-4}
          y={-4}
          width={width + 8}
          height={height + 8}
        >
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <line
        className="ssquiggle-base"
        x1="0"
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke={`url(#${base})`}
        strokeWidth="1"
      />
      {/* Back to front, so the brightest strand paints last. */}
      {[2, 1, 0].map((i) => (
        <path
          key={i}
          ref={(el) => {
            paths.current[i] = el;
          }}
          className={`ssquiggle-strand ${i === 0 ? "strand-front" : `strand-back strand-${i + 1}`}`}
          fill="none"
          stroke={`url(#${i === 0 ? front : back})`}
          strokeWidth={STRANDS[i].width}
          strokeOpacity={STRANDS[i].opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={i === 0 ? `url(#${glow})` : undefined}
        />
      ))}
    </svg>
  );
}
