//! Voice commands on selected text.
//!
//! Select text anywhere, hold the "Rewrite selected text" shortcut and say
//! what to do with it ("make this shorter", "turn this into bullet points").
//! The flow, in order:
//!
//! 1. The shortcut records like a normal dictation; the transcript is the
//!    instruction.
//! 2. `run` copies the selection with the copy chord (the user's clipboard is
//!    put back right after), then sends selection plus instruction through the
//!    cleanup provider the user already set up (own key, Apple Intelligence or
//!    Ollama). Text only, never audio.
//! 3. `present` shows the rewrite in a small preview window that never takes
//!    focus, and registers Enter and Esc as global shortcuts while it is open.
//! 4. Enter (`apply`) pastes the rewrite over the selection with the normal
//!    paste path, which restores the clipboard afterwards. Esc (`dismiss`)
//!    leaves the text alone.

use crate::settings::{get_settings, ShortcutBinding};
use crate::shortcut;
use log::{debug, error, warn};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(not(target_os = "macos"))]
use tauri::WebviewWindowBuilder;

#[cfg(target_os = "macos")]
use tauri::WebviewUrl;

#[cfg(target_os = "macos")]
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelBuilder, PanelLevel, StyleMask};

#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(CommandPreviewPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

pub const WINDOW_LABEL: &str = "command_preview";
pub const APPLY_BINDING_ID: &str = "voice_command_apply";
pub const DISMISS_BINDING_ID: &str = "voice_command_dismiss";
const PREVIEW_EVENT: &str = "voice-command-preview";

/// Logical window size. The card inside is CSS-sized; this only has to fit it.
const PREVIEW_WIDTH: f64 = 480.0;
const PREVIEW_HEIGHT: f64 = 260.0;

/// An error preview closes itself; a ready preview waits for Enter or Esc.
const ERROR_LINGER: Duration = Duration::from_secs(6);

/// The rewrite waiting for the user's decision.
pub struct VoiceCommandState {
    pending: Mutex<Option<String>>,
    /// Bumped on every show so a delayed hide from an older error preview
    /// cannot close a newer one.
    generation: AtomicU64,
}

impl VoiceCommandState {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(None),
            generation: AtomicU64::new(0),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Preview {
    pub instruction: String,
    pub selection: String,
    pub result: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandError {
    NothingHeard,
    NoSelection,
    NoProvider,
    ProviderFailed,
}

#[derive(Clone, Serialize)]
struct PreviewPayload {
    status: &'static str,
    instruction: String,
    selection: String,
    result: String,
    error: Option<CommandError>,
}

/// The prompt stored in history next to the instruction, so the entry reads
/// as a command and not as a dictation.
pub fn history_prompt(instruction: &str) -> String {
    format!("Voice command on selected text: {}", instruction.trim())
}

/// The prompt sent to the provider. `${output}` stands for the selected text;
/// the provider path fills it in (or drops it for structured output, where the
/// text travels as the user message).
pub(crate) fn rewrite_prompt(instruction: &str) -> String {
    format!(
        "Rewrite the text below by following this instruction: {}\n\
         Keep the language of the text. Keep names, numbers and facts unless the instruction changes them. \
         If the instruction asks a question about the text, reply with the answer in place of the text. \
         Do not add commentary, quotes or a preamble. Return only the resulting text.\n${{output}}",
        instruction.trim()
    )
}

fn is_blank(text: &str) -> bool {
    text.trim().is_empty()
}

/// Copies the selection on the main thread (the copy chord needs it on macOS)
/// and waits for the answer here, off the main thread.
async fn capture_selection(app: &AppHandle) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = app.clone();
    if let Err(err) = app.run_on_main_thread(move || {
        let _ = tx.send(crate::clipboard::copy_selection(&handle));
    }) {
        error!("Could not copy the selection on the main thread: {err:?}");
        return None;
    }
    let received =
        tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(3))).await;
    match received {
        Ok(Ok(Ok(selection))) => selection.filter(|text| !is_blank(text)),
        Ok(Ok(Err(err))) => {
            error!("Copying the selection failed: {err}");
            None
        }
        Ok(Err(_)) => {
            warn!("Copying the selection timed out");
            None
        }
        Err(err) => {
            error!("Selection copy task panicked: {err}");
            None
        }
    }
}

