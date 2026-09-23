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
    return (
      <button
        type="button"
        aria-label={ariaLabel ?? t("controls.reset", { setting: label })}
        className={`min-h-8 min-w-8 p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-logo-primary rounded-md border border-transparent transition-all duration-150 ${
          disabled
            ? "opacity-50 cursor-not-allowed text-text/40"
            : "hover:bg-logo-primary/30 active:bg-logo-primary/50 active:translate-y-[1px] hover:cursor-pointer hover:border-logo-primary text-text/80"
        } ${className}`}
        onClick={onClick}
        disabled={disabled}
      >
        {children ?? <ResetIcon />}
      </button>
    );
  },
);
