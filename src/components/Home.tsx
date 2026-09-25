import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { type } from "@tauri-apps/plugin-os";
import { Copy, ArrowRight, ArrowUpRight, Share2 } from "lucide-react";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import type { HistoryEntry, PaginatedHistory } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useVoiceActivity } from "@/hooks/useVoiceActivity";
import { useStudio } from "@/lib/studio";
import { Companion } from "./companion/Companion";
import type { SidebarSection } from "./Sidebar";
import { Button } from "./ui/Button";
import { WorkingStatus } from "./ui/WorkingStatus";
import { Tooltip } from "./ui/Tooltip";
import "./home.css";

export function Home({
  onNavigate,
}: {
  onNavigate?: (section: SidebarSection) => void;
}) {
  const { t } = useTranslation();
  const { settings: app } = useSettings();
  const { settings, save, load, loaded, busy, error } = useStudio();
  const activity = useVoiceActivity();
  const isMac = type() === "macos";
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const result = await invoke<PaginatedHistory>("get_history_entries", {
          cursor: null,
          limit: 3,
        });
        if (!disposed) {
          setEntries(result.entries);
          setHistoryError(false);
        }
      } catch {
        if (!disposed) setHistoryError(true);
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void refresh();
    const pending = listen("history-update-payload", () => void refresh());
    return () => {
      disposed = true;
      void pending.then((unlisten) => unlisten());
    };
  }, [revision]);
  const binding = (id: string) =>
    formatKeyCombination(app?.bindings?.[id]?.current_binding ?? "", "unknown");
  const shortcut = binding("transcribe");
  const fnKey = isMac ? binding("transcribe_fn") : "";
  const aiKey = app?.post_process_enabled
    ? binding("transcribe_with_post_process")
    : "";
  const cancelKey = binding("cancel");
  const modeCopy =
    app?.shortcut_activation === "push_to_talk"
      ? "home.holdShortcut"
      : app?.shortcut_activation === "toggle"
        ? "home.toggleShortcut"
        : "home.shortcut";
  const share = async () => {
    try {
      await writeText("https://saylessvoice.com");
      setNotice(t("home.shareCopied"));
    } catch {
      setNotice(t("home.shareFailed"));
    }
  };
  return (
    <main className="say-home">
      <p className="page-eyebrow">{t("home.local")}</p>
      <section className="home-stage">
        <div className="home-intro">
          <h1>{t("home.headline")}</h1>
          <p>{t("home.description")}</p>
          {/* Only the instruction for the saved mode. Never an empty <kbd>. */}
          <div className="home-shortcut" data-testid="home-instruction">
            {shortcut && <kbd>{shortcut}</kbd>}
            <span>{t(modeCopy)}</span>
          </div>
          {fnKey && (
            <div className="home-shortcut home-shortcut-fn">
              <kbd>{fnKey}</kbd>
              <span>{t("home.fnShortcut")}</span>
            </div>
          )}
          <details className="home-more">
            <summary>{t("home.otherShortcuts")}</summary>
            <ul>
              {fnKey && <li className="home-tip">{t("home.fnTip")}</li>}
              <li>
                {aiKey ? (
                  <>
                    <kbd>{aiKey}</kbd>
                    <span>{t("home.aiShortcut")}</span>
                  </>
                ) : (
                  <button
                    type="button"
                    className="home-link"
                    onClick={() => onNavigate?.("postprocessing")}
                  >
                    {t("home.setAiShortcut")}
                  </button>
                )}
              </li>
              {cancelKey && (
                <li>
                  <kbd>{cancelKey}</kbd>
                  <span>{t("home.cancelShortcut")}</span>
                </li>
              )}
            </ul>
          </details>
          <div className="home-actions">
            {!settings.floating && (
              <Button
                variant="secondary"
                disabled={!loaded || busy}
                onClick={async () => {
                  if (await save({ ...settings, floating: true }))
                    setNotice(t("home.dockOpened"));
                }}
              >
                {t("home.openDock")} <ArrowUpRight size={16} />
              </Button>
            )}
            <button
              type="button"
              className="home-link"
              onClick={() => void share()}
            >
              <Share2 size={14} aria-hidden="true" /> {t("home.share")}
            </button>
          </div>
        </div>
        <div className="home-companion">
          <Companion
            level={activity.level}
            active={activity.state === "recording"}
          />
          <p className="home-companion-caption">
            <span className="home-slogan">{t("home.slogan")}</span>
            <span>
              {t(`home.status.${activity.state}`, {
                defaultValue: t("home.status.idle"),
              })}
            </span>
          </p>
        </div>
      </section>
      {(error || notice) && (
        <p role={error ? "alert" : "status"}>
          {error ? t("studio.error") : notice}
        </p>
      )}
      <section className="home-tools" aria-label={t("home.tools")}>
        {(
          [
            ["studio", "home.look", "home.lookHint"],
            ["writing", "home.words", "home.wordsHint"],
            ["actions", "home.actions", "home.actionsHint"],
          ] as const
        ).map(([section, label, hint]) => (
          <button
            type="button"
            key={section}
            aria-labelledby={`home-tool-${section}`}
            aria-describedby={`home-tool-${section}-hint`}
            onClick={() => onNavigate?.(section)}
          >
            <span className="home-tool-text">
              <span id={`home-tool-${section}`} className="home-tool-title">
                {t(label)}
              </span>
              <span id={`home-tool-${section}-hint`} className="home-tool-hint">
                {t(hint)}
              </span>
            </span>
            {/* A plain arrow: these open a page in the app, not a website. */}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ))}
      </section>
      <section className="home-history">
        <header>
          <h2>{t("home.recent")}</h2>
          {/* Nothing to show yet, so no link to an empty page. */}
          {entries.length > 0 && (
            <button type="button" onClick={() => onNavigate?.("history")}>
              {t("home.allHistory")}
            </button>
          )}
        </header>
        {loading ? (
          <WorkingStatus label={t("home.loading")} />
        ) : historyError ? (
          <p role="alert">
            {t("home.historyError")}{" "}
            <Button
              onClick={() => {
                setLoading(true);
                setRevision((v) => v + 1);
              }}
            >
              {t("snippets.retry")}
            </Button>
          </p>
        ) : entries.length === 0 ? (
          <p className="home-empty">{t("home.empty")}</p>
        ) : (
          <ul>
            {entries.map((entry) => (
              <li key={entry.id}>
                <p>{entry.post_processed_text || entry.transcription_text}</p>
                <Tooltip label={t("home.copy")} placement="top" align="end">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await writeText(
                          entry.post_processed_text || entry.transcription_text,
                        );
                        setNotice(t("home.copied"));
                      } catch {
                        setNotice(t("home.copyError"));
                      }
                    }}
                  >
                    <Copy size={18} />
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
