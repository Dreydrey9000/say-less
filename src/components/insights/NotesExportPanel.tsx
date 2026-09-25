import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { commands, type ExportReport, type InsightsSettings } from "@/bindings";
import { formatDateTime } from "@/utils/dateFormat";
import { Button } from "../ui/Button";
import { WorkingStatus } from "../ui/WorkingStatus";

export function NotesExportPanel() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<InsightsSettings | null>(null);
  const [defaultFolder, setDefaultFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ExportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: a second click before React re-renders is still blocked.
  const exporting = useRef(false);

  useEffect(() => {
    void Promise.all([
      commands.getInsightsSettings(),
      commands.getDefaultNotesFolder(),
    ])
      .then(([s, folder]) => {
        setSettings(s);
        setDefaultFolder(folder);
      })
      .catch(() => setError(t("insights.notes.loadError")));
  }, [t]);

  const save = async (exportEnabled: boolean, folder: string | null) => {
    const result = await commands.saveInsightsSettings(exportEnabled, folder);
    if (result.status === "ok") {
      setSettings(result.data);
      setError(null);
    } else setError(t("insights.notes.saveError"));
  };

  const chooseFolder = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: t("insights.notes.chooseTitle"),
      defaultPath: settings?.export_folder ?? defaultFolder,
    });
    if (typeof picked === "string" && settings)
      await save(settings.export_enabled, picked);
  };

  const exportNow = async () => {
    if (exporting.current) return;
    exporting.current = true;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const result = await commands.exportNotesNow();
      if (result.status === "ok") setReport(result.data);
      else {
        // Keep the technical reason in the log, show a plain message.
        console.error("Notes export failed:", result.error);
        setError(t("ux.notes.exportFailed"));
      }
    } catch (reason) {
      console.error("Notes export failed:", reason);
      setError(t("ux.notes.exportFailed"));
    } finally {
      exporting.current = false;
      setBusy(false);
    }
    const fresh = await commands.getInsightsSettings().catch(() => null);
    if (fresh) setSettings(fresh);
  };

  const folder = settings?.export_folder ?? defaultFolder;
  return (
    <section className="insight-panel" aria-labelledby="insight-notes-title">
      <h2 id="insight-notes-title" className="insight-panel-title">
        {t("insights.notes.title")}
      </h2>
      <p className="insight-fineprint">{t("insights.notes.description")}</p>
      <label className="insight-check">
        <input
          type="checkbox"
          role="switch"
          checked={settings?.export_enabled ?? false}
          disabled={!settings}
          onChange={(e) =>
            void save(e.target.checked, settings?.export_folder ?? null)
          }
        />
        <span>{t("insights.notes.nightly")}</span>
      </label>
      <p className="insight-folder">
        <span>{t("insights.notes.folder")}</span>{" "}
        <code title={folder}>{folder}</code>
      </p>
      <div className="insight-actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={!settings}
          onClick={() => void chooseFolder()}
        >
          {t("insights.notes.choose")}
        </Button>
        {settings?.export_folder && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void save(settings.export_enabled, null)}
          >
            {t("insights.notes.useDefault")}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          aria-busy={busy}
          disabled={!settings || busy}
          onClick={() => void exportNow()}
        >
          {t("insights.notes.exportNow")}
        </Button>
      </div>
      {busy && <WorkingStatus label={t("insights.notes.exporting")} />}
      {report && (
        <p role="status" className="insight-fineprint">
          {t("insights.notes.done", {
            written: report.written,
            unchanged: report.unchanged,
          })}
          {report.skipped.length > 0 &&
            " " + t("insights.notes.skipped", { count: report.skipped.length })}
        </p>
      )}
      {(error || settings?.last_export_error) && (
        <p role="alert" className="insight-error">
          {error ?? t("ux.notes.exportFailed")}
        </p>
      )}
      {settings?.last_export_at && (
        <p className="insight-fineprint">
          {t("insights.notes.last", {
            when: formatDateTime(
              String(settings.last_export_at),
              i18n.language,
            ),
          })}
        </p>
      )}
    </section>
  );
}
