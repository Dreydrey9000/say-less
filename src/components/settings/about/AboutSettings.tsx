import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { AppDataDirectory } from "../AppDataDirectory";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { ShowWhatsNewOnUpdate } from "../ShowWhatsNewOnUpdate";
import { listReleaseNotes } from "../../whats-new/releaseNotes";
import { MarkdownContent } from "../../whats-new/MarkdownContent";
import { LogDirectory } from "../debug";

export const AboutSettings: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  const handleDonateClick = async () => {
    try {
      await openUrl("https://handy.computer/donate");
    } catch (error) {
      console.error("Failed to open donate link:", error);
    }
  };

  const handleShareClick = async () => {
    try {
      await navigator.clipboard.writeText("https://saylessvoice.com");
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy share link:", error);
      await openUrl("https://saylessvoice.com");
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.about.title")}>
        <AppLanguageSelector descriptionMode="tooltip" grouped={true} />
        <SettingContainer
          title={t("settings.about.version.title")}
          description={t("settings.about.version.description")}
          grouped={true}
        >
          <div className="text-end">
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <span className="text-sm font-mono">v{version}</span>
            {/* The MIT license asks us to credit the project Say Less is built on. */}
            <p className="text-[13px] text-text-muted">
              {t("settings.about.credit")}
            </p>
          </div>
        </SettingContainer>

        <ShowWhatsNewOnUpdate descriptionMode="tooltip" grouped={true} />

        <SettingContainer
          title={t("settings.about.share.title")}
          description={t("settings.about.share.description")}
          grouped={true}
        >
          <Button variant="primary" size="md" onClick={handleShareClick}>
            {shareCopied
              ? t("settings.about.share.copied")
              : t("settings.about.share.button")}
          </Button>
        </SettingContainer>

        <SettingContainer
          title={t("settings.about.supportDevelopment.title")}
          description={t("settings.about.supportDevelopment.description")}
          grouped={true}
        >
          <Button variant="primary" size="md" onClick={handleDonateClick}>
            {t("settings.about.supportDevelopment.button")}
          </Button>
        </SettingContainer>

        <SettingContainer
          title={t("settings.about.sourceCode.title")}
          description={t("settings.about.sourceCode.description")}
          grouped={true}
        >
          <Button
            variant="secondary"
            size="md"
            onClick={() => openUrl("https://github.com/Dreydrey9000/say-less")}
          >
            {t("settings.about.sourceCode.button")}
          </Button>
        </SettingContainer>

        <AppDataDirectory descriptionMode="tooltip" grouped={true} />
        <LogDirectory grouped={true} />
      </SettingsGroup>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("studio.updates")}</h2>
        {listReleaseNotes(version).map((note) => (
          <details
            key={note.version}
            className="border border-mid-gray/20 rounded-xl p-4"
          >
            <summary className="cursor-pointer font-medium">
              {t("studio.version", { version: note.version })}
            </summary>
            <div className="mt-4">
              <MarkdownContent markdown={note.markdown} />
            </div>
          </details>
        ))}
      </section>

      <SettingsGroup title={t("settings.about.acknowledgments.title")}>
        <SettingContainer
          title={t("settings.about.acknowledgments.ggml.title")}
          description={t("settings.about.acknowledgments.ggml.description")}
          grouped={true}
          layout="stacked"
        >
          <div className="text-sm text-mid-gray">
            {t("settings.about.acknowledgments.ggml.details")}
          </div>
        </SettingContainer>
      </SettingsGroup>
    </div>
  );
};
