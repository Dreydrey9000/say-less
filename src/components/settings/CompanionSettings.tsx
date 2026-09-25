import { useTranslation } from "react-i18next";
import { Companion, formations } from "../companion/Companion";
import { useStudio } from "@/lib/studio";
import { Button } from "../ui/Button";

export function CompanionSettings() {
  const { t } = useTranslation();
  const { settings, save, busy, loaded } = useStudio();
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("companion.title")}</h2>
        <p className="text-sm text-text/70">{t("companion.description")}</p>
      </div>
      <div className="formation-grid">
        {formations.map((formation) => (
          <button
            type="button"
            key={formation}
            disabled={busy || !loaded}
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
            <Companion formation={formation} />
            <span>{t(`companion.formations.${formation}`)}</span>
          </button>
        ))}
      </div>
      <label className="block text-sm">
        {t("companion.character")}
        <select
          className="studio-select mt-1"
          value={settings.dock_character}
          disabled={busy || !loaded}
          onChange={(e) =>
            void save({ ...settings, dock_character: e.target.value })
          }
        >
          {["orb", "emblem", "buddy", "both", "avatar"].map((value) => (
            <option key={value} value={value}>
              {t(`companion.characters.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="secondary"
        disabled={busy || !loaded}
        onClick={() =>
          void save({ ...settings, dock_compact: !settings.dock_compact })
        }
      >
        {t(settings.dock_compact ? "dock.expand" : "dock.collapse")}
      </Button>
      <div className="flex gap-3 flex-wrap">
        <Button
          variant="secondary"
          disabled={busy || !loaded}
          aria-pressed={settings.dock_motion}
          onClick={() =>
            void save({ ...settings, dock_motion: !settings.dock_motion })
          }
        >
          {t(settings.dock_motion ? "companion.pause" : "companion.play")}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !loaded}
          aria-pressed={settings.dock_cycle}
          onClick={() =>
            void save({ ...settings, dock_cycle: !settings.dock_cycle })
          }
        >
          {t("companion.cycle")}
        </Button>
      </div>
      <p className="text-xs text-text/70">{t("companion.motionNote")}</p>
      <label className="block text-sm">
        {t("companion.edge")}
        <select
          className="studio-select mt-1"
          value={settings.dock_edge}
          disabled={busy || !loaded}
          onChange={(e) =>
            void save({ ...settings, dock_edge: e.target.value })
          }
        >
          {["free", "left", "right"].map((edge) => (
            <option key={edge} value={edge}>
              {t(`companion.edges.${edge}`)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
