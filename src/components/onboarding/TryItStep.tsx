import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import SayLessLogo from "../icons/SayLessLogo";
import { Button } from "../ui/Button";
import { useSettings } from "../../hooks/useSettings";
import { formatKeyCombination } from "../../lib/utils/keyboard";

interface TryItStepProps {
  onDone: () => void;
}

/**
 * Last onboarding step: one guided dictation into a practice box, so the first
 * success happens on purpose instead of by chance. It also shows the Fn /
 * emoji-picker fix before anyone decides the app is broken.
 */
const TryItStep: React.FC<TryItStepProps> = ({ onDone }) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [text, setText] = useState("");
  const isMac = type() === "macos";
  const shortcut = formatKeyCombination(
    settings?.bindings?.transcribe?.current_binding ?? "",
    "unknown",
  );
  const hasFn = isMac && !!settings?.bindings?.transcribe_fn?.current_binding;
  const worked = text.trim().length > 0;

  return (
    <div className="h-screen w-full flex flex-col items-center p-6 gap-6 overflow-y-auto">
      <SayLessLogo width={160} />
      <div className="max-w-[560px] w-full space-y-4">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight">
          {t("onboarding.try.title")}
        </h1>
        <p className="text-[15px] leading-6">
          {t(
            settings?.shortcut_activation === "toggle"
              ? "onboarding.try.toggle"
              : "onboarding.try.hold",
            { shortcut },
          )}
          {hasFn && <> {t("onboarding.try.fn")}</>}
        </p>
        <label className="block space-y-2">
          <span className="setting-label">{t("onboarding.try.label")}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("onboarding.try.placeholder")}
            rows={3}
            className="w-full rounded-lg border border-mid-gray/40 bg-background p-3 text-[15px] leading-6 select-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          />
        </label>
        <p
          role="status"
          className={worked ? "text-[15px] font-medium" : "setting-description"}
        >
          {worked ? t("onboarding.try.success") : t("onboarding.try.loading")}
        </p>
        {hasFn && (
          <p className="setting-description">{t("onboarding.try.fnTip")}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button onClick={onDone}>{t("onboarding.try.done")}</Button>
          {!worked && (
            <Button variant="ghost" onClick={onDone}>
              {t("onboarding.try.skip")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TryItStep;
