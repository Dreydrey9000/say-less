import { useTranslation } from "react-i18next";
import { SettingsGroup } from "../ui/SettingsGroup";
import { PageHeader } from "../ui/PageHeader";
import { CustomWords } from "./CustomWords";
import { FillerWordRemoval } from "./FillerWordRemoval";
import { WritingStyles } from "./WritingStyles";
import { VoiceSnippets } from "./VoiceSnippets";

export function WritingSettings() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl w-full mx-auto space-y-8">
      <PageHeader
        title={t("writing.title")}
        description={t("writing.description")}
      />
      <SettingsGroup title={t("writing.dictionary")}>
        <CustomWords descriptionMode="inline" grouped />
      </SettingsGroup>
      <SettingsGroup title={t("writing.cleanup")}>
        <FillerWordRemoval descriptionMode="inline" grouped />
      </SettingsGroup>
      <WritingStyles />
      <VoiceSnippets />
    </div>
  );
}
