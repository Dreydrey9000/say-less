//! Nonactivating dock: clicking Record must not steal the destination app's focus.
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "macos")]
use std::time::Duration;
use tauri::{AppHandle, Manager};
#[cfg(target_os = "macos")]
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelBuilder, PanelLevel, StyleMask};
#[cfg(target_os = "macos")]
tauri_panel! { panel!(SayLessDockPanel { config: { can_become_key_window: false, can_become_main_window: false, is_floating_panel: true } }) }

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
    let monitor = window
        .current_monitor()
        .map_err(|_| "monitor")?
        .or(app.primary_monitor().map_err(|_| "monitor")?)
        .ok_or("monitor")?;
    let current = window.outer_position().map_err(|_| "position")?;
    let settings = crate::studio::get_studio_settings(app.clone())?;
    let (width, height) = dock_size(compact);
    let target_size: tauri::PhysicalSize<u32> =
        tauri::LogicalSize::new(width, height).to_physical(monitor.scale_factor());
    let target_position = dock_position(
        monitor.work_area(),
        target_size,
        current,
        &settings.dock_edge,
        compact,
        monitor.scale_factor(),
    );
    // Tauri queues the resize. Reading outer_size() immediately afterward can
    // return the old width and leave a right-anchored panel mostly offscreen.
    // Place from the requested physical size instead.
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|_| "size")?;
    window
        .set_position(target_position)
        .map_err(|_| "position".into())
}

/// Grow the compact panel for an active status or its attached control rail.
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
                    // Build hidden and non-focusable before converting to NSPanel.
                    // no_activate temporarily switches the whole app to Prohibited,
                    // which can disrupt visible windows when enabled from Settings.
                    .style_mask(StyleMask::empty().borderless().nonactivating_panel())
                    .with_window(|w| {
                        w.decorations(false)
                            .transparent(true)
                            .focused(false)
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

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn CGEventSourceButtonState(state_id: i32, button: i32) -> bool;
}

#[cfg(target_os = "macos")]
fn left_mouse_button_down() -> bool {
    // kCGEventSourceStateCombinedSessionState and kCGMouseButtonLeft are both 0.
    // This checks the real mouse state; startDragging() only queues a window
    // message and its JavaScript Promise can resolve before the drag finishes.
    unsafe { CGEventSourceButtonState(0, 0) }
}

/// Resolve a dock drag only after the mouse is released, using the final
/// native panel position. The caller persists the returned placement.
#[tauri::command]
#[specta::specta]
#[cfg(not(target_os = "macos"))]
pub async fn dock_finish_drag(_app: AppHandle) -> Result<String, String> {
    Err("dock_drag_snap_unsupported".into())
}

#[tauri::command]
#[specta::specta]
#[cfg(target_os = "macos")]
pub async fn dock_finish_drag(app: AppHandle) -> Result<String, String> {
    let started = tokio::time::Instant::now();
    while left_mouse_button_down() {
        if started.elapsed() > Duration::from_secs(60) {
            return Err("dock_drag_timeout".into());
        }
        tokio::time::sleep(Duration::from_millis(16)).await;
    }
    // The final WindowMoved event can land just after the button transition.
    tokio::time::sleep(Duration::from_millis(50)).await;
    let settings = crate::studio::get_studio_settings(app.clone())?;
    let window = app
        .get_webview_window("say_less_dock")
        .ok_or("dock_missing")?;
    let monitor = window
        .current_monitor()
        .map_err(|_| "monitor")?
        .or(app.primary_monitor().map_err(|_| "monitor")?)
        .ok_or("monitor")?;
    let position = window.outer_position().map_err(|_| "position")?;
    let size = window.outer_size().map_err(|_| "size")?;
    let edge = nearest_dock_edge(
        monitor.work_area(),
        position,
        size,
        monitor.scale_factor(),
        &settings.dock_edge,
        settings.dock_compact,
    );
    // Switching from a right-aligned emblem to a free dock changes which
    // side of the wide panel holds the emblem. Shift the panel so the emblem
    // remains under the pointer after the frontend switches its layout.
    if edge == "free"
        && settings.dock_compact
        && matches!(
            settings.dock_edge.as_str(),
            "right" | "top_right" | "bottom_right"
        )
        && size.width > (COMPACT_SIZE.0 * monitor.scale_factor()) as u32
    {
        let shift = size.width as i32 - (COMPACT_SIZE.0 * monitor.scale_factor()) as i32;
        window
            .set_position(tauri::PhysicalPosition::new(position.x + shift, position.y))
            .map_err(|_| "position")?;
    }
    Ok(edge.into())
}

fn nearest_dock_edge(
    area: &tauri::PhysicalRect<i32, u32>,
    position: tauri::PhysicalPosition<i32>,
    size: tauri::PhysicalSize<u32>,
    scale: f64,
    current_edge: &str,
    compact: bool,
) -> &'static str {
    let margin = 12.0 * scale;
    let emblem_half = COMPACT_SIZE.0 * scale / 2.0;
    let emblem_x = if compact {
        if matches!(current_edge, "right" | "top_right" | "bottom_right") {
            position.x as f64 + size.width as f64 - emblem_half
        } else {
            position.x as f64 + emblem_half
        }
    } else {
        position.x as f64 + size.width as f64 / 2.0
    };
    let emblem_y = position.y as f64 + size.height as f64 / 2.0;
    let left = area.position.x as f64 + margin + emblem_half;
    let right = area.position.x as f64 + area.size.width as f64 - margin - emblem_half;
    let top = area.position.y as f64 + margin + size.height as f64 / 2.0;
    let bottom =
        area.position.y as f64 + area.size.height as f64 - margin - size.height as f64 / 2.0;
    let center_x = area.position.x as f64 + area.size.width as f64 / 2.0;
    let center_y = area.position.y as f64 + area.size.height as f64 / 2.0;
    let x_edges = [(left, 0), (right, 2)];
    let y_edges = [(top, 0), (bottom, 2)];
    let nearest_x_edge = x_edges
        .into_iter()
        .min_by(|a, b| (emblem_x - a.0).abs().total_cmp(&(emblem_x - b.0).abs()));
    let nearest_y_edge = y_edges
        .into_iter()
        .min_by(|a, b| (emblem_y - a.0).abs().total_cmp(&(emblem_y - b.0).abs()));
    let threshold = 48.0 * scale;
    let x_snap = nearest_x_edge.filter(|(x, _)| (emblem_x - x).abs() <= threshold);
    let y_snap = nearest_y_edge.filter(|(y, _)| (emblem_y - y).abs() <= threshold);
    if x_snap.is_none() && y_snap.is_none() {
        return "free";
    }
    let column = x_snap.map(|(_, index)| index).unwrap_or_else(|| {
        [left, center_x, right]
            .into_iter()
            .enumerate()
            .min_by(|a, b| (emblem_x - a.1).abs().total_cmp(&(emblem_x - b.1).abs()))
            .map(|(index, _)| index)
            .unwrap_or(1)
    });
    let row = y_snap.map(|(_, index)| index).unwrap_or_else(|| {
        [top, center_y, bottom]
            .into_iter()
            .enumerate()
            .min_by(|a, b| (emblem_y - a.1).abs().total_cmp(&(emblem_y - b.1).abs()))
            .map(|(index, _)| index)
            .unwrap_or(1)
    });
    match (row, column) {
        (0, 0) => "top_left",
        (0, 1) => "top",
        (0, 2) => "top_right",
        (1, 0) => "left",
        (1, 2) => "right",
        (2, 0) => "bottom_left",
        (2, 1) => "bottom",
        (2, 2) => "bottom_right",
        _ => "free",
    }
}

