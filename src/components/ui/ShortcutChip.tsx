import { forwardRef } from "react";
import { useTranslation } from "react-i18next";

interface ShortcutChipProps {
  /** Translated name of the shortcut, e.g. "Transcribe Shortcut". */
  name: string;
  /** The current keys, already formatted for this OS. */
  keysLabel: string;
  /** True while we are waiting for the user to press the new keys. */
  recording: boolean;
  /** What to show while recording ("Press keys..." or the keys so far). */
  recordingLabel: string;
  /** Short message for screen readers after a change (saved / cancelled). */
  status?: string;
  disabled?: boolean;
  onStart: () => void;
}

/**
 * The key chip for a shortcut row. A real button, so it can be reached with
 * Tab and started with Enter or Space. While recording it announces "Press
 * the new keys, Escape to cancel." through a polite live region.
 */
export const ShortcutChip = forwardRef<HTMLButtonElement, ShortcutChipProps>(
  function ShortcutChip(
    { name, keysLabel, recording, recordingLabel, status, disabled, onStart },
    ref,
  ) {
    const { t } = useTranslation();
    const capturing = t("ux.shortcut.capturing");
    return (
      <>
        <button
          ref={ref}
          type="button"
          data-shortcut-chip=""
          disabled={disabled}
          aria-label={
            recording
              ? `${name}. ${capturing}`
              : t("ux.shortcut.change", { name, keys: keysLabel })
          }
          onClick={() => {
            if (!recording) onStart();
          }}
          className={`min-h-8 px-2 py-1 text-sm font-semibold rounded-md border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50 disabled:cursor-not-allowed ${
            recording
              ? "border-logo-primary bg-logo-primary/30"
              : "bg-mid-gray/10 border-mid-gray/80 hover:bg-logo-primary/10 hover:border-logo-primary"
          }`}
        >
          {recording ? recordingLabel : keysLabel}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {recording ? capturing : (status ?? "")}
        </span>
      </>
    );
  },
);
