import { useEffect, useLayoutEffect, useRef } from "react";

const POINTS = 36;

/** Linear read of the level buckets at position x (0..1). */
function sample(levels: number[], x: number) {
  if (levels.length === 0) return 0;
  const at = x * (levels.length - 1);
  const i = Math.floor(at);
  const a = levels[i] ?? 0;
  const b = levels[Math.min(levels.length - 1, i + 1)] ?? a;
  return a + (b - a) * (at - i);
}

/**
 * SVG path for a smooth voice line. Louder input makes a taller wave, and the
 * level buckets bend its shape; `phase` slides it along while motion is on.
 * `still` draws a fixed gentle curve for Reduce Motion / Pause.
 */
export function squigglePath(
  levels: number[],
  phase: number,
  width: number,
  height: number,
  mode: "live" | "arming" | "still",
) {
  const clean = levels.map((v) =>
    Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0,
  );
  const loudest = Math.max(0, ...clean);
  const gain =
    mode === "arming"
      ? 0.06
      : mode === "still"
        ? 0.4
        : Math.min(1, 0.14 + Math.pow(loudest, 0.7) * 1.1);
  const mid = height / 2;
  const reach = height / 2 - 1.5;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < POINTS; i++) {
    const x = i / (POINTS - 1);
    const taper = Math.pow(Math.sin(Math.PI * x), 1.2);
    const shape =
      mode === "live" ? 0.35 + 0.65 * Math.pow(sample(clean, x), 0.7) : 0.7;
    const wave =
      0.65 * Math.sin(Math.PI * 2 * 2.2 * x + phase) +
      0.35 * Math.sin(Math.PI * 2 * 4.1 * x - phase * 1.6);
    points.push([x * width, mid + reach * gain * taper * shape * wave]);
  }
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += `Q${x.toFixed(1)} ${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)} ${((y + ny) / 2).toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return `${d}L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}

/**
 * Wavy voice line for the recording overlay. It redraws on animation frames by
 * writing the path directly, so the overlay does not re-render 60 times a second.
 */
export function VoiceSquiggle({
  levels,
  ready,
  moving,
  width = 68,
  height = 20,
}: {
  levels: number[];
  ready: boolean;
  moving: boolean;
  width?: number;
  height?: number;
}) {
  const path = useRef<SVGPathElement>(null);
  const latest = useRef(levels);
  const mode = !ready ? "arming" : moving ? "live" : "still";
  // The path is written imperatively (never through the `d` prop), so parent
  // re-renders on each level event cannot reset the travelling phase.
  useLayoutEffect(() => {
    latest.current = levels;
    if (mode !== "live")
      path.current?.setAttribute(
        "d",
        squigglePath(levels, 0, width, height, mode),
      );
  }, [levels, mode, width, height]);
  useEffect(() => {
    if (mode !== "live") return;
    let phase = 0;
    let frame = 0;
    path.current?.setAttribute(
      "d",
      squigglePath(latest.current, phase, width, height, "live"),
    );
    const tick = () => {
      phase = (phase + 0.14) % (Math.PI * 20);
      path.current?.setAttribute(
        "d",
        squigglePath(latest.current, phase, width, height, "live"),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, width, height]);
  return (
    <svg
      className={`ssquiggle ${ready ? "ready" : "arming"}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        ref={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
