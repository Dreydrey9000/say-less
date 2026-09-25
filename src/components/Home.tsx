import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, ArrowUpRight, Pause, Play } from "lucide-react";
import type { HistoryEntry, PaginatedHistory } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useVoiceActivity } from "@/hooks/useVoiceActivity";
import { useStudio } from "@/lib/studio";
import { Companion } from "./companion/Companion";
import type { SidebarSection } from "./Sidebar";
import { Button } from "./ui/Button";
import { WorkingStatus } from "./ui/WorkingStatus";
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
  const shortcut = app?.bindings?.transcribe?.current_binding || "";
  return (
    <main className="say-home">
      <header className="home-kicker">
        <span>{t("home.eyebrow")}</span>
        <span>{t("home.local")}</span>
      </header>
      <section className="home-stage">
        <div className="home-intro">
          <h1>
            {t("home.headline")}
            <br />
            <em>{t("home.headlineAccent")}</em>
          </h1>
          <p>{t("home.description")}</p>
          <Button
            disabled={!loaded || busy}
            onClick={async () => {
              if (await save({ ...settings, floating: true }))
                setNotice(t("home.dockOpened"));
            }}
          >
            {t("home.openDock")} <ArrowUpRight size={18} />
          </Button>
          <div className="home-shortcut">
            <kbd>{shortcut}</kbd>
            <span>
              {t(
                app?.shortcut_activation === "push_to_talk"
                  ? "home.holdShortcut"
                  : app?.shortcut_activation === "toggle"
                    ? "home.toggleShortcut"
                    : "home.shortcut",
              )}
            </span>
          </div>
          {app?.bindings?.transcribe_fn?.current_binding && (
            <div className="home-shortcut">
              <kbd>{app.bindings.transcribe_fn.current_binding}</kbd>
              <span>{t("home.fnShortcut")}</span>
            </div>
          )}
          {app?.post_process_enabled && (
            <div className="home-shortcut">
              <kbd>
                {app.bindings?.transcribe_with_post_process?.current_binding}
              </kbd>
              <span>{t("home.aiShortcut")}</span>
            </div>
          )}
        </div>
        <div className="home-companion">
          <Companion
            level={activity.level}
            active={activity.state === "recording"}
          />
          <div className="home-companion-caption">
            <span>{t(`dock.${activity.state}`)}</span>
            <button
              type="button"
              disabled={!loaded || busy}
              aria-label={t(
                settings.dock_motion ? "companion.pause" : "companion.play",
              )}
              onClick={() =>
                void save({ ...settings, dock_motion: !settings.dock_motion })
              }
            >
              {settings.dock_motion ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </div>
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
            ["studio", "home.look"],
            ["writing", "home.words"],
            ["actions", "home.actions"],
          ] as const
        ).map(([section, label]) => (
          <button
            type="button"
            key={section}
            onClick={() => onNavigate?.(section)}
          >
            <span>{t(label)}</span>
            <ArrowUpRight size={18} />
          </button>
        ))}
      </section>
      <section className="home-history">
        <header>
          <h2>{t("home.recent")}</h2>
          <button type="button" onClick={() => onNavigate?.("history")}>
            {t("home.allHistory")}
          </button>
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
                <button
                  type="button"
                  aria-label={t("home.copy")}
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
