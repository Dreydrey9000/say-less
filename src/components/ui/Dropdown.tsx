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
// `.sl-select` (App.css) gives it the shared look: 40px tall like the text
// inputs, one chevron, width fits the longest option up to 280px.
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
      <span className="sl-select-wrap">
        <select
          aria-label={label || placeholder || t("controls.choose")}
          aria-describedby={selected?.description ? descriptionId : undefined}
          value={selected?.value ?? ""}
          onChange={(event) => onSelect(event.target.value)}
          onFocus={onRefresh}
          disabled={disabled}
          className="sl-select"
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
      </span>
      {selected?.description && (
        <p id={descriptionId} className="text-xs text-text/70 mt-1 max-w-xs">
          {selected.description}
        </p>
      )}
    </div>
  );
}
