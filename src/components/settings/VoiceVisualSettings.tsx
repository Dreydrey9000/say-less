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
import { SettingContainer } from "../ui/SettingContainer";

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

export type AnimationPreview = ReturnType<typeof useAnimationPreview>;

/**
 * One preview state for the indicator tiles and the avatar builder: a canned
 * speaking rhythm while "Preview animation" plays, the live mic level while
 * recording, and zero otherwise.
 */
export function useAnimationPreview() {
  const { state, level: liveLevel } = useVoiceActivity();
  const [testing, setTesting] = useState(false);
  const [testRun, setTestRun] = useState(0);
  const [testValue, setTestValue] = useState(0);

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
  const level = testing ? testValue : recording ? liveLevel : 0;
  return {
    testing,
    recording,
    level,
    talking: testing || recording,
    start: () => setTestRun((n) => n + 1),
  };
}

/** The Bars / Voice line / Avatar picker plus the preview button. */
export function IndicatorAnimation({ preview }: { preview: AnimationPreview }) {
  const { t } = useTranslation();
  const { settings, save } = useStudio();
  const moving = useMotionAllowed();
  const { level, testing, recording, talking } = preview;
  const levels = Array.from({ length: 9 }, (_, i) =>
    Math.max(0, level * (0.55 + 0.45 * Math.sin(i * 1.3 + 0.6))),
  );
  return (
    <SettingContainer
      title={t("voiceVisuals.overlay")}
      description={t("voiceVisuals.description")}
      descriptionMode="inline"
      layout="stacked"
      grouped
    >
      <div className="space-y-3">
        <div className="voice-visual-grid">
          {overlayVisuals.map((visual) => (
            <button
              type="button"
              key={visual}
              aria-pressed={settings.overlay_visual === visual}
              onClick={() => void save({ ...settings, overlay_visual: visual })}
            >
              <span className="voice-visual-sample" aria-hidden="true">
                {visual === "bars" ? (
                  <span className="voice-visual-bars">
                    {levels.slice(0, 7).map((v, i) => (
                      <i
                        key={i}
                        style={{
                          height: `${level > 0 ? Math.max(3, 3 + v * 15) : restingBars[i]}px`,
                        }}
                      />
                    ))}
                  </span>
                ) : visual === "squiggle" ? (
                  <VoiceSquiggle
                    levels={levels}
                    ready
                    moving={moving && (testing || recording)}
                    width={64}
                    height={22}
                  />
                ) : (
                  <span className="voice-visual-mini-avatar">
                    <Avatar
                      avatar={settings.avatar}
                      level={level}
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
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={testing}
            onClick={preview.start}
          >
            {t("voiceVisuals.test")}
          </Button>
          <p className="setting-description" aria-live="polite">
            {!moving
              ? t("voiceVisuals.stillHint")
              : testing
                ? t("voiceVisuals.testing")
                : recording
                  ? t("voiceVisuals.recordingHint")
                  : ""}
          </p>
        </div>
      </div>
    </SettingContainer>
  );
}

/** Avatar style, colors and accessory. Shown only when an avatar is in use. */
export function AvatarBuilder({ preview }: { preview: AnimationPreview }) {
  const { t } = useTranslation();
  const { settings, save } = useStudio();
  const moving = useMotionAllowed();
  const [draft, setDraft] = useState<AvatarSettings>(settings.avatar);
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

  // Controls wrapped in a <label> would otherwise include their own value in
  // their accessible name ("Accessory None"); point them at the label text.
  const labelId = useId();
  const avatarLabel = t("voiceVisuals.previewLabel", {
    style: t(`voiceVisuals.kinds.${draft.kind}`),
    accessory: t(`voiceVisuals.accessories.${draft.accessory}`),
  });

  return (
    <div className="avatar-builder">
      <div className="avatar-preview">
        <div className="avatar-preview-stage">
          <Avatar
            avatar={draft}
            level={preview.level}
            moving={moving}
            state={preview.talking ? "listening" : "idle"}
            rings={2}
            label={avatarLabel}
          />
        </div>
      </div>

      <div className="avatar-controls">
        <div role="group" aria-label={t("voiceVisuals.kind")}>
          <p className="setting-label mb-1" aria-hidden="true">
            {t("voiceVisuals.kind")}
          </p>
          <div className="avatar-kind-grid">
            {avatarKinds.map((kind) => (
              <button
                type="button"
                key={kind}
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
                aria-labelledby={`${labelId}-${field}`}
                onChange={(e) => update({ ...draft, [field]: e.target.value })}
              />
              <span id={`${labelId}-${field}`}>
                {t(`voiceVisuals.colors.${field}`)}
              </span>
            </label>
          ))}
        </div>
        <label className="block text-sm">
          <span id={`${labelId}-accessory`} className="setting-label">
            {t("voiceVisuals.accessory")}
          </span>
          <select
            className="studio-select mt-1"
            aria-labelledby={`${labelId}-accessory`}
            value={draft.accessory}
            onChange={(e) => update({ ...draft, accessory: e.target.value })}
          >
            {avatarAccessories.map((accessory) => (
              <option key={accessory} value={accessory}>
                {t(`voiceVisuals.accessories.${accessory}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="setting-description">{t("voiceVisuals.avatarNote")}</p>
      </div>
    </div>
  );
}
