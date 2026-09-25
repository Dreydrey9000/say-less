import React, { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  formatKeyCombination,
  isBareTypingKey,
} from "../../lib/utils/keyboard";
import { ResetButton } from "../ui/ResetButton";
import { ShortcutChip } from "../ui/ShortcutChip";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import { useOsType } from "../../hooks/useOsType";
import { commands } from "@/bindings";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SECURE_INPUT_HELP_URL } from "../SecureInputWarning";

interface HandyKeysShortcutInputProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  shortcutId: string;
  disabled?: boolean;
}

interface HandyKeysEvent {
  modifiers: string[];
  key: string | null;
  is_key_down: boolean;
  hotkey_string: string;
}

export const HandyKeysShortcutInput: React.FC<HandyKeysShortcutInputProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
  shortcutId,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateBinding, resetBinding, isUpdating, isLoading } =
    useSettings();
  const [isRecording, setIsRecording] = useState(false);
  const [currentKeys, setCurrentKeys] = useState<string>("");
  const [originalBinding, setOriginalBinding] = useState<string>("");
  const [status, setStatus] = useState("");
  const shortcutRef = useRef<HTMLButtonElement | null>(null);
  // Escape can arrive from the webview and from the backend key listener at
  // once; cancel only once.
  const cancellingRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  // Use a ref to track currentKeys for the event handler (avoids stale closure)
  const currentKeysRef = useRef<string>("");
  // Track keyed vs modifier-only captures separately so a combo commits only
  // on its key's release and a modifier-only shortcut only once every
  // modifier is released. Committing on the *first* release (the old
  // behavior) silently saved just the modifier whenever the key event never
  // arrived — e.g. while macOS Secure Input is active (issue #1578).
  const keyedShortcutRef = useRef<string>("");
  const modifierOnlyShortcutRef = useRef<string>("");
  const osType = useOsType();

  const bindings = getSetting("bindings") || {};

  // Handle cancellation
  const cancelRecording = useCallback(async () => {
    if (!isRecording || cancellingRef.current) return;
    cancellingRef.current = true;

    // Stop listening for backend events
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    // Stop backend recording
    await commands.stopHandyKeysRecording().catch(console.error);

    // Restore original binding
    if (originalBinding) {
      try {
        await updateBinding(shortcutId, originalBinding);
      } catch (error) {
        console.error("Failed to restore original binding:", error);
        toast.error(t("settings.general.shortcut.errors.restore"));
      }
    }

    setIsRecording(false);
    setCurrentKeys("");
    currentKeysRef.current = "";
    keyedShortcutRef.current = "";
    modifierOnlyShortcutRef.current = "";
    setOriginalBinding("");
    setStatus(t("ux.shortcut.cancelled"));
    cancellingRef.current = false;
  }, [isRecording, originalBinding, shortcutId, updateBinding, t]);

  // Set up event listener for handy-keys events
  useEffect(() => {
    if (!isRecording) return;

    let cleanup = false;

    const setupListener = async () => {
      // Listen for key events from backend
      const commitAndStop = async (keysToCommit: string) => {
        if (isBareTypingKey(keysToCommit)) {
          // A lone letter or space would fire every time the user types it.
          const message = t("ux.shortcut.needsModifier");
          toast.error(message);
          setStatus(message);
          if (originalBinding) {
            await updateBinding(shortcutId, originalBinding).catch(
              console.error,
            );
          }
        } else {
          try {
            await updateBinding(shortcutId, keysToCommit);
            setStatus(
              t("ux.shortcut.saved", {
                keys: formatKeyCombination(keysToCommit, osType),
              }),
            );
          } catch (error) {
            // Log the details; show a plain message, never the raw error.
            console.error("Failed to change binding:", error);
            toast.error(t("ux.shortcut.setFailed"));
            setStatus(t("ux.shortcut.setFailed"));

            // Reset to original binding on error
            if (originalBinding) {
              try {
                await updateBinding(shortcutId, originalBinding);
              } catch (resetError) {
                console.error("Failed to reset binding:", resetError);
                toast.error(t("settings.general.shortcut.errors.reset"));
              }
            }
          }
        }

        // Stop recording
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
        }
        await commands.stopHandyKeysRecording().catch(console.error);
        setIsRecording(false);
        setCurrentKeys("");
        currentKeysRef.current = "";
        keyedShortcutRef.current = "";
        modifierOnlyShortcutRef.current = "";
        setOriginalBinding("");
      };

      const unlisten = await listen<HandyKeysEvent>(
        "handy-keys-event",
        async (event) => {
          if (cleanup) return;

          const { hotkey_string, is_key_down, key, modifiers } = event.payload;

          // Escape cancels and keeps the shortcut the user already had.
          if (key && ["escape", "esc"].includes(key.toLowerCase())) {
            if (is_key_down) void cancelRecording();
            return;
          }

          if (is_key_down && hotkey_string) {
            // Update both state (for display) and refs (for release handler)
            if (key) {
              keyedShortcutRef.current = hotkey_string;
            } else {
              modifierOnlyShortcutRef.current = hotkey_string;
            }
            currentKeysRef.current = hotkey_string;
            setCurrentKeys(hotkey_string);
          } else if (!is_key_down && key) {
            // The main key was released — commit the keyed combo. The release
            // event's hotkey_string still contains the key, so it works even
            // if the key-down was somehow missed. Never fall back to a
            // modifier-only capture here: that's how bindings used to get
            // silently overwritten with just the modifier (issue #1578).
            const keysToCommit = keyedShortcutRef.current || hotkey_string;
            if (keysToCommit) {
              await commitAndStop(keysToCommit);
            }
          } else if (
            !is_key_down &&
            !key &&
            modifiers.length === 0 &&
            !keyedShortcutRef.current &&
            modifierOnlyShortcutRef.current
          ) {
            // Every modifier released without a main key ever going down —
            // commit as a modifier-only shortcut
            await commitAndStop(modifierOnlyShortcutRef.current);
          }
        },
      );

      unlistenRef.current = unlisten;
    };

    setupListener();

    return () => {
      cleanup = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      // Stop backend recording on unmount to prevent orphaned recording loops
      commands.stopHandyKeysRecording().catch(console.error);
    };
  }, [
    isRecording,
    shortcutId,
    originalBinding,
    updateBinding,
    cancelRecording,
    osType,
    t,
  ]);

  // Handle click outside
  useEffect(() => {
    if (!isRecording) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        shortcutRef.current &&
        !shortcutRef.current.contains(e.target as Node)
      ) {
        cancelRecording();
      }
    };

    // The webview also sees Escape when it has focus.
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      void cancelRecording();
    };

    window.addEventListener("click", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isRecording, cancelRecording]);

  // Start recording a new shortcut
  const startRecording = async () => {
    if (isRecording) return;

    // Store the original binding to restore if canceled
    setStatus("");
    setOriginalBinding(bindings[shortcutId]?.current_binding || "");

    // Start backend recording. The backend refuses while macOS Secure Input
    // is active (the recorder's listener would receive no key events and
    // capture just the modifier) — it also flips the warning banner on, so
    // the toast points at a visible explanation.
    try {
      const result = await commands.startHandyKeysRecording(shortcutId);
      if (result.status === "error") {
        if (String(result.error).includes("secure-input-active")) {
          toast.error(t("secureInput.recorderBlocked"), {
            action: {
              label: t("secureInput.learnMore"),
              onClick: () => openUrl(SECURE_INPUT_HELP_URL),
            },
          });
        } else {
          console.error("Failed to start shortcut recording:", result.error);
          toast.error(t("ux.shortcut.startFailed"));
        }
        return;
      }
      setIsRecording(true);
      setCurrentKeys("");
      currentKeysRef.current = "";
      keyedShortcutRef.current = "";
      modifierOnlyShortcutRef.current = "";
    } catch (error) {
      console.error("Failed to start recording:", error);
      toast.error(t("ux.shortcut.startFailed"));
    }
  };

  // Format the current shortcut keys being recorded
  const formatCurrentKeys = (): string => {
    if (!currentKeys) return t("settings.general.shortcut.pressKeys");
    return formatKeyCombination(currentKeys, osType);
  };

  // If still loading, show loading state
  if (isLoading) {
    return (
      <SettingContainer
        title={t("settings.general.shortcut.title")}
        description={t("settings.general.shortcut.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <div className="text-sm text-mid-gray">
          {t("settings.general.shortcut.loading")}
        </div>
      </SettingContainer>
    );
  }

  // If no bindings are loaded, show empty state
  if (Object.keys(bindings).length === 0) {
    return (
      <SettingContainer
        title={t("settings.general.shortcut.title")}
        description={t("settings.general.shortcut.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <div className="text-sm text-mid-gray">
          {t("settings.general.shortcut.none")}
        </div>
      </SettingContainer>
    );
  }

  const binding = bindings[shortcutId];
  // A shortcut this build doesn't define (e.g. Fn off macOS) shows nothing,
  // rather than a dead "Shortcut not found" row.
  if (!binding) return null;

  // Get translated name and description for the binding
  const translatedName = t(
    `settings.general.shortcut.bindings.${shortcutId}.name`,
    binding.name,
  );
  const translatedDescription = t(
    `settings.general.shortcut.bindings.${shortcutId}.description`,
    binding.description,
  );

  return (
    <SettingContainer
      title={translatedName}
      description={translatedDescription}
      descriptionMode={descriptionMode}
      grouped={grouped}
      disabled={disabled}
      layout="horizontal"
    >
      <div className="flex items-center space-x-1">
        <ShortcutChip
          ref={shortcutRef}
          name={translatedName}
          keysLabel={formatKeyCombination(binding.current_binding, osType)}
          recording={isRecording}
          recordingLabel={formatCurrentKeys()}
          status={status}
          disabled={disabled}
          onStart={() => void startRecording()}
        />
        <ResetButton
          onClick={() => resetBinding(shortcutId)}
          disabled={isUpdating(`binding_${shortcutId}`)}
        />
      </div>
    </SettingContainer>
  );
};
