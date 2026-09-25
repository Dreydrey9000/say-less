import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStudio } from "@/lib/studio";
import { CompanionSettings } from "./CompanionSettings";
import {
  AvatarBuilder,
  IndicatorAnimation,
  useAnimationPreview,
} from "./VoiceVisualSettings";
import { ThemeSelector } from "./ThemeSelector";
import { ShowOverlay } from "./ShowOverlay";
import { Button } from "../ui/Button";
import { WorkingStatus } from "../ui/WorkingStatus";
import { Input } from "../ui/Input";
import { PageHeader } from "../ui/PageHeader";
import { SettingContainer } from "../ui/SettingContainer";
import { ToggleSwitch } from "../ui/ToggleSwitch";

const palettes = [
  { name: "acid", color: "#b8ff65" },
  { name: "candy", color: "#ff70cf" },
  { name: "pool", color: "#66d9ff" },
  { name: "sunset", color: "#ff9666" },
  { name: "chrome", color: "#c7cdd5" },
];
const HEX = /^#[0-9a-f]{6}$/i;

/** A titled block of setting rows: 18px heading, 12px gap, one bordered box. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="studio-section">
      <div>
        <h2 className="section-heading">{title}</h2>
        {description && <p className="setting-description">{description}</p>}
      </div>
      <div className="studio-rows">{children}</div>
    </section>
  );
}

export function StudioSettings() {
  const { t } = useTranslation();
  const { settings, loaded, busy, error, load, save } = useStudio();
  const [color, setColor] = useState(settings.accent);
  const preview = useAnimationPreview();
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setColor(settings.accent), [settings.accent]);
  const showAvatar =
    settings.overlay_visual === "avatar" ||
    settings.dock_character === "avatar";
  return (
    <div className="max-w-3xl w-full mx-auto space-y-8 studio-page">
      <PageHeader
        eyebrow={t("studio.eyebrow")}
        title={t("studio.title")}
        description={t("studio.description")}
      />
      {error && (
        <p role="alert">
          {t("studio.error")}{" "}
          <Button variant="secondary" onClick={() => void load()}>
            {t("snippets.retry")}
          </Button>
        </p>
      )}
      {busy && <WorkingStatus label={t("studio.saving")} />}
      <fieldset disabled={!loaded || busy} className="space-y-8 min-w-0">
        <Section title={t("studio.colorSection")}>
          <SettingContainer
            title={t("studio.palette")}
            description=""
            layout="stacked"
            grouped
          >
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
          </SettingContainer>
          <SettingContainer
            title={t("studio.customColor")}
            description={t("studio.customColorHint")}
            descriptionMode="inline"
            grouped
          >
            <div className="flex gap-2 items-center">
              <Input
                value={color}
                maxLength={7}
                onChange={(e) => setColor(e.target.value)}
                aria-label={t("studio.customColor")}
                placeholder="#b8ff65"
                className="w-28 min-w-0"
              />
              <input
                type="color"
                aria-label={t("studio.pickColor")}
                value={HEX.test(color) ? color : settings.accent}
                onChange={(e) => setColor(e.target.value)}
                className="studio-color-input"
              />
              <Button
                disabled={!HEX.test(color)}
                onClick={() => void save({ ...settings, accent: color })}
              >
                {t("studio.apply")}
              </Button>
            </div>
          </SettingContainer>
          <ThemeSelector descriptionMode="inline" grouped />
        </Section>

        <Section
          title={t("studio.floating")}
          description={t("studio.floatingDescription")}
        >
          <CompanionSettings />
        </Section>

        <Section
          title={t("studio.indicatorSection")}
          description={t("studio.indicatorDescription")}
        >
          <ShowOverlay descriptionMode="inline" grouped />
          <IndicatorAnimation preview={preview} />
        </Section>

        {showAvatar && (
          <Section title={t("voiceVisuals.avatarTitle")}>
            <AvatarBuilder preview={preview} />
          </Section>
        )}

        <Section title={t("studio.motionSection")}>
          <ToggleSwitch
            label={t("studio.pauseLabel")}
            description={t("studio.pauseDescription")}
            descriptionMode="inline"
            grouped
            checked={!settings.dock_motion}
            onChange={(paused) =>
              void save({ ...settings, dock_motion: !paused })
            }
          />
        </Section>
      </fieldset>
    </div>
  );
}
