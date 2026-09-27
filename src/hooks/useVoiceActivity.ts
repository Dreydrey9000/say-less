import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { StreamTextEvent } from "@/bindings";

export function useVoiceActivity() {
  const [state, setState] = useState("idle");
  const [level, setLevel] = useState(0);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  // True while a screen recording is sending mic levels, so the orb and dock
  // move with your voice even when you are not dictating.
  const [screenListening, setScreenListening] = useState(false);
  useEffect(() => {
    let disposed = false;
    let received = false;
    let screenTimer: ReturnType<typeof setTimeout> | undefined;
    const removers: Array<() => void> = [];
    void Promise.all([
      listen<string>("dock-state", ({ payload }) => {
        received = true;
        setState(payload);
        setLevel(0);
        if (payload === "recording") {
          setReady(false);
          setText("");
        }
      }),
      listen("recording-ready", () => setReady(true)),
      listen<number[]>("mic-level", ({ payload }) => {
        setReady(true);
        const finite = payload.filter(Number.isFinite);
        const target = Math.min(1, Math.max(0, ...finite));
        // Levels arrive about 15 times a second here; ease toward each one so
        // the orb and avatar move smoothly instead of jumping.
        setLevel((prev) => prev * 0.4 + target * 0.6);
      }),
      listen<number>("screen-mic-level", ({ payload }) => {
        const target = Number.isFinite(payload)
          ? Math.min(1, Math.max(0, payload))
          : 0;
        setScreenListening(true);
        setLevel((prev) => prev * 0.4 + target * 0.6);
        // ponytail: levels come every ~66ms; if they stop for 400ms the
        // recording ended (or stalled), so settle the visuals back down.
        clearTimeout(screenTimer);
        screenTimer = setTimeout(() => {
          setScreenListening(false);
          setLevel(0);
        }, 400);
      }),
      listen<StreamTextEvent>("stream-text-event", ({ payload }) =>
        setText(`${payload.committed} ${payload.tentative}`.trim()),
      ),
    ]).then(async (listeners) => {
      if (disposed) {
        listeners.forEach((fn) => fn());
        return;
      }
      removers.push(...listeners);
      try {
        const current = await invoke<string>("get_dock_state");
        if (!disposed && !received) setState(current || "idle");
      } catch {
        /* Live events remain authoritative. */
      }
    });
    return () => {
      disposed = true;
      clearTimeout(screenTimer);
      removers.forEach((fn) => fn());
    };
  }, []);
  const listening = state === "recording" || screenListening;
  return { state, level, ready, text, listening };
}
