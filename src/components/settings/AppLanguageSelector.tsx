import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import {
  SUPPORTED_LANGUAGES,
  changeAppLanguage,
  getSupportedLanguage,
  type SupportedLanguageCode,
} from "../../i18n";
import { useSettings } from "@/hooks/useSettings";

interface AppLanguageSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AppLanguageSelector: React.FC<AppLanguageSelectorProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { t, i18n } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const [loadFailed, setLoadFailed] = React.useState(false);

    const currentLanguage = (getSupportedLanguage(settings?.app_language) ||
      i18n.language) as SupportedLanguageCode;

    const languageOptions = SUPPORTED_LANGUAGES.map((lang) => ({
      value: lang.code,
      label: `${lang.nativeName} (${lang.name})`,
    }));

    const handleLanguageChange = (langCode: string) => {
      setLoadFailed(false);
      void changeAppLanguage(langCode)
        .then((changed) => {
          if (changed) void updateSetting("app_language", langCode);
        })
        .catch(() => setLoadFailed(true));
    };

    return (
      <SettingContainer
        title={t("appLanguage.title")}
        description={t("appLanguage.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Dropdown
          options={languageOptions}
          selectedValue={currentLanguage}
          onSelect={handleLanguageChange}
        />
        {loadFailed && <p role="alert">{t("studio.error")}</p>}
      </SettingContainer>
    );
  });

AppLanguageSelector.displayName = "AppLanguageSelector";
