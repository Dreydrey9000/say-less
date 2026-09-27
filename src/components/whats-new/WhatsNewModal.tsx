import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { Dialog } from "../ui";
import { Button } from "../ui/Button";
import { MarkdownContent } from "./MarkdownContent";
import type { ReleaseNote } from "./releaseNotes";

interface WhatsNewModalProps {
  note: ReleaseNote;
  open: boolean;
  onDismiss: () => void;
  /** Takes the user to the screen recording card on Home. */
  onTryRecording?: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  note,
  open,
  onDismiss,
  onTryRecording,
}) => {
  const { t } = useTranslation();
  // Screen recording is Mac only; on Windows the card just says "coming soon".
  const canTryRecording = onTryRecording !== undefined && type() === "macos";

  return (
    <Dialog
      open={open}
      title={t("whatsNew.title", { version: note.version })}
      closeLabel={t("common.close")}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDismiss();
      }}
      footer={
        <>
          <Button
            variant={canTryRecording ? "secondary" : "primary"}
            onClick={onDismiss}
          >
            {t("whatsNew.gotIt")}
          </Button>
          {canTryRecording && (
            <Button
              variant="primary"
              onClick={() => {
                onTryRecording();
                onDismiss();
              }}
            >
              {t("whatsNew.tryRecording")}
            </Button>
          )}
        </>
      }
    >
      <MarkdownContent markdown={note.markdown} />
    </Dialog>
  );
};
