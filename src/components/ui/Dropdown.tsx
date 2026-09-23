import { useContext, useId } from "react";
import { useTranslation } from "react-i18next";
import { SettingLabelContext } from "./SettingLabelContext";

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}
interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  menuClassName?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onRefresh?: () => void;
}

// Native selection provides arrow keys, type-ahead, Escape, and platform screen
// reader behavior without maintaining a second, incomplete combobox implementation.
export function Dropdown({
  options,
  selectedValue,
  onSelect,
  className = "",
  placeholder,
  disabled = false,
  onRefresh,
}: DropdownProps) {
  const { t } = useTranslation();
  const label = useContext(SettingLabelContext);
  const descriptionId = useId();
  const selected = options.find((option) => option.value === selectedValue);
  return (
    <div className={`min-w-0 max-w-full ${className}`}>
      <select
        aria-label={label || placeholder || t("controls.choose")}
        aria-describedby={selected?.description ? descriptionId : undefined}
        value={selected?.value ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        onFocus={onRefresh}
        disabled={disabled}
        className="w-full min-w-0 max-w-full min-h-10 rounded-lg border border-mid-gray/40 bg-background px-3 py-2 text-sm text-text cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {!selected && (
          <option value="" disabled>
            {placeholder || t("controls.choose")}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {selected?.description && (
        <p id={descriptionId} className="text-xs text-text/70 mt-1 max-w-xs">
          {selected.description}
        </p>
      )}
    </div>
  );
}
