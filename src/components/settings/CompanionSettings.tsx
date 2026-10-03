import { useTranslation } from "react-i18next";
import { Companion, formations } from "../companion/Companion";
import { useStudio } from "@/lib/studio";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { DockLookGallery } from "./DockLookGallery";

/** Looks that draw the silver particles, so the pattern choice matters. */
const withParticles = ["orb", "emblem", "both"];
const dockEdges = [
  "free",
  "left",
  "right",
  "top",
  "bottom",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
] as const;

/**
 * Floating dock rows. "Dock look" picks what sits in the middle; "Particle
 * pattern" picks how the particles move, and only shows when the look has
 * particles, so the two can never look like competing choices.
 */
export function CompanionSettings() {
  const { t } = useTranslation();
  const { settings, save } = useStudio();
  const hasParticles = withParticles.includes(settings.dock_character);
  // A face would cover the formation, so the cards preview on the chosen look.
  const previewCharacter = hasParticles ? settings.dock_character : "orb";
  return (
    <>
      <ToggleSwitch
        label={t("studio.showDockLabel")}
        description=""
        grouped
        checked={settings.floating}
        onChange={(floating) => void save({ ...settings, floating })}
      />
      <ToggleSwitch
        label={t("studio.compactLabel")}
        description={t("studio.compactDescription")}
        descriptionMode="inline"
        grouped
        checked={settings.dock_compact}
        onChange={(dock_compact) => void save({ ...settings, dock_compact })}
      />
      <SettingContainer title={t("companion.edge")} description="" grouped>
        <Dropdown
          options={dockEdges.map((edge) => ({
            value: edge,
            label: t(`companion.edges.${edge}`),
          }))}
          selectedValue={settings.dock_edge}
          onSelect={(dock_edge) => void save({ ...settings, dock_edge })}
        />
      </SettingContainer>
      <SettingContainer
        title={t("companion.character")}
        description={t("companion.characterDescription")}
        descriptionMode="inline"
        layout="stacked"
        grouped
      >
        <DockLookGallery />
      </SettingContainer>
      <SettingContainer
        title={t("companion.title")}
        description={
          hasParticles ? t("companion.description") : t("companion.noPattern")
        }
        descriptionMode="inline"
        layout="stacked"
        grouped
      >
        {hasParticles && (
          <div className="formation-grid">
            {formations.map((formation) => (
              <button
                type="button"
                key={formation}
                aria-pressed={
                  settings.dock_animation === formation && !settings.dock_cycle
                }
                onClick={() =>
                  void save({
                    ...settings,
                    dock_animation: formation,
                    dock_cycle: false,
                  })
                }
              >
                <Companion formation={formation} character={previewCharacter} />
                <span>{t(`companion.formations.${formation}`)}</span>
              </button>
            ))}
          </div>
        )}
      </SettingContainer>
      {hasParticles && (
        <ToggleSwitch
          label={t("companion.cycle")}
          description={t("companion.motionNote")}
          descriptionMode="inline"
          grouped
          checked={settings.dock_cycle}
          onChange={(dock_cycle) => void save({ ...settings, dock_cycle })}
        />
      )}
    </>
  );
}
