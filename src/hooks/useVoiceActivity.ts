import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { StreamTextEvent } from "@/bindings";

export function useVoiceActivity() {
  const [state, setState] = useState("idle");
  const [level, setLevel] = useState(0);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  useEffect(() => {
    let disposed = false;
    let received = false;
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
        setLevel(Math.min(1, Math.max(0, ...finite)));
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
      removers.forEach((fn) => fn());
    };
  }, []);
  return { state, level, ready, text };
}
