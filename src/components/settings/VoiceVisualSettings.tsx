import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  avatarAccessories,
  avatarKinds,
  overlayVisuals,
  useStudio,
  type AvatarSettings,
} from "@/lib/studio";
import { useMotionAllowed } from "@/hooks/useMotionAllowed";
import { useVoiceActivity } from "@/hooks/useVoiceActivity";
import { Avatar } from "../companion/Avatar";
import { VoiceSquiggle } from "../companion/VoiceSquiggle";
import { Button } from "../ui/Button";

const TEST_MS = 3200;
const colorFields = ["body", "accent", "background"] as const;
/** Bar heights shown in the picker while nothing is talking. */
const restingBars = [6, 10, 15, 11, 13, 8, 5];

/** A made-up speaking rhythm (syllables and pauses) for the Test button. */
function testLevel(t: number) {
  const syllable = Math.max(0, Math.sin(t / 95)) * 0.75;
  const phrase = Math.sin(t / 700) > -0.55 ? 1 : 0;
  return Math.min(1, syllable * phrase + (phrase ? 0.08 : 0));
}

export function VoiceVisualSettings() {
  const { t } = useTranslation();
  const { settings, save, busy, loaded } = useStudio();
  const moving = useMotionAllowed();
  const { state, level: liveLevel } = useVoiceActivity();
  const [draft, setDraft] = useState<AvatarSettings>(settings.avatar);
  const [testing, setTesting] = useState(false);
  const [testRun, setTestRun] = useState(0);
  const [testValue, setTestValue] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<AvatarSettings>();

  // Follow saved changes from other windows unless an edit is pending.
  useEffect(() => {
    if (!saveTimer.current) setDraft(settings.avatar);
  }, [settings.avatar]);

  // Color pickers fire continuously while dragging; save once they settle.
  function update(next: AvatarSettings) {
    setDraft(next);
    pending.current = next;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = undefined;
      const current = useStudio.getState().settings;
      void save({ ...current, avatar: next }).then((ok) => {
        // A rejected save must not leave an unsaved look on screen.
        if (!ok) setDraft(useStudio.getState().settings.avatar);
      });
    }, 350);
  }
  // Leaving the page mid-edit saves right away instead of dropping the change.
  useEffect(
    () => () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      const { settings: current, save: flush } = useStudio.getState();
      if (pending.current) void flush({ ...current, avatar: pending.current });
    },
    [],
  );

  useEffect(() => {
    if (testRun === 0) return;
    setTesting(true);
    const started = performance.now();
    const timer = setInterval(() => {
      const elapsed = performance.now() - started;
      if (elapsed > TEST_MS) {
        clearInterval(timer);
        setTesting(false);
        setTestValue(0);
      } else setTestValue(testLevel(elapsed));
    }, 50);
    return () => clearInterval(timer);
  }, [testRun]);

  const recording = state === "recording";
  const previewLevel = testing ? testValue : recording ? liveLevel : 0;
  const talking = testing || recording;
  const previewLevels = Array.from({ length: 9 }, (_, i) =>
    Math.max(0, previewLevel * (0.55 + 0.45 * Math.sin(i * 1.3 + 0.6))),
  );
  const disabled = busy || !loaded;
  // Controls wrapped in a <label> would otherwise include their own value in
  // their accessible name ("Accessory None"); point them at the label text.
  const labelId = useId();
  const avatarLabel = t("voiceVisuals.previewLabel", {
    style: t(`voiceVisuals.kinds.${draft.kind}`),
    accessory: t(`voiceVisuals.accessories.${draft.accessory}`),
  });

  return (
    <section className="space-y-4" aria-labelledby="voice-visuals-title">
      <div>
        <h2 id="voice-visuals-title" className="text-lg font-semibold">
          {t("voiceVisuals.title")}
        </h2>
        <p className="text-sm text-text/70">{t("voiceVisuals.description")}</p>
      </div>

      <div role="group" aria-labelledby="voice-visuals-overlay">
        <h3 id="voice-visuals-overlay" className="text-sm font-medium mb-2">
          {t("voiceVisuals.overlay")}
        </h3>
        <div className="voice-visual-grid">
          {overlayVisuals.map((visual) => (
            <button
              type="button"
              key={visual}
              disabled={disabled}
              aria-pressed={settings.overlay_visual === visual}
              onClick={() => void save({ ...settings, overlay_visual: visual })}
            >
              <span className="voice-visual-sample" aria-hidden="true">
                {visual === "bars" ? (
                  <span className="voice-visual-bars">
                    {previewLevels.slice(0, 7).map((v, i) => (
                      <i
                        key={i}
                        style={{
                          height: `${previewLevel > 0 ? Math.max(3, 3 + v * 15) : restingBars[i]}px`,
                        }}
                      />
                    ))}
                  </span>
                ) : visual === "squiggle" ? (
                  <VoiceSquiggle
                    levels={previewLevels}
                    ready
                    moving={moving && (testing || recording)}
                    width={64}
                    height={22}
                  />
                ) : (
                  <span className="voice-visual-mini-avatar">
                    <Avatar
                      avatar={draft}
                      level={previewLevel}
                      moving={moving}
                      state={talking ? "listening" : "idle"}
                    />
                  </span>
                )}
              </span>
              <span>{t(`voiceVisuals.visuals.${visual}`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="avatar-builder">
        <div className="avatar-preview">
          <div className="avatar-preview-stage">
            <Avatar
              avatar={draft}
              level={previewLevel}
              moving={moving}
              state={talking ? "listening" : "idle"}
              rings={2}
              label={avatarLabel}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={testing}
            onClick={() => setTestRun((n) => n + 1)}
          >
            {t(testing ? "voiceVisuals.testing" : "voiceVisuals.test")}
          </Button>
          <p className="text-xs text-text/70" aria-live="polite">
            {moving
              ? recording
                ? t("voiceVisuals.recordingHint")
                : ""
              : t("voiceVisuals.stillHint")}
          </p>
        </div>

        <div className="avatar-controls">
          <h3 className="text-sm font-medium">
            {t("voiceVisuals.avatarTitle")}
          </h3>
          <div role="group" aria-label={t("voiceVisuals.kind")}>
            <p className="text-xs text-text/70 mb-1" aria-hidden="true">
              {t("voiceVisuals.kind")}
            </p>
            <div className="avatar-kind-grid">
              {avatarKinds.map((kind) => (
                <button
                  type="button"
                  key={kind}
                  disabled={disabled}
                  aria-pressed={draft.kind === kind}
                  onClick={() => update({ ...draft, kind })}
                >
                  <span className="avatar-kind-thumb" aria-hidden="true">
                    <Avatar avatar={{ ...draft, kind }} />
                  </span>
                  <span>{t(`voiceVisuals.kinds.${kind}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="avatar-color-row">
            {colorFields.map((field) => (
              <label key={field} className="avatar-color">
                <input
                  type="color"
                  value={draft[field]}
                  disabled={disabled}
                  aria-labelledby={`${labelId}-${field}`}
                  onChange={(e) =>
                    update({ ...draft, [field]: e.target.value })
                  }
                />
                <span id={`${labelId}-${field}`}>
                  {t(`voiceVisuals.colors.${field}`)}
                </span>
              </label>
            ))}
          </div>
          <label className="block text-sm">
            <span id={`${labelId}-accessory`}>
              {t("voiceVisuals.accessory")}
            </span>
            <select
              className="studio-select mt-1"
              aria-labelledby={`${labelId}-accessory`}
              value={draft.accessory}
              disabled={disabled}
              onChange={(e) => update({ ...draft, accessory: e.target.value })}
            >
              {avatarAccessories.map((accessory) => (
                <option key={accessory} value={accessory}>
                  {t(`voiceVisuals.accessories.${accessory}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-text/70">{t("voiceVisuals.avatarNote")}</p>
        </div>
      </div>
    </section>
  );
}
