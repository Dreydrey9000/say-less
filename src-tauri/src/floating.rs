//! Nonactivating dock: clicking Record must not steal the destination app's focus.
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
#[cfg(target_os = "macos")]
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelBuilder, PanelLevel, StyleMask};
#[cfg(target_os = "macos")]
tauri_panel! { panel!(SayLessDockPanel { config: { can_become_key_window: false, is_floating_panel: true } }) }

const COMPACT_SIZE: (f64, f64) = (104.0, 104.0);
const ACTIVE_SIZE: (f64, f64) = (220.0, 104.0);
static ACTIVE_PRESENTATION: AtomicBool = AtomicBool::new(false);

fn dock_size(compact: bool) -> (f64, f64) {
    if !compact {
        (460.0, 112.0)
    } else if ACTIVE_PRESENTATION.load(Ordering::Relaxed) {
        ACTIVE_SIZE
    } else {
        COMPACT_SIZE
    }
}

fn resize_dock(app: &AppHandle, compact: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("say_less_dock")
        .ok_or("dock_missing")?;
    let old_size = window.outer_size().map_err(|_| "size")?;
    let old_position = window.outer_position().map_err(|_| "position")?;
    let (width, height) = dock_size(compact);
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|_| "size")?;
    let new_size = window.outer_size().map_err(|_| "size")?;
    let settings = crate::studio::get_studio_settings(app.clone())?;
    if settings.dock_edge == "free" && old_size.width != new_size.width {
        let centered_x = old_position.x + (old_size.width as i32 - new_size.width as i32) / 2;
        window
            .set_position(tauri::PhysicalPosition::new(centered_x, old_position.y))
            .map_err(|_| "position")?;
    }
    place_dock(app)
}

/// The compact dock grows into an island only while it has a real activity to show.
#[tauri::command]
#[specta::specta]
pub fn dock_set_presentation(app: AppHandle, wide: bool) -> Result<(), String> {
    ACTIVE_PRESENTATION.store(wide, Ordering::Relaxed);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let settings = crate::studio::get_studio_settings(handle.clone());
        if let Ok(settings) = settings {
            if settings.floating
                && settings.dock_compact
                && handle.get_webview_window("say_less_dock").is_some()
            {
                if let Err(error) = resize_dock(&handle, true) {
                    log::warn!("Cannot resize active dock: {error}");
                }
            }
        }
    })
    .map_err(|_| "dock_failed".into())
}

pub fn set_visible(app: &AppHandle, visible: bool) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        // A quick off/on can queue several callbacks. Honor the latest saved
        // preference, so an older callback cannot hide the newly shown dock.
        let should_show = crate::studio::get_studio_settings(handle.clone())
            .map(|settings| settings.floating)
            .unwrap_or(visible);
        if !should_show {
            if let Some(w) = handle.get_webview_window("say_less_dock") {
                if let Err(error) = w.hide() {
                    log::warn!("Cannot hide floating dock: {error}");
                }
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
                        width: 460.0,
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
                .inner_size(460.0, 132.0)
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
            if let Err(error) = resize_dock(&handle, compact) {
                log::warn!("Cannot resize or place floating dock: {error}");
            }
            if let Err(error) = window.show() {
                log::warn!("Cannot show floating dock: {error}");
            }
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
pub fn place_dock(app: &AppHandle) -> Result<(), String> {
    let settings = crate::studio::get_studio_settings(app.clone())?;
    let window = app
        .get_webview_window("say_less_dock")
        .ok_or("dock_missing")?;
    let monitor = window
        .current_monitor()
        .map_err(|_| "monitor")?
        .or(app.primary_monitor().map_err(|_| "monitor")?)
        .ok_or("monitor")?;
    let area = monitor.work_area();
    let size = window.outer_size().map_err(|_| "size")?;
    let margin = (12.0 * monitor.scale_factor()) as i32;
    let left = area.position.x + margin;
    let top = area.position.y + margin;
    let right = (area.position.x + area.size.width as i32 - size.width as i32 - margin).max(left);
    let bottom = (area.position.y + area.size.height as i32 - size.height as i32 - margin).max(top);
    let (x, y) = if settings.dock_edge == "free" {
        let current = window.outer_position().map_err(|_| "position")?;
        (current.x.clamp(left, right), current.y.clamp(top, bottom))
    } else {
        let x = if settings.dock_edge == "left" {
            left
        } else {
            right
        };
        let y = area.position.y + ((area.size.height as i32 - size.height as i32) / 2).max(0);
        (x, y.clamp(top, bottom))
    };
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