/// Compute placement from the requested panel size, not a queued resize's stale frame.
fn dock_position(
    area: &tauri::PhysicalRect<i32, u32>,
    size: tauri::PhysicalSize<u32>,
    current: tauri::PhysicalPosition<i32>,
    edge: &str,
    compact: bool,
    scale: f64,
) -> tauri::PhysicalPosition<i32> {
    let margin = (12.0 * scale) as i32;
    let left = area.position.x + margin;
    let top = area.position.y + margin;
    let right = (area.position.x + area.size.width as i32 - size.width as i32 - margin).max(left);
    let bottom = (area.position.y + area.size.height as i32 - size.height as i32 - margin).max(top);
    let (x, y) = if edge == "free" {
        (current.x.clamp(left, right), current.y.clamp(top, bottom))
    } else {
        let center_x = area.position.x + area.size.width as i32 / 2;
        let center_y = area.position.y + area.size.height as i32 / 2;
        let emblem_half = (COMPACT_SIZE.0 * scale / 2.0) as i32;
        let x = match edge {
            "left" | "top_left" | "bottom_left" => left,
            "right" | "top_right" | "bottom_right" => right,
            _ if compact => center_x - emblem_half,
            _ => center_x - size.width as i32 / 2,
        };
        let y = match edge {
            "top" | "top_left" | "top_right" => top,
            "bottom" | "bottom_left" | "bottom_right" => bottom,
            _ => center_y - size.height as i32 / 2,
        };
        (x.clamp(left, right), y.clamp(top, bottom))
    };
    tauri::PhysicalPosition::new(x, y)
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

#[cfg(test)]
mod tests {
    use super::{dock_position, nearest_dock_edge};
    use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize};

    fn area() -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition::new(0, 0),
            size: PhysicalSize::new(1000, 800),
        }
    }

    #[test]
    fn snaps_compact_emblem_to_nearby_corner_or_side() {
        let size = PhysicalSize::new(104, 104);
        assert_eq!(
            nearest_dock_edge(
                &area(),
                PhysicalPosition::new(14, 12),
                size,
                1.0,
                "free",
                true
            ),
            "top_left"
        );
        assert_eq!(
            nearest_dock_edge(
                &area(),
                PhysicalPosition::new(12, 348),
                size,
                1.0,
                "free",
                true
            ),
            "left"
        );
        assert_eq!(
            nearest_dock_edge(
                &area(),
                PhysicalPosition::new(450, 696),
                size,
                1.0,
                "free",
                true
            ),
            "bottom"
        );
    }

    #[test]
    fn right_aligned_rail_uses_emblem_instead_of_panel_center() {
        let size = PhysicalSize::new(220, 104);
        assert_eq!(
            nearest_dock_edge(
                &area(),
                PhysicalPosition::new(768, 12),
                size,
                1.0,
                "top_right",
                true
            ),
            "top_right"
        );
    }

    #[test]
    fn stays_free_outside_magnetic_distance() {
        assert_eq!(
            nearest_dock_edge(
                &area(),
                PhysicalPosition::new(250, 250),
                PhysicalSize::new(104, 104),
                1.0,
                "free",
                true
            ),
            "free"
        );
    }

    #[test]
    fn right_anchor_uses_requested_width_before_resize_settles() {
        let current = PhysicalPosition::new(884, 12);
        let compact = dock_position(
            &area(),
            PhysicalSize::new(104, 104),
            current,
            "top_right",
            true,
            1.0,
        );
        let expanded = dock_position(
            &area(),
            PhysicalSize::new(460, 112),
            current,
            "top_right",
            false,
            1.0,
        );
        assert_eq!(compact, PhysicalPosition::new(884, 12));
        assert_eq!(expanded, PhysicalPosition::new(528, 12));
        assert_eq!(expanded.x + 460, compact.x + 104);
    }
}
