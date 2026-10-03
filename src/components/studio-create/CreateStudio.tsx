import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, TriangleAlert } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { commands, type StudioHelperStatus } from "@/bindings";
import { Button } from "../ui/Button";

type Phase = "checking" | "off" | "starting" | "ready";

/** Set once Create has been turned on, so later visits start it by themselves. */
const ENABLED_KEY = "sayless.createEnabled";
/** How often to confirm the helper is still there while Create is open. */
const WATCH_MS = 5000;

const readEnabled = () => {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
};

/** The messages the page inside Create may send us. Anything else is ignored. */
interface PageRequest {
  __sayless: 1;
  id: string;
  action: string;
  mode?: unknown;
  dir?: unknown;
  text?: unknown;
  path?: unknown;
}

const isPageRequest = (data: unknown): data is PageRequest => {
  const d = data as Partial<PageRequest> | null;
  return (
    !!d &&
    d.__sayless === 1 &&
    typeof d.id === "string" &&
    typeof d.action === "string"
  );
};

/** Error codes from the backend that have their own message. */
const KNOWN_ERRORS = [
  "python_missing",
  "helper_missing",
  "install_timeout",
  "helper_did_not_answer",
  "unsupported_platform",
];

/**
 * Create: pictures, titles, videos and the library, in one page of the app.
 *
 * The tools are a small web page served by a helper on this Mac (127.0.0.1).
 * This component finds the helper, starts it with one click, shows its page,
 * and does the three things a web page cannot: take a screen capture, copy to
 * the clipboard, and show a file in Finder.
 */
export function CreateStudio({ view = "image" }: { view?: string }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("checking");
  const [status, setStatus] = useState<StudioHelperStatus | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const starting = useRef(false);

  const origin = status ? `http://127.0.0.1:${status.port}` : "";

  const start = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    setErrorCode(null);
    setPhase("starting");
    try {
      const result = await commands.studioHelperStart();
      if (result.status === "ok") {
        try {
          localStorage.setItem(ENABLED_KEY, "1");
        } catch {
          /* remembering is a convenience only */
        }
        setStatus(result.data);
        setPhase("ready");
      } else {
        setErrorCode(result.error);
        setPhase("off");
      }
    } finally {
      starting.current = false;
    }
  }, []);

  // Room for the page, then find out whether the helper is already running.
  useEffect(() => {
    void commands.studioFitWindow();
    let cancelled = false;
    void (async () => {
      const result = await commands.studioHelperStatus();
      if (cancelled) return;
      if (result.status === "ok" && result.data.running) {
        setStatus(result.data);
        setPhase("ready");
      } else {
        if (result.status === "ok") setStatus(result.data);
        setPhase("off");
        if (readEnabled()) void start();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start]);

  // While the page is open, notice if the helper goes away.
  useEffect(() => {
    if (phase !== "ready") return;
    const timer = window.setInterval(async () => {
      const result = await commands.studioHelperStatus();
      if (result.status === "ok" && !result.data.running) {
        setPhase("off");
        if (readEnabled()) void start();
      }
    }, WATCH_MS);
    return () => window.clearInterval(timer);
  }, [phase, start]);

  // The page asks us to capture the screen, copy, or reveal a file.
  useEffect(() => {
    if (phase !== "ready" || !origin) return;
    const onMessage = async (event: MessageEvent) => {
      const target = frame.current?.contentWindow;
      if (!target || event.source !== target || event.origin !== origin) return;
      if (!isPageRequest(event.data)) return;
      const { id, action } = event.data;
      const reply = (res: Record<string, unknown>) =>
        target.postMessage({ __sayless: 1, reply: true, id, res }, origin);
      try {
        if (action === "capture") {
          const dir = typeof event.data.dir === "string" ? event.data.dir : "";
          const result = await commands.studioCapture(
            event.data.mode === "region",
            dir,
          );
          if (result.status === "ok") reply({ ok: true, path: result.data });
          else if (result.error === "cancelled")
            reply({ ok: false, error: "cancelled" });
          else reply({ ok: false, error: t("create.captureFailed") });
        } else if (action === "copy" && typeof event.data.text === "string") {
          await writeText(event.data.text);
          reply({ ok: true });
        } else if (action === "reveal" && typeof event.data.path === "string") {
          await revealItemInDir(event.data.path);
          reply({ ok: true });
        } else {
          reply({ ok: false, error: "unsupported" });
        }
      } catch {
        reply({ ok: false, error: t("create.actionFailed") });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [phase, origin, t]);

  if (phase === "ready" && status) {
    return (
      <iframe
        ref={frame}
        title={t("create.frameTitle")}
        src={`${origin}/app?embed=1#/${view}`}
        allow="clipboard-write"
        className="block h-full w-full border-0"
      />
    );
  }

  const busy = phase === "checking" || phase === "starting";
  const canStart = status?.can_start ?? true;
  const known = errorCode && KNOWN_ERRORS.includes(errorCode);
  const message = !canStart
    ? t("create.error.unsupported_platform")
    : errorCode
      ? known
        ? t(`create.error.${errorCode}`)
        : t("create.error.generic")
      : null;

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <Sparkles className="h-8 w-8 text-logo-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{t("create.setup.title")}</h2>
        <p className="text-sm opacity-80">{t("create.setup.body")}</p>
        {message && (
          <div
            role="alert"
            className="flex w-full items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-start text-sm"
          >
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <p>{message}</p>
          </div>
        )}
        <Button
          variant="accent"
          size="lg"
          disabled={busy || !canStart}
          onClick={() => void start()}
        >
          {busy
            ? t("create.setup.starting")
            : errorCode
              ? t("create.setup.retry")
              : t("create.setup.start")}
        </Button>
      </div>
    </div>
  );
}
