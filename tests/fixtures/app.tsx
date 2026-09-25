// Test-only renderer. This file is not a production entry point and never
// grants real OS permissions or calls a microphone, provider, or clipboard.
import React from "react";
import ReactDOM from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../src/App.css";

const query = new URLSearchParams(location.search);
const defaultStudio = {
  accent: "#b8ff65",
  floating: false,
  actions_enabled: false,
  actions: [],
  default_style: "original",
  app_styles: [],
  cleanup_on_dictation: false,
  dock_animation: "orbit",
  dock_motion: true,
  dock_cycle: false,
  dock_edge: "free",
  dock_compact: false,
  dock_character: "emblem",
  learn_corrections: false,
  corrections: [],
  overlay_visual: "bars",
  avatar: {
    kind: "person",
    body: "#e2b48f",
    accent: "#8796ab",
    background: "#22262e",
    accessory: "none",
  },
};
let studio = JSON.parse(
  localStorage.getItem("test-studio") || JSON.stringify(defaultStudio),
);
let imported = false;
let learned = query.has("learned")
  ? [{ trigger: "Louise", expansion: "Luis", observations: 1, active: false }]
  : [];
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
  shortcut_activation: "hold_or_toggle",
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
const ipc: Parameters<typeof mockIPC>[0] = (cmd, payload) => {
  const calls = ((
    window as unknown as { testCommands: string[] }
  ).testCommands ??= []);
  calls.push(cmd);
  if (cmd === "get_dock_state") return "idle";
  if (cmd === "list_learned_corrections") return learned;
  if (cmd === "review_learned_correction") {
    if (query.has("failLearning")) throw "storage";
    if (payload?.keep)
      learned = learned.map((row) => ({ ...row, active: true }));
    else learned = [];
    return null;
  }
  if (cmd === "get_studio_settings") return studio;
  if (cmd === "save_studio_settings") {
    if (query.has("failStudio")) throw "storage";
    studio = payload?.settings;
    localStorage.setItem("test-studio", JSON.stringify(studio));
    return null;
  }
  if (cmd === "list_launchable_apps")
    return ["/System/Applications/Notes.app", "/Applications/Safari.app"];
  if (cmd === "test_voice_action") {
    if (query.has("failAction")) throw "launch_failed";
    return null;
  }
  if (cmd === "preview_wispr_import") {
    if (query.has("failImport")) throw "unsupported_schema";
    return {
      words: imported ? [] : ["ExampleName"],
      snippets: imported
        ? []
        : [{ trigger: "my example", expansion: "Example saved text" }],
      skipped: imported ? 2 : 1,
      history_count: 2,
      fingerprint: "test",
    };
  }
  if (cmd === "apply_wispr_import") {
    imported = true;
    return {
      words_added: 1,
      snippets_added: 1,
      history_added: payload?.includeHistory ? 2 : 0,
      history_error: false,
    };
  }
  if (cmd === "list_imported_history")
    return imported
      ? [{ id: "test", text: "Imported example only", timestamp: "2026-09-22" }]
      : [];
  if (cmd.startsWith("plugin:event|")) return 1;
  if (cmd === "plugin:os|locale") return "en-US";
  if (cmd === "plugin:app|version") return "0.12.0";
  if (
    cmd.includes("check_accessibility_permission") ||
    cmd.includes("check_microphone_permission")
  )
    return (
      !query.has("noPermissions") ||
      sessionStorage.getItem("test-permissions") === "granted"
    );
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
  if (cmd === "get_history_entries") {
    if (query.has("failHistory") && !sessionStorage.getItem("historyRecovered"))
      throw "history_unavailable";
    return { entries: [], has_more: false };
  }
  // Say less, stress less (Insights) — fixture data only.
  if (cmd === "get_insights") {
    const day = 86_400;
    const now = 1_790_000_000;
    const topic = (id: string, kind: string, count: number, quote: string) => ({
      id,
      label: id.replace(/-/g, " "),
      keywords: [],
      kind,
      count,
      first_seen: now - 20 * day,
      last_seen: now - day,
      examples: [{ entry_id: count, timestamp: now - day, text: quote }],
      entry_ids: [],
    });
    if (query.has("fewHistory"))
      return {
        window_days: payload?.days ?? null,
        analyzed_entries: 2,
        generated_at: now,
        problems: [],
        ideas: [],
        other: [],
        fix_first: null,
      };
    const problem = topic(
      "video-export-audio",
      "problem",
      27,
      "The video export audio is broken again",
    );
    return {
      window_days: payload?.days ?? null,
      analyzed_entries: 140,
      generated_at: now,
      problems: [problem],
      ideas: [
        topic(
          "grocery-receipt",
          "idea",
          3,
          "An app that turns grocery receipts into meal plans",
        ),
      ],
      other: [],
      fix_first: problem,
    };
  }
  if (cmd === "search_history_text")
    return String(payload?.query).includes("export")
      ? [{ id: 9, timestamp: 1_790_000_000, text: "Export audio broke again" }]
      : [];
  if (cmd === "get_insights_settings")
    return {
      export_enabled: false,
      export_folder: null,
      last_export_at: null,
      last_export_error: null,
    };
  if (cmd === "save_insights_settings")
    return {
      export_enabled: Boolean(payload?.exportEnabled),
      export_folder: payload?.exportFolder ?? null,
      last_export_at: null,
      last_export_error: null,
    };
  if (cmd === "get_default_notes_folder")
    return "/Users/test/Documents/Say Less Notes";
  if (cmd === "export_notes_now")
    return {
      folder: "/Users/test/Documents/Say Less Notes",
      written: 4,
      unchanged: 0,
      skipped: [],
      days: 3,
    };
  if (cmd === "get_ai_summary_status")
    return { available: false, provider_label: null };
  if (cmd === "get_mcp_setup")
    return {
      binary_path: "/Applications/Say Less.app/Contents/MacOS/handy",
      config_json:
        '{\n  "mcpServers": {\n    "say-less": {\n      "command": "/Applications/Say Less.app/Contents/MacOS/handy",\n      "args": ["--mcp"]\n    }\n  }\n}',
      claude_command:
        'claude mcp add say-less -- "/Applications/Say Less.app/Contents/MacOS/handy" --mcp',
    };
  return null;
};
// The overlay listens for backend events; tests drive it with `testEmit`.
mockIPC(ipc, { shouldMockEvents: query.has("overlay") });
const { default: App } = await import("../../src/App");
await import("../../src/i18n");
const { applyTheme } = await import("../../src/lib/utils/theme");
applyTheme(settings.theme as "dark" | "light");
if (query.has("dock")) {
  await import("../../src/dock/main");
} else if (query.has("overlay")) {
  const { emit } = await import("@tauri-apps/api/event");
  Object.assign(window, { testEmit: emit });
  await import("../../src/overlay/main");
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
}