/// Runs one voice command: copy the selection, ask the provider, remember
/// the rewrite for `apply`. Nothing is pasted here.
pub async fn run(app: &AppHandle, instruction: &str) -> Result<Preview, CommandError> {
    if is_blank(instruction) {
        return Err(CommandError::NothingHeard);
    }

    let settings = get_settings(app);
    let Some(provider) = settings.active_post_process_provider().cloned() else {
        return Err(CommandError::NoProvider);
    };
    let model = settings
        .post_process_models
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();
    if model.trim().is_empty() {
        return Err(CommandError::NoProvider);
    }

    let Some(selection) = capture_selection(app).await else {
        return Err(CommandError::NoSelection);
    };
    debug!(
        "Voice command: {} chars selected, instruction '{}'",
        selection.len(),
        crate::utils::redact_text(instruction)
    );

    let prompt = rewrite_prompt(instruction);
    let Some(result) =
        crate::actions::run_text_prompt(&settings, &provider, &model, &prompt, &selection).await
    else {
        return Err(CommandError::ProviderFailed);
    };
    if is_blank(&result) {
        return Err(CommandError::ProviderFailed);
    }

    if let Some(state) = app.try_state::<VoiceCommandState>() {
        if let Ok(mut pending) = state.pending.lock() {
            *pending = Some(result.clone());
        }
    }

    Ok(Preview {
        instruction: instruction.trim().to_string(),
        selection,
        result,
    })
}

/// Shows the outcome. A rewrite waits for Enter or Esc; an error explains
/// itself and goes away on its own.
pub fn present(app: &AppHandle, outcome: Result<Preview, CommandError>) {
    let (payload, ready) = match outcome {
        Ok(preview) => (
            PreviewPayload {
                status: "ready",
                instruction: preview.instruction,
                selection: preview.selection,
                result: preview.result,
                error: None,
            },
            true,
        ),
        Err(error) => (
            PreviewPayload {
                status: "error",
                instruction: String::new(),
                selection: String::new(),
                result: String::new(),
                error: Some(error),
            },
            false,
        ),
    };

    let generation = app
        .try_state::<VoiceCommandState>()
        .map(|state| state.generation.fetch_add(1, Ordering::SeqCst) + 1)
        .unwrap_or(0);

    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window(WINDOW_LABEL) {
            if let Some((x, y)) =
                crate::overlay::calculate_overlay_position(&handle, PREVIEW_WIDTH, PREVIEW_HEIGHT)
            {
                let _ =
                    window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
            }
            let _ = window.emit(PREVIEW_EVENT, payload);
            let _ = window.show();
        } else {
            warn!("Voice command preview window is missing; showing nothing");
        }
    });

    if ready {
        register_decision_shortcuts(app);
    } else {
        let handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(ERROR_LINGER);
            let current = handle
                .try_state::<VoiceCommandState>()
                .map(|state| state.generation.load(Ordering::SeqCst))
                .unwrap_or(0);
            if current == generation {
                hide(&handle);
            }
        });
    }
}

/// Enter: paste the rewrite over the selection. The paste path restores the
/// clipboard afterwards, the same as a normal dictation.
pub fn apply(app: &AppHandle) {
    let result = app
        .try_state::<VoiceCommandState>()
        .and_then(|state| state.pending.lock().ok().and_then(|mut p| p.take()));
    unregister_decision_shortcuts(app);
    hide(app);
    let Some(result) = result else {
        debug!("Voice command apply with nothing pending");
        return;
    };
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || match crate::utils::paste(result, handle.clone()) {
        Ok(()) => debug!("Voice command rewrite pasted"),
        Err(err) => {
            error!("Failed to paste the voice command rewrite: {err}");
            let _ = handle.emit("paste-error", ());
        }
    });
}

/// Esc: keep the original text.
pub fn dismiss(app: &AppHandle) {
    if let Some(state) = app.try_state::<VoiceCommandState>() {
        if let Ok(mut pending) = state.pending.lock() {
            *pending = None;
        }
    }
    unregister_decision_shortcuts(app);
    hide(app);
}

