// Test-only renderer. This file is not a production entry point and never
// grants real OS permissions or calls a microphone, provider, or clipboard.
import React from "react";
import ReactDOM from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../src/App.css";

const query = new URLSearchParams(location.search);
Object.assign(window, {
  __TAURI_OS_PLUGIN_INTERNALS__: {
    platform: "macos",
    os_type: "macos",
    arch: "aarch64",
    family: "unix",
    eol: "\n",
    version: "15",
  },
});
const settings = {
  onboarding_completed: true,
  selected_model: "test-model",
  app_language: "en",
  theme: query.get("theme") || "dark",
  show_whats_new_on_update: false,
  bindings: Object.fromEntries(
    ["transcribe", "cancel", "transcribe_with_post_process"].map((id) => [
      id,
      {
        id,
        name: id,
        description: "",
        current_binding: id === "cancel" ? "Escape" : "option+space",
        default_binding: "option+space",
      },
    ]),
  ),
  shortcut_activation: "auto",
  hold_threshold_ms: 200,
  selected_language: "auto",
  audio_feedback: true,
  audio_feedback_volume: 0.5,
  sound_theme: "pop",
  selected_microphone: "default",
  selected_output_device: "default",
  custom_words: [],
  post_process_enabled: false,
  post_process_prompts: [],
  post_process_providers: [],
  post_process_api_keys: {},
  post_process_models: {},
  post_process_provider_id: "openai",
  show_tray_icon: true,
  model_unload_timeout: "min5",
  paste_method: "ctrl_v",
  clipboard_handling: "dont_modify",
  auto_submit_key: "enter",
  overlay_style: "live",
  overlay_position: "bottom",
  history_limit: 5,
  recording_retention_period: "latest5",
  vad_backend: "silero",
  vad_enabled: true,
  filler_word_removal_enabled: false,
  experimental_enabled: false,
  debug_mode: false,
};
let snippets = JSON.parse(localStorage.getItem("test-snippets") || "[]");
mockWindows("main");
mockIPC((cmd, payload) => {
  const calls = ((
    window as unknown as { testCommands: string[] }
  ).testCommands ??= []);
  calls.push(cmd);
  if (cmd.startsWith("plugin:event|")) return 1;
  if (cmd === "plugin:os|locale") return "en-US";
  if (cmd === "plugin:app|version") return "0.9.9";
  if (
    cmd.includes("check_accessibility_permission") ||
    cmd.includes("check_microphone_permission")
  )
    return !query.has("noPermissions");
  if (cmd === "get_app_settings" || cmd === "get_default_settings")
    return settings;
  if (cmd === "get_current_model") return "test-model";
  if (cmd === "get_available_models")
    return [
      {
        id: "test-model",
        name: "Nemotron Streaming 3.5",
        is_downloaded: true,
        supported_languages: ["en", "es", "fr"],
        supports_language_selection: true,
        supports_language_detection: true,
        supports_streaming: true,
      },
    ];
  if (cmd === "get_model_load_status")
    return { state: "unloaded", model_id: null };
  if (
    query.has("stallDevices") &&
    (cmd === "get_available_microphones" ||
      cmd === "get_available_output_devices")
  )
    return new Promise(() => {});
  if (
    cmd === "get_available_microphones" ||
    cmd.includes("audio_devices") ||
    cmd.includes("output_devices")
  )
    return [{ index: "default", name: "Default microphone", is_default: true }];
  if (cmd === "get_microphone_channels") return 1;
  if (cmd === "check_custom_sounds") return { start: false, stop: false };
  if (cmd === "get_secure_input_status") return { enabled: false, owner: null };
  if (cmd === "list_voice_snippets") {
    if (query.has("failLoad")) throw "storage";
    return snippets;
  }
  if (cmd === "save_voice_snippets") {
    if (query.has("failSave")) throw "storage";
    const next = payload?.snippets as typeof snippets;
    if (
      new Set(next.map((s: { trigger: string }) => s.trigger.toLowerCase()))
        .size !== next.length
    )
      throw "duplicate";
    snippets = next;
    localStorage.setItem("test-snippets", JSON.stringify(next));
    return null;
  }
  if (cmd === "preview_voice_snippets")
    return "Preview returned by the test IPC adapter";
  if (cmd === "change_filler_word_removal_enabled_setting") {
    if (query.has("failSetting")) throw "rejected";
    settings.filler_word_removal_enabled = Boolean(payload?.enabled);
    return null;
  }
  if (cmd === "update_custom_words") {
    settings.custom_words = payload?.words as never[];
    return null;
  }
  if (cmd === "get_history_entries") return { entries: [], has_more: false };
  return null;
});
const { default: App } = await import("../../src/App");
await import("../../src/i18n");
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
