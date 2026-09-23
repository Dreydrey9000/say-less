import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "../ui/Button";
import { WorkingStatus } from "../ui/WorkingStatus";
interface Preview {
  words: string[];
  snippets: { trigger: string; expansion: string }[];
  skipped: number;
  history_count: number;
  fingerprint: string;
}
interface Report {
  words_added: number;
  snippets_added: number;
  history_added: number;
  history_error: boolean;
}
interface HistoryRow {
  id: string;
  text: string;
  timestamp: string;
}
export function WisprImport() {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState(false);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [archiveOpen, setArchiveOpen] = useState(false);
  async function scan(value: string | null) {
    setBusy(true);
    setError("");
    setReport(null);
    setPreview(null);
    setContent(value);
    try {
      setPreview(
        await invoke<Preview>("preview_wispr_import", { content: value }),
      );
    } catch {
      setError(t("import.readFailed"));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setError("");
    try {
      setReport(
        await invoke<Report>("apply_wispr_import", {
          content,
          includeHistory: history && content === null,
          expectedFingerprint: preview?.fingerprint,
        }),
      );
      setPreview(null);
      await useSettingsStore.getState().refreshSettings();
    } catch {
      setError(t("import.saveFailed"));
    } finally {
      setBusy(false);
    }
  }
  async function archive(next: number) {
    setBusy(true);
    setError("");
    try {
      setRows(
        await invoke<HistoryRow[]>("list_imported_history", { offset: next }),
      );
      setOffset(next);
      setArchiveOpen(true);
    } catch {
      setError(t("import.archiveFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <p className="studio-eyebrow">{t("import.eyebrow")}</p>
        <h1 className="text-2xl font-semibold">{t("import.title")}</h1>
        <p className="text-sm text-text/70 mt-2">{t("import.description")}</p>
      </header>
      <p className="rounded-xl border border-mid-gray/20 p-4 text-sm">
        {t("import.privacy")}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => void scan(null)}>
          {t("import.scan")}
        </Button>
        <label className="block text-sm w-full">
          {t("import.file")}
          <input
            className="block mt-2 max-w-full"
            type="file"
            accept=".json,.csv"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 3 * 1024 * 1024) {
                setError(t("import.tooLarge"));
                return;
              }
              try {
                await scan(await file.text());
              } catch {
                setError(t("import.readFailed"));
              } finally {
                e.target.value = "";
              }
            }}
          />
        </label>
      </div>
      {busy && <WorkingStatus label={t("import.working")} />}{" "}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t("import.preview")}</h2>
          <p>
            {t("import.counts", {
              words: preview.words.length,
              snippets: preview.snippets.length,
              skipped: preview.skipped,
            })}
          </p>
          <p className="text-sm text-text/70">{t("import.corrections")}</p>
          <details>
            <summary className="cursor-pointer">{t("import.review")}</summary>
            <ul className="max-h-60 overflow-y-auto space-y-2 p-2">
              {preview.words.map((w, i) => (
                <li key={`w${i}`}>{w}</li>
              ))}
              {preview.snippets.map((s, i) => (
                <li key={`s${i}`}>
                  <strong>{s.trigger}</strong>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {s.expansion}
                  </p>
                </li>
              ))}
            </ul>
          </details>
          {content === null && (
            <label className="flex gap-3 items-start">
              <input
                type="checkbox"
                checked={history}
                onChange={(e) => setHistory(e.target.checked)}
                disabled={busy}
              />
              <span>
                {t("import.history", { count: preview.history_count })}
                <small className="block text-text/70">
                  {t("import.historyDetails")}
                </small>
              </span>
            </label>
          )}
          <Button
            disabled={
              busy ||
              (preview.words.length + preview.snippets.length === 0 && !history)
            }
            onClick={() => void apply()}
          >
            {t("import.confirm")}
          </Button>
        </section>
      )}
      {report && (
        <div role="status" className="space-y-2">
          <p>
            {t("import.complete", {
              words: report.words_added,
              snippets: report.snippets_added,
              history: report.history_added,
            })}
          </p>
          {report.history_error && <p>{t("import.partialHistory")}</p>}
        </div>
      )}
      <section className="border-t border-mid-gray/20 pt-4 space-y-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void archive(0)}
        >
          {t("import.openArchive")}
        </Button>
        {archiveOpen && (
          <>
            <h2 className="font-semibold">{t("import.archive")}</h2>
            {rows.length === 0 && <p>{t("import.archiveEmpty")}</p>}
            <ul className="space-y-4">
              {rows.map((r) => (
                <li key={r.id} className="border-b border-mid-gray/20 pb-4">
                  <time className="text-xs text-text/70">{r.timestamp}</time>
                  <p className="whitespace-pre-wrap break-words select-text">
                    {r.text}
                  </p>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                disabled={busy || offset === 0}
                onClick={() => void archive(Math.max(0, offset - 50))}
              >
                {t("import.previous")}
              </Button>
              <Button
                variant="secondary"
                disabled={busy || rows.length < 50}
                onClick={() => void archive(offset + 50)}
              >
                {t("import.next")}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
