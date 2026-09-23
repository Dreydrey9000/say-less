import { CorrectionLearning } from "./CorrectionLearning";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStudio, type WritingStyle } from "@/lib/studio";
import { CompanionSettings } from "./CompanionSettings";
import { WordCorrections } from "./WordCorrections";
import { ThemeSelector } from "./ThemeSelector";
import { Button } from "../ui/Button";
import { WorkingStatus } from "../ui/WorkingStatus";
import { Input } from "../ui/Input";
const palettes = [
  { name: "acid", color: "#b8ff65" },
  { name: "candy", color: "#ff70cf" },
  { name: "pool", color: "#66d9ff" },
  { name: "sunset", color: "#ff9666" },
  { name: "chrome", color: "#c7cdd5" },
];
export function StudioSettings() {
  const { t } = useTranslation();
  const { settings, loaded, busy, error, load, save } = useStudio();
  const [color, setColor] = useState(settings.accent);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setColor(settings.accent), [settings.accent]);
  return (
    <div className="max-w-3xl mx-auto space-y-6 studio-page">
      <header>
        <p className="studio-eyebrow">{t("studio.eyebrow")}</p>
        <h1 className="text-3xl font-semibold">{t("studio.title")}</h1>
        <p className="text-sm text-text/70 mt-2">{t("studio.description")}</p>
      </header>
      <div className="studio-preview" aria-label={t("studio.preview")}>
        <img src="/brand/say-less-emblem.png" alt="" />
        <div>
          <strong>{t("studio.previewTitle")}</strong>
          <p>{t("studio.previewBody")}</p>
        </div>
        <span className="studio-wave" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      {error && (
        <p role="alert">
          {t("studio.error")}{" "}
          <Button variant="secondary" onClick={() => void load()}>
            {t("snippets.retry")}
          </Button>
        </p>
      )}
      {busy && <WorkingStatus label={t("studio.saving")} />}
      <fieldset disabled={!loaded || busy} className="space-y-6">
        <div>
          <h2 className="font-semibold mb-3">{t("studio.palette")}</h2>
          <div className="palette-grid">
            {palettes.map((p) => (
              <button
                type="button"
                className="palette-choice"
                key={p.name}
                aria-pressed={settings.accent.toLowerCase() === p.color}
                onClick={() => void save({ ...settings, accent: p.color })}
              >
                <span style={{ background: p.color }} />
                <span>{t(`studio.palettes.${p.name}`)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm space-y-1">
            <span className="block">{t("studio.customColor")}</span>
            <Input
              value={color}
              maxLength={7}
              onChange={(e) => setColor(e.target.value)}
              aria-label={t("studio.customColor")}
              placeholder="#b8ff65"
            />
          </label>
          <input
            type="color"
            aria-label={t("studio.pickColor")}
            value={/^#[0-9a-f]{6}$/i.test(color) ? color : settings.accent}
            onChange={(e) => setColor(e.target.value)}
            className="w-12 h-11 cursor-pointer"
          />
          <Button
            disabled={!/^#[0-9a-f]{6}$/i.test(color)}
            onClick={() => void save({ ...settings, accent: color })}
          >
            {t("studio.apply")}
          </Button>
        </div>
        <ThemeSelector descriptionMode="inline" />
        <CompanionSettings />
        <div className="studio-dock-setting">
          <div>
            <h2 className="font-semibold">{t("studio.floating")}</h2>
            <p className="text-sm text-text/70 mt-1">
              {t("studio.floatingDescription")}
            </p>
          </div>
          <Button
            variant={settings.floating ? "secondary" : "primary"}
            aria-pressed={settings.floating}
            onClick={() =>
              void save({ ...settings, floating: !settings.floating })
            }
          >
            {t(settings.floating ? "studio.hideDock" : "studio.showDock")}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
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
      <h2 className="text-lg font-semibold">{t("studio.styles")}</h2>
      <p className="text-sm text-text/70">{t("studio.stylesDescription")}</p>
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
