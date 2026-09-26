import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { syncLanguageFromSettings } from "@/i18n";
import "./CommandPreview.css";

type CommandError =
  | "nothing_heard"
  | "no_selection"
  | "no_provider"
  | "provider_failed";

/** What Rust sends when a rewrite is ready or a command could not run. */
interface VoiceCommandPreview {
  status: "ready" | "error";
  instruction: string;
  selection: string;
  result: string;
  error: CommandError | null;
}

/** The preview window for a voice command on selected text. It never takes
 * focus: Enter and Esc are global shortcuts while it is open, and the two
 * buttons are for the mouse. */
export default function CommandPreview() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<VoiceCommandPreview | null>(null);
  useEffect(() => {
    void syncLanguageFromSettings();
    const pending = listen<VoiceCommandPreview>(
      "voice-command-preview",
      (event) => setPreview(event.payload),
    );
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);
  if (!preview) return null;
  const error = preview.status === "error";
  return (
    <div className="cmd-stage">
      <section
        className="cmd-card"
        data-status={preview.status}
        aria-live="polite"
        data-testid="command-preview"
      >
        <header className="cmd-head">
          <span className="cmd-eyebrow">{t("voiceCommand.title")}</span>
          {!error && preview.instruction && (
            <span className="cmd-instruction">
              {t("voiceCommand.youSaid", { instruction: preview.instruction })}
            </span>
          )}
        </header>
        {error ? (
          <p className="cmd-error" role="alert">
            {t(`voiceCommand.errors.${preview.error ?? "provider_failed"}`)}
          </p>
        ) : (
          <>
            <p className="cmd-result">{preview.result}</p>
            <footer className="cmd-actions">
              <button
                type="button"
                className="cmd-apply"
                onClick={() => void commands.applyVoiceCommand()}
              >
                {t("voiceCommand.apply")} <kbd>{t("voiceCommand.enter")}</kbd>
              </button>
              <button
                type="button"
                className="cmd-keep"
                onClick={() => void commands.dismissVoiceCommand()}
              >
                {t("voiceCommand.keep")} <kbd>{t("voiceCommand.esc")}</kbd>
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
