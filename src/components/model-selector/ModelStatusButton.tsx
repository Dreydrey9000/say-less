import React from "react";
import { useTranslation } from "react-i18next";

type ModelStatus =
  | "ready"
  | "loading"
  | "downloading"
  | "verifying"
  | "extracting"
  | "error"
  | "unloaded"
  | "none";

interface ModelStatusButtonProps {
  status: ModelStatus;
  displayText: string;
  isDropdownOpen: boolean;
  popoverId?: string;
  onClick: () => void;
  className?: string;
}

const ModelStatusButton: React.FC<ModelStatusButtonProps> = ({
  status,
  displayText,
  isDropdownOpen,
  popoverId,
  onClick,
  className = "",
}) => {
  const { t } = useTranslation();
  const label = t("ux.model.status", { name: displayText });
  const getStatusColor = (status: ModelStatus): string => {
    switch (status) {
      case "ready":
        return "bg-green-400";
      case "loading":
        return "bg-yellow-400 animate-pulse";
      case "downloading":
        return "bg-logo-primary animate-pulse";
      case "verifying":
        return "bg-orange-400 animate-pulse";
      case "extracting":
        return "bg-orange-400 animate-pulse";
      case "error":
        return "bg-red-400";
      case "unloaded":
        return "bg-mid-gray/60";
      case "none":
        return "bg-red-400";
      default:
        return "bg-mid-gray/60";
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={isDropdownOpen}
      aria-controls={isDropdownOpen ? popoverId : undefined}
      className={`flex items-center gap-2 min-h-[24px] px-1 -mx-1 rounded hover:text-text/80 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text ${className}`}
      title={label}
    >
      <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
      <span className="max-w-56 truncate">{displayText}</span>
      <svg
        aria-hidden="true"
        className={`w-3 h-3 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
  );
};

export default ModelStatusButton;
