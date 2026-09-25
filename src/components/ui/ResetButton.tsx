import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import { SettingLabelContext } from "./SettingLabelContext";
import ResetIcon from "../icons/ResetIcon";

interface ResetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}

export const ResetButton: React.FC<ResetButtonProps> = React.memo(
  ({ onClick, disabled = false, className = "", ariaLabel, children }) => {
    const label = useContext(SettingLabelContext);
    const { t } = useTranslation();
    const name = ariaLabel ?? t("controls.reset", { setting: label });
    const button = (
      <button
        type="button"
        aria-label={name}
        className={`inline-flex items-center gap-1.5 min-h-8 min-w-8 px-2 py-1 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-logo-primary rounded-md border border-transparent transition-all duration-150 ${
          disabled
            ? "opacity-50 cursor-not-allowed text-text/40"
            : "hover:bg-logo-primary/30 active:bg-logo-primary/50 active:translate-y-[1px] hover:cursor-pointer hover:border-logo-primary text-text/80"
        } ${className}`}
        onClick={onClick}
        disabled={disabled}
      >
        {children ?? (
          <>
            <ResetIcon width={16} height={16} />
            {/* A visible word, not just an icon, so the action reads at a glance. */}
            <span>{t("controls.resetLabel")}</span>
          </>
        )}
      </button>
    );
    return button;
  },
);
