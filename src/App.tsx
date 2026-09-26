import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { toast, Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import { ModelStateEvent, RecordingErrorEvent } from "./lib/types/events";
import "./App.css";
import AccessibilityPermissions from "./components/AccessibilityPermissions";
import SecureInputWarning from "./components/SecureInputWarning";
import { Home } from "./components/Home";
import Footer from "./components/footer";
import Onboarding, {
  AccessibilityOnboarding,
  TryItStep,
} from "./components/onboarding";
import {
  DebugSettings,
  type OnboardingPreviewStep,
} from "./components/settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Sidebar, SidebarSection, SECTIONS_CONFIG } from "./components/Sidebar";
import { NavigateContext } from "./components/navigation";
import { NAVIGATE_EVENT } from "./lib/navigation";
import {
  OPEN_RECORDING_SETUP_EVENT,
  useRecordingOptions,
} from "./lib/recordingOptions";
import { WhatsNewGate } from "./components/whats-new";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { commands } from "@/bindings";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";

type OnboardingStep = "accessibility" | "model" | "try" | "done";

// Stable identity so preview effects do not re-run due to callback changes.
const NOOP = () => {};

const renderSettingsContent = (
  section: SidebarSection,
  onPreviewOnboarding: (step: OnboardingPreviewStep) => void,
  onNavigate: (section: SidebarSection) => void,
) => {
  if (section === "home") return <Home onNavigate={onNavigate} />;
  if (section === "debug") {
    return <DebugSettings onPreviewOnboarding={onPreviewOnboarding} />;
  }

  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component || SECTIONS_CONFIG.general.component;
  return <ActiveComponent />;
};

function App() {
  const [settingsOnly, setSettingsOnly] = useState(false);
  const { t, i18n } = useTranslation();
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(
    null,
  );
  const [onboardingPreview, setOnboardingPreview] =
    useState<OnboardingPreviewStep | null>(null);
  // Track if this is a returning user who just needs to grant permissions
  // (vs a new user who needs full onboarding including model selection)
  const [isReturningUser, setIsReturningUser] = useState(false);
  // First-run setup counts the permission screen as a step only when we
  // actually had to ask (it is skipped when everything is already granted).
  const [askedPermissions, setAskedPermissions] = useState(false);
  const markAskedPermissions = useCallback(() => setAskedPermissions(true), []);
  const setupTotal = askedPermissions ? 3 : 2;
  const setupOffset = askedPermissions ? 1 : 0;
  const [currentSection, setCurrentSection] = useState<SidebarSection>("home");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const shownSection = useRef<SidebarSection | null>(null);
  const { settings, updateSetting } = useSettings();
  const direction = getLanguageDirection(i18n.language);
  const refreshAudioDevices = useSettingsStore(
    (state) => state.refreshAudioDevices,
  );
  const refreshOutputDevices = useSettingsStore(
    (state) => state.refreshOutputDevices,
  );
  const hasCompletedPostOnboardingInit = useRef(false);
  const isShowingOnboarding =
    onboardingPreview !== null ||
    onboardingStep === "accessibility" ||
    onboardingStep === "model" ||
    onboardingStep === "try";

  // Classic scrollbars consume layout space. Reserve a matching gutter on the
  // opposite edge while onboarding is visible so its content stays centered in
  // the physical window. Overlay scrollbars ignore scrollbar-gutter.
  useLayoutEffect(() => {
    const attribute = "data-onboarding-active";
    document.documentElement.toggleAttribute(attribute, isShowingOnboarding);
    return () => document.documentElement.removeAttribute(attribute);
  }, [isShowingOnboarding]);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  // Initialize RTL direction when language changes
  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

  // Initialize input automation only after permission setup completes. The
  // "Try it" step needs working shortcuts, so it counts as complete here.
  useEffect(() => {
    if (
      (onboardingStep === "done" || onboardingStep === "try") &&
      !settingsOnly &&
      !hasCompletedPostOnboardingInit.current
    ) {
      hasCompletedPostOnboardingInit.current = true;
      Promise.all([
        commands.initializeEnigo(),
        commands.initializeShortcuts(),
      ]).catch((e) => {
        console.warn("Failed to initialize:", e);
      });
    }
  }, [onboardingStep, settingsOnly]);

  // Device enumeration is read-only and also works while browsing settings.
  useEffect(() => {
    if (onboardingStep === "done") {
      void refreshAudioDevices();
      void refreshOutputDevices();
    }
  }, [onboardingStep, refreshAudioDevices, refreshOutputDevices]);

  // Returning from System Settings can satisfy permissions without another grant.
  useEffect(() => {
    if (!settingsOnly || platform() !== "macos") return;
    const recheck = async () => {
      try {
        const [accessibility, microphone] = await Promise.all([
          checkAccessibilityPermission(),
          checkMicrophonePermission(),
        ]);
        if (accessibility && microphone) {
          setSettingsOnly(false);
          setOnboardingStep("done");
        }
      } catch {
        /* Keep setup visible when the OS cannot confirm access. */
      }
    };
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [settingsOnly]);

  useEffect(() => {
    const pending = listen<boolean>("voice-action-result", (event) => {
      if (event.payload) toast.success(t("controls.actionOpened"));
      else toast.error(t("controls.actionFailed"));
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, [t]);

  useEffect(() => {
    const pending = listen("cleanup-fallback", () =>
      toast.error(t("corrections.cleanupFallback")),
    );
    return () => {
      void pending.then((fn) => fn());
    };
  }, [t]);

  // The dock's Recording setup button: open Home with the setup panel.
  useEffect(() => {
    const pending = listen(OPEN_RECORDING_SETUP_EVENT, () => {
      setCurrentSection("home");
      useRecordingOptions.setState({ setupRequested: true });
    });
    return () => {
      void pending.then((fn) => fn());
    };
  }, []);

  // Other parts of the window (e.g. the footer model popover) can ask to open a
  // section without prop drilling.
  useEffect(() => {
    const open = (event: Event) => {
      const section = (event as CustomEvent<SidebarSection>).detail;
      if (section in SECTIONS_CONFIG) setCurrentSection(section);
    };
    window.addEventListener(NAVIGATE_EVENT, open);
    return () => window.removeEventListener(NAVIGATE_EVENT, open);
  }, []);

  // Every section shares one scroller. On a section change, start the new
  // screen at the top and move focus to its heading, so keyboard and screen
  // reader users land on the new content instead of <body>.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const previous = shownSection.current;
    shownSection.current = currentSection;
    if (previous === null || previous === currentSection) return;
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    const heading = main.querySelector<HTMLElement>("h1, h2");
    const target = heading ?? main;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [currentSection, onboardingStep]);

  // Handle keyboard shortcuts for debug mode toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (macOS)
      const isDebugShortcut =
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        (event.ctrlKey || event.metaKey);

      if (isDebugShortcut) {
        event.preventDefault();
        const currentDebugMode = settings?.debug_mode ?? false;
        updateSetting("debug_mode", !currentDebugMode);
      }
    };

    // Add event listener when component mounts
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings?.debug_mode, updateSetting]);

  // Listen for recording errors from the backend and show a toast
  useEffect(() => {
    const unlisten = listen<RecordingErrorEvent>("recording-error", (event) => {
      const { error_type, detail } = event.payload;

      if (error_type === "microphone_permission_denied") {
        const currentPlatform = platform();
        const platformKey = `errors.micPermissionDenied.${currentPlatform}`;
        const description = t(platformKey, {
          defaultValue: t("errors.micPermissionDenied.generic"),
        });
        toast.error(t("errors.micPermissionDeniedTitle"), { description });
      } else if (error_type === "no_input_device") {
        toast.error(t("errors.noInputDeviceTitle"), {
          description: t("errors.noInputDevice"),
        });
      } else {
        // Details go to the log; people get a plain next step.
        console.error("Recording failed:", detail);
        toast.error(t("ux.errors.recordingFailed"));
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for paste failures and show a toast.
  // The technical error detail is logged to handy.log on the Rust side
  // (see actions.rs `error!("Failed to paste transcription: ...")`),
  // so we show a localized, user-friendly message here instead of the raw error.
  useEffect(() => {
    const unlisten = listen("paste-error", () => {
      toast.error(t("errors.pasteFailedTitle"), {
        description: t("errors.pasteFailed"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for transcription failures and show a toast.
  // The payload is the backend error message (also logged to handy.log).
  useEffect(() => {
    const unlisten = listen<string>("transcription-error", (event) => {
      console.error("Transcription failed:", event.payload);
      toast.error(t("errors.transcriptionFailedTitle"), {
        description: t("ux.errors.transcriptionFailed"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for model loading failures and show a toast
  useEffect(() => {
    const unlisten = listen<ModelStateEvent>("model-state-changed", (event) => {
      if (event.payload.event_type === "loading_failed") {
        console.error("Model failed to load:", event.payload.error);
        toast.error(
          t("errors.modelLoadFailed", {
            model:
              event.payload.model_name || t("errors.modelLoadFailedUnknown"),
          }),
          {
            description: t("ux.errors.modelLoadFailed"),
          },
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  const revealMainWindowForPermissions = async () => {
    try {
      await commands.showMainWindowCommand();
    } catch (e) {
      console.warn("Failed to show main window for permission onboarding:", e);
    }
  };

  const checkOnboardingStatus = async () => {
    try {
      const settingsResult = await commands.getAppSettings();
      const hasCompletedOnboarding =
        settingsResult.status === "ok" &&
        settingsResult.data.onboarding_completed === true;
      const currentPlatform = platform();

      if (hasCompletedOnboarding) {
        // Returning user - check if they need to grant permissions first
        setIsReturningUser(true);

        if (currentPlatform === "macos") {
          try {
            const [hasAccessibility, hasMicrophone] = await Promise.all([
              checkAccessibilityPermission(),
              checkMicrophonePermission(),
            ]);
            if (!hasAccessibility || !hasMicrophone) {
              await revealMainWindowForPermissions();
              setOnboardingStep("accessibility");
              return;
            }
          } catch (e) {
            console.warn("Failed to check macOS permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        if (currentPlatform === "windows") {
          try {
            const microphoneStatus =
              await commands.getWindowsMicrophonePermissionStatus();
            if (
              microphoneStatus.supported &&
              microphoneStatus.overall_access === "denied"
            ) {
              await revealMainWindowForPermissions();
              setOnboardingStep("accessibility");
              return;
            }
          } catch (e) {
            console.warn("Failed to check Windows microphone permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        setOnboardingStep("done");
      } else {
        // New user - start full onboarding
        setIsReturningUser(false);
        setOnboardingStep("accessibility");
      }
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      setOnboardingStep("accessibility");
    }
  };

  const handleAccessibilityComplete = useCallback(() => {
    setSettingsOnly(false);
    // Returning users already have models, skip to main app
    // New users need to select a model
    setOnboardingStep(isReturningUser ? "done" : "model");
  }, [isReturningUser]);

  const handleModelSelected = () => {
    // The engine is ready: one guided dictation before the main app.
    setOnboardingStep("try");
  };

  // Rendered once around every step below (including onboarding) so
  // toast.error() calls surface to the user. sonner renders via a portal, so
  // its position in the tree doesn't affect layout. Without this, errors during
  // onboarding (e.g. a model download failing because blob.handy.computer is
  // unreachable) are silently swallowed and the wizard just appears to "blink".
  const toaster = (
    <Toaster
      theme="system"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "bg-background border border-mid-gray/20 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 text-sm",
          title: "font-medium",
          description: "text-mid-gray",
          actionButton:
            "px-2 py-1 text-xs font-medium rounded-lg border bg-mid-gray/10 border-mid-gray/20 hover:bg-background-ui/30 hover:border-logo-primary cursor-pointer whitespace-nowrap",
        },
      }}
    />
  );

  // Still checking onboarding status
  if (onboardingStep === null) {
    return null;
  }

  // Select the content for the current step. The Toaster is rendered once, in a
  // stable wrapper around this node, so crossing between onboarding steps and
  // the main app never remounts it (which would drop any in-flight toast).
  let content: ReactNode;
  if (onboardingPreview) {
    // Render previews in the same top-level slot as real onboarding. Keeping
    // the settings layout unmounted ensures viewport overflow behaves exactly
    // as it does during first-run onboarding.
    content = (
      <>
        {onboardingPreview === "accessibility" ? (
          <AccessibilityOnboarding onComplete={NOOP} preview />
        ) : (
          <Onboarding onModelSelected={NOOP} preview />
        )}
        <button
          type="button"
          onClick={() => setOnboardingPreview(null)}
          className="fixed top-4 end-4 z-50 rounded-lg border border-mid-gray/20 bg-background px-4 py-2 text-sm font-medium text-text shadow-lg hover:bg-background-ui/30 cursor-pointer"
        >
          {t("settings.debug.onboardingPreview.exitButton")}
        </button>
      </>
    );
  } else if (onboardingStep === "accessibility") {
    content = (
      <AccessibilityOnboarding
        onComplete={handleAccessibilityComplete}
        step={isReturningUser ? undefined : { current: 1, total: 3 }}
        onAsk={isReturningUser ? undefined : markAskedPermissions}
        onExplore={() => {
          setSettingsOnly(true);
          setOnboardingStep("done");
        }}
      />
    );
  } else if (onboardingStep === "model") {
    content = (
      <Onboarding
        onModelSelected={handleModelSelected}
        step={{ current: 1 + setupOffset, total: setupTotal }}
      />
    );
  } else if (onboardingStep === "try") {
    content = (
      <TryItStep
        onDone={() => setOnboardingStep("done")}
        step={{ current: 2 + setupOffset, total: setupTotal }}
      />
    );
  } else {
    content = (
      <div
        dir={direction}
        className="h-screen flex flex-col select-none cursor-default"
      >
        <a
          href="#main-content"
          className="skip-link"
          onClick={(event) => {
            event.preventDefault();
            const main = mainRef.current;
            if (!main) return;
            const heading = main.querySelector<HTMLElement>("h1, h2");
            const target = heading ?? main;
            if (!target.hasAttribute("tabindex"))
              target.setAttribute("tabindex", "-1");
            target.focus();
          }}
        >
          {t("ux.skipToContent")}
        </a>
        <ErrorBoundary context="What's New">
          <WhatsNewGate />
        </ErrorBoundary>
        {/* Main content area that takes remaining space */}
        <div className="app-workspace flex-1 flex overflow-hidden">
          <Sidebar
            activeSection={currentSection}
            onSectionChange={setCurrentSection}
          />
          {/* Scrollable content area */}
          <div className="settings-content flex-1 min-w-0 flex flex-col overflow-hidden">
            <div ref={scrollerRef} className="flex-1 overflow-y-auto">
              <div className="page-frame flex flex-col items-center gap-4">
                {settingsOnly ? (
                  <div
                    role="status"
                    className="w-full max-w-3xl rounded-xl border border-mid-gray/30 p-3 text-sm flex flex-wrap items-center gap-3"
                  >
                    <p className="flex-1">{t("controls.setupNotice")}</p>
                    <button
                      type="button"
                      className="brand-action rounded-lg px-3 py-2"
                      onClick={() => setOnboardingStep("accessibility")}
                    >
                      {t("controls.finishSetup")}
                    </button>
                  </div>
                ) : (
                  <AccessibilityPermissions />
                )}
                <SecureInputWarning />
                <NavigateContext.Provider value={setCurrentSection}>
                  <div
                    ref={mainRef}
                    id="main-content"
                    role="region"
                    tabIndex={-1}
                    aria-label={t(SECTIONS_CONFIG[currentSection].labelKey)}
                    className="section-content w-full flex flex-col items-center gap-4"
                  >
                    {/* One broken screen must not blank the whole window;
                        switching sections resets the boundary. */}
                    <ErrorBoundary
                      key={currentSection}
                      context={currentSection}
                    >
                      {renderSettingsContent(
                        currentSection,
                        setOnboardingPreview,
                        setCurrentSection,
                      )}
                    </ErrorBoundary>
                  </div>
                </NavigateContext.Provider>
              </div>
            </div>
          </div>
        </div>
        {/* Fixed footer at bottom */}
        <Footer />
      </div>
    );
  }

  return (
    <>
      {toaster}
      {content}
    </>
  );
}

export default App;
