//! Nonactivating dock: clicking Record must not steal the destination app's focus.
use tauri::{AppHandle, Manager};
#[cfg(target_os = "macos")]
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelBuilder, PanelLevel, StyleMask};
#[cfg(target_os = "macos")]
tauri_panel! { panel!(SayLessDockPanel { config: { can_become_key_window: false, is_floating_panel: true } }) }

pub fn set_visible(app: &AppHandle, visible: bool) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if !visible {
            if let Some(w) = handle.get_webview_window("say_less_dock") {
                let _ = w.hide();
            }
            return;
        }
        if handle.get_webview_window("say_less_dock").is_none() {
            #[cfg(target_os = "macos")]
            {
                let result = PanelBuilder::<_, SayLessDockPanel>::new(&handle, "say_less_dock")
                    .url(tauri::WebviewUrl::App("src/dock/index.html".into()))
                    .title("Say Less — Floating dock")
                    .size(tauri::Size::Logical(tauri::LogicalSize {
                        width: 360.0,
                        height: 96.0,
                    }))
                    .position(tauri::Position::Logical(tauri::LogicalPosition {
                        x: 120.0,
                        y: 120.0,
                    }))
                    .level(PanelLevel::Floating)
                    .has_shadow(false)
                    .hides_on_deactivate(false)
                    .transparent(true)
                    .no_activate(true)
                    .style_mask(StyleMask::empty().borderless().nonactivating_panel())
                    .with_window(|w| {
                        w.decorations(false)
                            .transparent(true)
                            .focusable(false)
                            .visible(false)
                    })
                    .collection_behavior(
                        CollectionBehavior::new()
                            .can_join_all_spaces()
                            .full_screen_auxiliary(),
                    )
                    .build();
                if let Err(e) = result {
                    log::warn!("Cannot create floating dock: {e}");
                    return;
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                if let Err(e) = tauri::WebviewWindowBuilder::new(
                    &handle,
                    "say_less_dock",
                    tauri::WebviewUrl::App("src/dock/index.html".into()),
                )
                .title("Say Less — Floating dock")
                .inner_size(360.0, 96.0)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .build()
                {
                    log::warn!("Cannot create floating dock: {e}");
                    return;
                }
            }
        }
        if let Some(window) = handle.get_webview_window("say_less_dock") {
            // Use Tauri's show/resize path, as the recording overlay does, so
            // WebKit is laid out and resumed along with the native panel.
            let _ = window.set_size(tauri::LogicalSize::new(360.0, 96.0));
            let _ = window.show();
        }
    })
    .map_err(|_| "dock_failed".into())
}
#[tauri::command]
#[specta::specta]
pub fn dock_toggle_recording(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "ApplicationServices", kind = "framework")]
        unsafe extern "C" {
            fn AXIsProcessTrusted() -> bool;
        }
        if !unsafe { AXIsProcessTrusted() } {
            return Err("permissions_required".into());
        }
    }
    crate::signal_handle::send_transcription_input(&app, "transcribe", "floating-dock");
    Ok(())
}
