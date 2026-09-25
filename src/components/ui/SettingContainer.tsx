import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SettingLabelContext } from "./SettingLabelContext";

interface SettingContainerProps {
  title: string;
  description: string;
  children: ReactNode;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export function SettingContainer({
  title,
  description,
  children,
  descriptionMode = "tooltip",
  grouped = false,
  layout = "horizontal",
  disabled = false,
}: SettingContainerProps) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <SettingLabelContext.Provider value={title}>
      <div
        role="group"
        aria-labelledby={titleId}
        className={`setting-row ${layout === "stacked" ? "setting-row-stacked" : ""} ${grouped ? "" : "rounded-xl border border-mid-gray/20"}`}
      >
        <div className={`min-w-0 ${disabled ? "opacity-60" : ""}`}>
          <h3 id={titleId} className="setting-label">
            {title}
          </h3>
          {description &&
            (descriptionMode === "inline" ? (
              <p className="setting-description">{description}</p>
            ) : (
              <details className="mt-1 text-[13px] text-text-muted">
                <summary className="cursor-pointer w-fit rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text">
                  {t("controls.details")}
                </summary>
                <p className="mt-2 max-w-prose leading-relaxed">
                  {description}
                </p>
              </details>
            ))}
        </div>
        <div className="relative min-w-0 max-w-full">{children}</div>
      </div>
    </SettingLabelContext.Provider>
  );
}
