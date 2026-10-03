import { useTranslation } from "react-i18next";
import { useStudio } from "@/lib/studio";
import { Companion } from "../companion/Companion";
import "./dock-look-gallery.css";

const characters = ["orb", "emblem", "buddy", "both", "avatar"] as const;

/** One horizontal row of the actual dock looks, with native radio keyboard behavior. */
export function DockLookGallery() {
  const { t } = useTranslation();
  const { settings, save, busy, loaded } = useStudio();
  return (
    <div
      className="dock-look-gallery"
      role="radiogroup"
      aria-label={t("companion.character")}
      aria-busy={busy}
    >
      {characters.map((character) => (
        <label className="dock-look-card" key={character}>
          <input
            className="dock-look-radio"
            type="radio"
            name="dock-look"
            value={character}
            checked={settings.dock_character === character}
            disabled={busy || !loaded}
            onFocus={(event) =>
              event.currentTarget.parentElement?.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              })
            }
            onChange={async (event) => {
              const input = event.currentTarget;
              await save({ ...settings, dock_character: character });
              // The fieldset is disabled during persistence. Restore focus once
              // React has enabled it, unless the user moved to another control.
              requestAnimationFrame(() => {
                if (
                  input.isConnected &&
                  document.activeElement === document.body
                ) {
                  input.focus({ preventScroll: true });
                }
              });
            }}
          />
          <Companion
            character={character}
            formation={settings.dock_animation}
            paused
          />
          <span>{t(`companion.characters.${character}`)}</span>
        </label>
      ))}
    </div>
  );
}
