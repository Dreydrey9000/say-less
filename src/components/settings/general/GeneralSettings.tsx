import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ChannelSelector } from "../ChannelSelector";
import { ShortcutInput } from "../ShortcutInput";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { PageHeader } from "../../ui/PageHeader";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { ShortcutActivationSetting } from "../ShortcutActivation";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { MuteWhileRecording } from "../MuteWhileRecording";
import { ModelSettingsCard } from "./ModelSettingsCard";

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, settings } = useSettings();
  const isLinux = type() === "linux";
  const isMac = type() === "macos";
  return (
    <div className="max-w-3xl w-full mx-auto space-y-8">
      <PageHeader
        eyebrow={t("dictation.local")}
        title={t("dictation.title")}
        description={t("dictation.description")}
      >
        <p className="text-[13px] text-text-muted">
          {t(
            settings?.post_process_enabled
              ? "dictation.optional"
              : "dictation.private",
          )}
        </p>
      </PageHeader>
      <SettingsGroup title={t("settings.general.title")}>
        <ShortcutInput
          shortcutId="transcribe"
          descriptionMode="inline"
          grouped={true}
        />
        {isMac && (
          <ShortcutInput
            shortcutId="transcribe_fn"
            descriptionMode="inline"
            grouped={true}
          />
        )}
        <ShortcutActivationSetting descriptionMode="inline" grouped={true} />
        {/* Cancel shortcut remains hidden on Linux because of dynamic shortcut instability. */}
        {!isLinux && (
          <ShortcutInput
            shortcutId="cancel"
            descriptionMode="inline"
            grouped={true}
          />
        )}
      </SettingsGroup>
      <ModelSettingsCard />
      <SettingsGroup title={t("settings.sound.title")}>
        <MicrophoneSelector descriptionMode="inline" grouped={true} />
        <ChannelSelector descriptionMode="inline" grouped={true} />
        <MuteWhileRecording descriptionMode="inline" grouped={true} />
        <AudioFeedback descriptionMode="inline" grouped={true} />
        <OutputDeviceSelector
          descriptionMode="inline"
          grouped={true}
          disabled={!audioFeedbackEnabled}
        />
        <VolumeSlider
          descriptionMode="inline"
          disabled={!audioFeedbackEnabled}
        />
      </SettingsGroup>
    </div>
  );
};
