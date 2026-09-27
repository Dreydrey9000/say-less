import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  startScreenRecordingSync,
  useScreenRecording,
} from "@/lib/screenRecording";
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
  // Only offer it when this computer can record (a Mac on macOS 15 or newer).
  // Elsewhere the card's Record button is faded, so the jump would dead end.
  const recordingSupported = useScreenRecording(
    (state) => state.status?.supported === true,
  );
  useEffect(() => startScreenRecordingSync(), []);
  const canTryRecording = onTryRecording !== undefined && recordingSupported;

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
