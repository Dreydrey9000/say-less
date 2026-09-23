import { useTranslation } from "react-i18next";
import { SettingsGroup } from "../ui/SettingsGroup";
import { CustomWords } from "./CustomWords";
import { FillerWordRemoval } from "./FillerWordRemoval";
import { VoiceSnippets } from "./VoiceSnippets";

export function WritingSettings() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("writing.title")}
        </h1>
        <p className="text-sm text-text/70 mt-2">{t("writing.description")}</p>
      </header>
      <SettingsGroup title={t("writing.dictionary")}>
        <CustomWords descriptionMode="inline" grouped />
      </SettingsGroup>
      <SettingsGroup title={t("writing.cleanup")}>
        <FillerWordRemoval descriptionMode="inline" grouped />
      </SettingsGroup>
      <VoiceSnippets />
    </div>
  );
}
