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
                        width: 400.0,
                        height: 132.0,
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
                .inner_size(400.0, 132.0)
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
            let compact = crate::studio::get_studio_settings(handle.clone())
                .map(|s| s.dock_compact)
                .unwrap_or(true);
            let (width, height) = if compact {
                (104.0, 104.0)
            } else {
                (360.0, 112.0)
            };
            let _ = window.set_size(tauri::LogicalSize::new(width, height));
            let _ = snap_to_edge(&handle);
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

/// Place inside the current monitor work area, respecting Retina scale.
pub fn snap_to_edge(app: &AppHandle) -> Result<(), String> {
    let settings = crate::studio::get_studio_settings(app.clone())?;
    if settings.dock_edge == "free" {
        return Ok(());
    }
    let window = app
        .get_webview_window("say_less_dock")
        .ok_or("dock_missing")?;
    let monitor = window
        .current_monitor()
        .map_err(|_| "monitor")?
        .ok_or("monitor")?;
    let area = monitor.work_area();
    let size = window.outer_size().map_err(|_| "size")?;
    let margin = (12.0 * monitor.scale_factor()) as i32;
    let left = area.position.x + margin;
    let right = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let x = if settings.dock_edge == "left" {
        left
    } else {
        right.max(left)
    };
    let y = area.position.y + ((area.size.height as i32 - size.height as i32) / 2).max(0);
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|_| "position".into())
}

static ACTIVITY: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);
pub fn remember_state(state: u8) {
    ACTIVITY.store(state, std::sync::atomic::Ordering::Relaxed);
}
#[tauri::command]
#[specta::specta]
pub fn get_dock_state() -> String {
    match ACTIVITY.load(std::sync::atomic::Ordering::Relaxed) {
        1 => "recording",
        2 => "transcribing",
        _ => "idle",
    }
    .into()
}
