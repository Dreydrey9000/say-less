import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { arch, platform } from "@tauri-apps/plugin-os";
import { toast } from "sonner";
import { BellOff, Check, Download, Loader2, RefreshCw } from "lucide-react";
import { ProgressBar } from "../shared";
import { useSettings } from "../../hooks/useSettings";
import { commands } from "../../bindings";
import {
  resolvePortableInstallerUrl,
  PORTABLE_RELEASES_URL,
} from "./portableInstaller";

// Closing the window only hides it, so this page can stay open for days while
// the app sits in the menu bar. Check again every few hours so a running copy
// still finds new versions.
const UPDATE_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Timers pause while the Mac sleeps, so also check when the window comes back
// into focus, but not more than once per half hour.
const FOCUS_RECHECK_MIN_GAP_MS = 30 * 60 * 1000;
// Fixed ids so repeat checks replace one toast instead of stacking new ones.
const UPDATE_READY_TOAST_ID = "update-ready";
const UPDATE_FAILED_TOAST_ID = "update-failed";
const DOWNLOAD_PAGE_URL = "https://saylessvoice.com/#download";

interface UpdateCheckerProps {
  className?: string;
}

const UpdateChecker: React.FC<UpdateCheckerProps> = ({ className = "" }) => {
  const { t } = useTranslation();
  // Update checking state
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showUpToDate, setShowUpToDate] = useState(false);
  const [showPortableUpdateDialog, setShowPortableUpdateDialog] =
    useState(false);
  const [portableInstallerUrl, setPortableInstallerUrl] = useState<string>(
    PORTABLE_RELEASES_URL,
  );

  const { settings, isLoading, updateChecksLocked } = useSettings();
  // Wait for the lock state too (null = not loaded yet), otherwise the first
  // render could fire an update check before HANDY_DISABLE_UPDATER is known.
  const settingsLoaded =
    !isLoading && settings !== null && updateChecksLocked !== null;
  // Forced-off by system configuration (HANDY_DISABLE_UPDATER) overrides the
  // stored preference without persisting it, mirroring the backend's effective
  // updater state.
  const updateChecksEnabled =
    (settings?.update_checks_enabled ?? false) && updateChecksLocked === false;

  const upToDateTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isManualCheckRef = useRef(false);
  const downloadedBytesRef = useRef(0);
  const contentLengthRef = useRef(0);
  const notifiedVersionRef = useRef<string | null>(null);
  // A ref, not state: the toast button and the event listener hold functions
  // from an older render, and they still need to see an install in progress.
  const isInstallingRef = useRef(false);
  const lastCheckRef = useRef(0);
  const isCheckingRef = useRef(false);
  const pendingUpdateRef = useRef<Update | null>(null);
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  const enabledRef = useRef(false);
  enabledRef.current = settingsLoaded && updateChecksEnabled;

  const closeUpdate = (update: Update) => {
    void update
      .close()
      .catch((error) =>
        console.error("Failed to release update resources:", error),
      );
  };

  useEffect(() => {
    // Wait for settings to load before doing anything
    if (!settingsLoaded) return;
    activeRef.current = true;

    if (!updateChecksEnabled) {
      if (upToDateTimeoutRef.current) {
        clearTimeout(upToDateTimeoutRef.current);
      }
      setIsChecking(false);
      setIsInstalling(false);
      setIsDownloaded(false);
      notifiedVersionRef.current = null;
      setUpdateAvailable(false);
      setShowUpToDate(false);
      toast.dismiss(UPDATE_READY_TOAST_ID);
      return;
    }

    checkForUpdates();
    const recheck = setInterval(checkForUpdates, UPDATE_RECHECK_INTERVAL_MS);
    const onFocus = () => {
      if (Date.now() - lastCheckRef.current < FOCUS_RECHECK_MIN_GAP_MS) return;
      checkForUpdates();
    };
    window.addEventListener("focus", onFocus);

    // Listen for update check events
    const updateUnlisten = listen("check-for-updates", () => {
      handleManualUpdateCheck();
    });

    return () => {
      activeRef.current = false;
      generationRef.current += 1;
      toast.dismiss(UPDATE_READY_TOAST_ID);
      const pending = pendingUpdateRef.current;
      pendingUpdateRef.current = null;
      if (pending) closeUpdate(pending);
      if (upToDateTimeoutRef.current) {
        clearTimeout(upToDateTimeoutRef.current);
      }
      clearInterval(recheck);
      window.removeEventListener("focus", onFocus);
      updateUnlisten.then((fn) => fn());
    };
  }, [settingsLoaded, updateChecksEnabled]);

  const showReady = (version: string, downloaded: boolean) => {
    if (!isManualCheckRef.current && notifiedVersionRef.current === version)
      return;
    notifiedVersionRef.current = version;
    toast(
      t(downloaded ? "footer.updateDownloaded" : "footer.updateReady", {
        version,
      }),
      {
        id: UPDATE_READY_TOAST_ID,
        duration: Infinity,
        cancel: { label: t("footer.updateLater"), onClick: () => {} },
        action: {
          label: t(downloaded ? "footer.restartToUpdate" : "footer.updateNow"),
          onClick: () => {
            void installUpdate();
          },
        },
        classNames: {
          cancelButton:
            "min-h-[28px] px-2 py-1 text-xs font-medium rounded-lg border border-mid-gray/40 bg-transparent text-text/80 hover:bg-mid-gray/20 cursor-pointer whitespace-nowrap",
          actionButton:
            "accent-action min-h-[28px] px-2 py-1 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap",
        },
      },
    );
  };

  const showFailure = () => {
    toast.error(t("footer.updateFailed"), {
      id: UPDATE_FAILED_TOAST_ID,
      description:
        platform() === "macos"
          ? t("footer.updateFailedMacDescription")
          : t("footer.updateFailedDescription"),
      duration: 15000,
      action: {
        label: t("footer.updateFailedAction"),
        onClick: () => openUrl(DOWNLOAD_PAGE_URL),
      },
    });
  };

  const checkForUpdates = async () => {
    if (
      !enabledRef.current ||
      !activeRef.current ||
      isCheckingRef.current ||
      isInstallingRef.current
    )
      return;
    // Keep the verified package until the user chooses to restart. A focus
    // event or manual check must not allocate another copy of it.
    if (pendingUpdateRef.current) {
      showReady(pendingUpdateRef.current.version, true);
      isManualCheckRef.current = false;
      return;
    }
    isCheckingRef.current = true;
    const generation = generationRef.current;
    const current = () =>
      activeRef.current &&
      enabledRef.current &&
      generation === generationRef.current;
    let update: Update | null = null;
    try {
      lastCheckRef.current = Date.now();
      setIsChecking(true);
      toast.dismiss(UPDATE_FAILED_TOAST_ID);
      update = await check({ timeout: 30000 });
      if (!current()) return;
      if (update) {
        setUpdateAvailable(true);
        setShowUpToDate(false);
        setPortableInstallerUrl(
          resolvePortableInstallerUrl(update.rawJson, platform(), arch()),
        );
        const portable = await commands.isPortable();
        if (!current()) return;
        if (portable) {
          showReady(update.version, false);
          return;
        }
        setIsInstalling(true);
        setDownloadProgress(0);
        downloadedBytesRef.current = 0;
        contentLengthRef.current = 0;
        // download() verifies the signature but does not replace or restart
        // the running app. install() is only called by the user's button.
        await update.download(
          (event) => {
            if (!current()) return;
            if (event.event === "Started") {
              downloadedBytesRef.current = 0;
              contentLengthRef.current = event.data.contentLength ?? 0;
            } else if (event.event === "Progress") {
              downloadedBytesRef.current += event.data.chunkLength;
              setDownloadProgress(
                contentLengthRef.current > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (downloadedBytesRef.current /
                          contentLengthRef.current) *
                          100,
                      ),
                    )
                  : 0,
              );
            }
          },
          { timeout: 120000 },
        );
        if (!current()) return;
        pendingUpdateRef.current = update;
        setIsDownloaded(true);
        showReady(update.version, true);
        update = null; // Ownership moves to pendingUpdateRef until install/cleanup.
      } else {
        setUpdateAvailable(false);
        if (isManualCheckRef.current) {
          setShowUpToDate(true);
          if (upToDateTimeoutRef.current)
            clearTimeout(upToDateTimeoutRef.current);
          upToDateTimeoutRef.current = setTimeout(
            () => setShowUpToDate(false),
            3000,
          );
        }
      }
    } catch (error) {
      console.error("Failed to prepare update:", error);
      if (current()) showFailure();
    } finally {
      if (update) closeUpdate(update);
      isCheckingRef.current = false;
      if (current()) {
        setIsChecking(false);
        setIsInstalling(false);
      }
      isManualCheckRef.current = false;
      // Settings/StrictMode may have replaced the effect while IPC was in
      // flight. Release that result before starting the new effect's check.
      if (
        activeRef.current &&
        enabledRef.current &&
        generation !== generationRef.current
      )
        void checkForUpdates();
    }
  };

  const handleManualUpdateCheck = () => {
    if (!enabledRef.current) return;
    isManualCheckRef.current = true;
    void checkForUpdates();
  };

  const installUpdate = async () => {
    if (
      !enabledRef.current ||
      !activeRef.current ||
      isCheckingRef.current ||
      isInstallingRef.current
    )
      return;
    isInstallingRef.current = true;
    const generation = generationRef.current;
    let update: Update | null = null;
    try {
      const portable = await commands.isPortable();
      if (
        !enabledRef.current ||
        !activeRef.current ||
        generation !== generationRef.current
      )
        return;
      if (portable) {
        setShowPortableUpdateDialog(true);
        return;
      }
      if (!pendingUpdateRef.current) {
        isInstallingRef.current = false;
        await checkForUpdates();
        return;
      }
      const [dictation, screen, studioBusy] = await Promise.all([
        commands.getDockState(),
        commands.screenRecordingStatus(),
        invoke<boolean>("creative_studio_busy"),
      ]);
      if (
        !enabledRef.current ||
        !activeRef.current ||
        generation !== generationRef.current
      )
        return;
      if (dictation !== "idle" || screen.state !== "idle") {
        toast.info(t("footer.updateBusy"));
        return;
      }
      if (studioBusy) {
        toast.info(t("creative.updateBusy"));
        return;
      }
      if (
        await invoke<boolean>("creative_studio_prepare_update", {
          resume: false,
        })
      ) {
        toast.info(t("creative.updateBusy"));
        return;
      }
      update = pendingUpdateRef.current;
      pendingUpdateRef.current = null;
      setIsInstalling(true);
      setDownloadProgress(100);
      toast.dismiss(UPDATE_READY_TOAST_ID);
      await update.install();
      await relaunch();
    } catch (error) {
      void invoke("creative_studio_prepare_update", { resume: true }).catch(
        () => {},
      );
      console.error("Failed to install update:", error);
      if (activeRef.current) showFailure();
    } finally {
      if (update) {
        closeUpdate(update);
        setIsDownloaded(false);
        notifiedVersionRef.current = null;
      }
      isInstallingRef.current = false;
      if (activeRef.current) {
        setIsInstalling(false);
        setDownloadProgress(0);
      }
    }
  };

  // Update status functions
  const getUpdateStatusText = () => {
    if (!updateChecksEnabled) {
      return t("footer.updateCheckingDisabled");
    }
    if (isInstalling) {
      if (isChecking) return t("footer.downloadingBackground");
      return downloadProgress > 0 && downloadProgress < 100
        ? t("footer.downloading", {
            progress: downloadProgress.toString().padStart(3),
          })
        : downloadProgress === 100
          ? t("footer.installing")
          : t("footer.preparing");
    }
    if (isChecking) return t("footer.checkingUpdates");
    if (showUpToDate) return t("footer.upToDate");
    // Name the action, not the state: the button installs it.
    if (isDownloaded) return t("footer.restartToUpdate");
    if (updateAvailable) return t("footer.updateNow");
    return t("footer.checkForUpdates");
  };

  const getUpdateStatusAction = () => {
    if (!updateChecksEnabled) return undefined;
    if (updateAvailable && !isInstalling) return installUpdate;
    if (!isChecking && !isInstalling && !updateAvailable)
      return handleManualUpdateCheck;
    return undefined;
  };

  const isUpdateDisabled = !updateChecksEnabled || isChecking || isInstalling;
  const isUpdateClickable =
    !isUpdateDisabled && (updateAvailable || (!isChecking && !showUpToDate));

  // When no installer could be resolved for this target the button falls back to
  // the releases index, so the dialog has to say "browse" rather than "download".
  const hasDirectInstaller = portableInstallerUrl !== PORTABLE_RELEASES_URL;

  return (
    <>
      {showPortableUpdateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-mid-gray/20 rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
            <h2 className="text-base font-semibold">
              {t("footer.portableUpdateTitle")}
            </h2>
            <p className="text-sm text-text/70">
              {hasDirectInstaller
                ? t("footer.portableUpdateMessage")
                : t("footer.portableUpdateBrowseMessage")}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 text-sm rounded border border-mid-gray/20 hover:bg-mid-gray/10 transition-colors"
                onClick={() => setShowPortableUpdateDialog(false)}
              >
                {t("common.close")}
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded bg-logo-primary text-white hover:bg-logo-primary/80 transition-colors"
                onClick={() => {
                  openUrl(portableInstallerUrl);
                  setShowPortableUpdateDialog(false);
                }}
              >
                {hasDirectInstaller
                  ? t("footer.portableUpdateButton")
                  : t("footer.portableUpdateBrowseButton")}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Always a real button shape (UI-STANDARD 6.10): a bordered pill at
            rest, the filled accent when an update is waiting. Busy and
            finished states keep the same shape, disabled, so the footer
            doesn't jump and nobody has to guess where the control went. */}
        <button
          type="button"
          onClick={isUpdateClickable ? getUpdateStatusAction() : undefined}
          // Only "Updates off" is truly disabled. While a check or install
          // runs it stays focusable (aria-disabled, and the click is ignored
          // above), so keyboard focus isn't dropped to the page.
          disabled={!updateChecksEnabled}
          aria-disabled={!isUpdateClickable}
          aria-busy={isChecking || isInstalling}
          title={
            updateAvailable && !isInstalling
              ? t(
                  isDownloaded
                    ? "footer.restartToUpdate"
                    : "footer.updateAvailableShort",
                )
              : undefined
          }
          className={`inline-flex items-center justify-center gap-1.5 min-h-[28px] min-w-[168px] px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text ${
            updateAvailable && isUpdateClickable
              ? "accent-action cursor-pointer"
              : !updateChecksEnabled
                ? "text-text/50 bg-transparent border-mid-gray/25 border-dashed cursor-not-allowed"
                : isUpdateClickable
                  ? "text-text bg-mid-gray/10 border-mid-gray/40 hover:bg-mid-gray/20 hover:border-logo-primary cursor-pointer"
                  : "text-text/70 bg-mid-gray/10 border-mid-gray/25 cursor-default"
          }`}
        >
          {!updateChecksEnabled ? (
            <BellOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : isChecking ||
            (isInstalling &&
              (downloadProgress === 0 || downloadProgress === 100)) ? (
            <Loader2
              className="w-3.5 h-3.5 shrink-0 motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : isInstalling ? (
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : showUpToDate ? (
            <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : updateAvailable ? (
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{getUpdateStatusText()}</span>
        </button>
        {/* Say the result out loud too; download percents are left out so
            screen readers aren't flooded. */}
        <span className="sr-only" aria-live="polite">
          {isChecking
            ? t("footer.checkingUpdates")
            : showUpToDate
              ? t("footer.upToDate")
              : updateAvailable && !isInstalling
                ? t(
                    isDownloaded
                      ? "footer.restartToUpdate"
                      : "footer.updateAvailableShort",
                  )
                : ""}
        </span>

        {isInstalling && downloadProgress > 0 && downloadProgress < 100 && (
          <ProgressBar
            progress={[
              {
                id: "update",
                percentage: downloadProgress,
              },
            ]}
            size="large"
          />
        )}
      </div>
    </>
  );
};

export default UpdateChecker;
