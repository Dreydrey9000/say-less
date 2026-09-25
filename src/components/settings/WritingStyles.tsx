import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStudio, type WritingStyle } from "@/lib/studio";
import { CorrectionLearning } from "./CorrectionLearning";
import { WordCorrections } from "./WordCorrections";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

/** Writing styles, AI cleanup for every dictation, and spelling corrections. */
export function WritingStyles() {
  const { t } = useTranslation();
  const { settings, loaded, busy, error, load, save } = useStudio();
  const [app, setApp] = useState("");
  const [style, setStyle] = useState<WritingStyle>("formal");
  useEffect(() => {
    void load();
  }, [load]);
  const options = ["original", "formal", "casual", "lowercase"] as const;
  return (
    <section className="space-y-3">
      <h2 className="section-heading">{t("studio.styles")}</h2>
      <p className="setting-description">{t("studio.stylesDescription")}</p>
      {error && <p role="alert">{t("studio.error")}</p>}
      <label className="block text-sm">
        {t("studio.defaultStyle")}
        <select
          className="studio-select mt-1"
          aria-label={t("studio.defaultStyle")}
          value={settings.default_style}
          disabled={!loaded || busy}
          onChange={(e) =>
            void save({
              ...settings,
              default_style: e.target.value as WritingStyle,
            })
          }
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {t(`studio.stylesList.${o}`)}
            </option>
          ))}
        </select>
      </label>
      <form
        className="flex flex-wrap gap-2 items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save({
              ...settings,
              app_styles: [
                ...settings.app_styles.filter(
                  (r) => r.app.toLowerCase() !== app.trim().toLowerCase(),
                ),
                { app: app.trim(), style },
              ],
            })
          )
            setApp("");
        }}
      >
        <label className="text-sm grow">
          {t("studio.appName")}
          <Input
            aria-label={t("studio.appName")}
            value={app}
            onChange={(e) => setApp(e.target.value)}
            maxLength={100}
            className="block w-full mt-1"
            placeholder={t("studio.appExample")}
          />
        </label>
        <label className="text-sm">
          {t("studio.style")}
          <select
            className="studio-select mt-1"
            aria-label={t("studio.style")}
            value={style}
            onChange={(e) => setStyle(e.target.value as WritingStyle)}
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {t(`studio.stylesList.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={!loaded || busy || !app.trim()}>
          {t("studio.saveRule")}
        </Button>
      </form>
      <div className="studio-dock-setting">
        <div>
          <h3>{t("corrections.cleanupTitle")}</h3>
          <p className="text-sm text-text/70">
            {t("corrections.cleanupDescription")}
          </p>
        </div>
        <Button
          disabled={!loaded || busy}
          aria-pressed={settings.cleanup_on_dictation}
          onClick={() =>
            void save({
              ...settings,
              cleanup_on_dictation: !settings.cleanup_on_dictation,
            })
          }
        >
          {t(
            settings.cleanup_on_dictation
              ? "corrections.cleanupOff"
              : "corrections.cleanupOn",
          )}
        </Button>
      </div>
      <WordCorrections />
      <CorrectionLearning />
      <ul className="space-y-2">
        {settings.app_styles.map((r) => (
          <li
            key={r.app}
            className="flex justify-between gap-3 items-center border-b border-mid-gray/20 pb-2"
          >
            <span>
              {r.app} · {t(`studio.stylesList.${r.style}`)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void save({
                  ...settings,
                  app_styles: settings.app_styles.filter(
                    (x) => x.app !== r.app,
                  ),
                })
              }
              aria-label={t("studio.removeRule", { app: r.app })}
            >
              {t("snippets.remove")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
