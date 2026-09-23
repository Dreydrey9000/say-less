import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import { useTranslation } from "react-i18next";
import { useStudio } from "@/lib/studio";
import { Button } from "../ui/Button";
import { WorkingStatus } from "../ui/WorkingStatus";
type Row = {
  trigger: string;
  expansion: string;
  observations: number;
  active: boolean;
};
export function CorrectionLearning() {
  const { t } = useTranslation();
  const { settings, save, busy, loaded } = useStudio();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await invoke<Row[]>("list_learned_corrections"));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const unlisten = listen("learned-corrections-changed", () => void load());
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [load]);
  async function review(trigger: string, keep: boolean) {
    setPending(true);
    try {
      await invoke("review_learned_correction", { trigger, keep });
      await load();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("learning.title")}</h2>
      <p className="text-sm text-text/70">{t("learning.description")}</p>
      <Button
        variant="secondary"
        aria-pressed={settings.learn_corrections}
        disabled={busy || !loaded || platform() !== "macos"}
        onClick={() =>
          void save({
            ...settings,
            learn_corrections: !settings.learn_corrections,
          })
        }
      >
        {t(settings.learn_corrections ? "learning.disable" : "learning.enable")}
      </Button>
      <p className="text-xs text-text/70">{t("learning.limits")}</p>
      {error && (
        <p role="alert">
          {t("learning.error")}{" "}
          <Button onClick={() => void load()}>{t("snippets.retry")}</Button>
        </p>
      )}
      {(loading || pending) && (
        <WorkingStatus
          label={t(loading ? "learning.loading" : "learning.saving")}
        />
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-text/70">{t("learning.empty")}</p>
      )}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.trigger}
            className="flex flex-wrap gap-3 items-center border border-mid-gray/20 rounded-lg p-3"
          >
            <div className="flex-1 min-w-0 break-words">
              <strong>
                {row.trigger} → {row.expansion}
              </strong>
              <p className="text-xs text-text/70">
                {t(row.active ? "learning.active" : "learning.observed", {
                  count: row.observations,
                })}
              </p>
            </div>
            {!row.active && (
              <Button
                disabled={pending}
                onClick={() => void review(row.trigger, true)}
              >
                {t("learning.keep")}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={pending}
              aria-label={t("learning.removeName", { word: row.trigger })}
              onClick={() => void review(row.trigger, false)}
            >
              {t("learning.remove")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