fn hide(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window(WINDOW_LABEL) {
            let _ = window.hide();
        }
    });
}

fn decision_bindings() -> [ShortcutBinding; 2] {
    let binding = |id: &str, key: &str, name: &str| ShortcutBinding {
        id: id.to_string(),
        name: name.to_string(),
        description: String::new(),
        default_binding: key.to_string(),
        current_binding: key.to_string(),
    };
    [
        binding(APPLY_BINDING_ID, "enter", "Replace selection"),
        binding(DISMISS_BINDING_ID, "escape", "Keep original"),
    ]
}

/// Enter and Esc are only global while a preview is on screen, the same way
/// the cancel shortcut only exists while recording.
fn register_decision_shortcuts(app: &AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        for binding in decision_bindings() {
            if let Err(err) = shortcut::register_shortcut(&handle, binding.clone()) {
                warn!(
                    "Could not register {} for the voice command preview: {err}",
                    binding.current_binding
                );
            }
        }
    });
}

fn unregister_decision_shortcuts(app: &AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        for binding in decision_bindings() {
            if let Err(err) = shortcut::unregister_shortcut(&handle, binding) {
                debug!("Voice command shortcut was not registered: {err}");
            }
        }
    });
}

/// Creates the preview window hidden at startup (Windows, Linux).
#[cfg(not(target_os = "macos"))]
pub fn create_preview_window(app: &AppHandle) {
    let mut builder = WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL,
        tauri::WebviewUrl::App("src/command/index.html".into()),
    )
    .title("Rewrite preview")
    .resizable(false)
    .inner_size(PREVIEW_WIDTH, PREVIEW_HEIGHT)
    .shadow(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .accept_first_mouse(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .transparent(true)
    .focusable(false)
    .focused(false)
    .visible(false);

    if let Some(data_dir) = crate::portable::data_dir() {
        builder = builder.data_directory(data_dir.join("webview"));
    }

    if let Err(err) = builder.build() {
        error!("Failed to create the voice command preview window: {err}");
    }
}

/// Creates the preview panel hidden at startup (macOS). A non-activating
/// panel, like the recording overlay, so the app the user is working in keeps
/// focus and the paste lands there.
#[cfg(target_os = "macos")]
pub fn create_preview_window(app: &AppHandle) {
    let (x, y) = crate::overlay::calculate_overlay_position(app, PREVIEW_WIDTH, PREVIEW_HEIGHT)
        .unwrap_or((0.0, 0.0));
    match PanelBuilder::<_, CommandPreviewPanel>::new(app, WINDOW_LABEL)
        .url(WebviewUrl::App("src/command/index.html".into()))
        .title("Rewrite preview")
        .position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))
        .level(PanelLevel::Status)
        .size(tauri::Size::Logical(tauri::LogicalSize {
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
        }))
        .has_shadow(false)
        .transparent(true)
        .no_activate(true)
        .corner_radius(0.0)
        .style_mask(StyleMask::empty().borderless().nonactivating_panel())
        .with_window(|w| w.decorations(false).transparent(true).focusable(false))
        .collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .full_screen_auxiliary(),
        )
        .build()
    {
        Ok(panel) => panel.hide(),
        Err(err) => error!("Failed to create the voice command preview panel: {err}"),
    }
}

#[tauri::command]
#[specta::specta]
pub fn apply_voice_command(app: AppHandle) {
    apply(&app);
}

#[tauri::command]
#[specta::specta]
pub fn dismiss_voice_command(app: AppHandle) {
    dismiss(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_prompt_carries_the_instruction_and_output_slot() {
        let prompt = rewrite_prompt("  make this shorter ");
        assert!(prompt.starts_with(
            "Rewrite the text below by following this instruction: make this shorter\n"
        ));
        assert!(prompt.ends_with("${output}"));
    }

    #[test]
    fn history_prompt_names_the_command() {
        assert_eq!(
            history_prompt(" make it formal "),
            "Voice command on selected text: make it formal"
        );
    }
}
