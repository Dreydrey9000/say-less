import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { useTranslation } from "react-i18next";
import "./creative-studio.css";
import { StudioConnections } from "./StudioConnections";

export function CreativeStudio() {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const supported = platform() === "macos";
  useEffect(() => {
    if (!supported) return;
    let active = true;
    setError(undefined);
    setUrl(undefined);
    invoke<{ url: string }>("creative_studio_session")
      .then((session) => {
        if (active) setUrl(session.url);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason === "studio_missing"
              ? "creative.missing"
              : "creative.failed",
          );
      });
    return () => {
      active = false;
    };
  }, [attempt, supported]);

  useEffect(() => {
    if (!url) return;
    const origin = new URL(url).origin;
    const receive = async (event: MessageEvent) => {
      if (
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.type !== "studio-native" || typeof data.id !== "string")
        return;
      const action = data.action;
      if (action !== "copy" && action !== "capture" && action !== "reveal")
        return;
      const value =
        action === "copy"
          ? data.text
          : action === "capture"
            ? data.mode
            : data.path;
      if (typeof value !== "string") return;
      let result: { ok: boolean; path?: string; error?: string };
      try {
        const path = await invoke<string>("creative_studio_native", {
          action,
          value,
        });
        result = { ok: true, ...(action === "capture" ? { path } : {}) };
      } catch {
        result = {
          ok: false,
          error: t(
            action === "capture"
              ? "creative.captureFailed"
              : "creative.actionFailed",
          ),
        };
      }
      event.source?.postMessage(
        { type: "studio-reply", id: data.id, result },
        { targetOrigin: origin },
      );
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [url, t]);

  return (
    <section className="creative-studio" aria-labelledby="creative-title">
      <header>
        <h1 id="creative-title">{t("creative.title")}</h1>
        <p>{t("creative.description")}</p>
      </header>
      {url && <StudioConnections />}
      {!supported ? (
        <p role="status">{t("creative.platform")}</p>
      ) : error ? (
        <div role="alert" className="creative-message">
          <p>{t(error)}</p>
          <button
            type="button"
            className="brand-action rounded-lg px-4 py-2"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t("creative.retry")}
          </button>
        </div>
      ) : url ? (
        <iframe
          ref={frame}
          src={url}
          title={t("creative.frame")}
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
          allow="clipboard-write"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="creative-message" role="status" aria-busy="true">
          <span className="creative-orb" aria-hidden="true" />
          <p>{t("creative.starting")}</p>
        </div>
      )}
    </section>
  );
}
