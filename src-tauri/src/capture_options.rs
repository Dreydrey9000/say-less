//! What a screen recording captures: screen or one window, microphone,
//! computer sound, webcam bubble, size and frame rate.
//!
//! Saved in `recording.json` (its own store, so older `studio.json` files are
//! untouched). Missing or broken values fall back to the defaults, which match
//! what v1 always recorded: the main display with mic and system audio at
//! 1080p30, the right size for 8GB laptops.
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "recording.json";
const STORE_KEY: &str = "options";
/// Device names and ids come from the OS; anything longer is not real.
const MAX_DEVICE_TEXT: usize = 256;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RecordingSource {
    #[default]
    Display,
    Window,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum WebcamCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    #[default]
    BottomRight,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum WebcamSize {
    Small,
    #[default]
    Medium,
    Large,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RecordingQuality {
    P720,
    #[default]
    P1080,
    Native,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq)]
#[serde(default)]
pub struct RecordingOptions {
    pub source: RecordingSource,
    /// Which display (macOS display id). None records the main display.
    pub display_id: Option<u32>,
    /// Which window when `source` is `window`.
    pub window_id: Option<u32>,
    /// A label for the chosen window ("Safari: Start page"), so the panel can
    /// name it even after the window closes.
    pub window_label: Option<String>,
    pub microphone: bool,
    /// Microphone by name, from the same list dictation uses. None follows
    /// the dictation microphone.
    pub microphone_name: Option<String>,
    pub system_audio: bool,
    pub webcam: bool,
    /// Camera unique id. None uses the default camera.
    pub camera_id: Option<String>,
    pub webcam_corner: WebcamCorner,
    pub webcam_size: WebcamSize,
    pub quality: RecordingQuality,
    /// 30 or 60.
    pub fps: u32,
}

impl Default for RecordingOptions {
    fn default() -> Self {
        Self {
            source: RecordingSource::Display,
            display_id: None,
            window_id: None,
            window_label: None,
            microphone: true,
            microphone_name: None,
            system_audio: true,
            webcam: false,
            camera_id: None,
            webcam_corner: WebcamCorner::BottomRight,
            webcam_size: WebcamSize::Medium,
            quality: RecordingQuality::P1080,
            fps: 30,
        }
    }
}

fn bad_text(value: &Option<String>) -> bool {
    value.as_ref().is_some_and(|v| {
        v.is_empty() || v.len() > MAX_DEVICE_TEXT || v.chars().any(char::is_control)
    })
}

impl RecordingOptions {
    /// Refuse values the UI never sends, with a short code for the message.
    pub fn validate(&self) -> Result<(), String> {
        if self.fps != 30 && self.fps != 60 {
            return Err("invalid_fps".into());
        }
        if self.source == RecordingSource::Window && self.window_id.is_none() {
            return Err("window_required".into());
        }
        if bad_text(&self.microphone_name)
            || bad_text(&self.camera_id)
            || bad_text(&self.window_label)
        {
            return Err("invalid_device".into());
        }
        Ok(())
    }

    /// Repair a saved file by hand-edit or an older build: keep what is valid,
    /// reset what is not. Loading never fails.
    pub fn repaired(mut self) -> Self {
        let defaults = Self::default();
        if self.fps != 30 && self.fps != 60 {
            self.fps = defaults.fps;
        }
        if self.source == RecordingSource::Window && self.window_id.is_none() {
            self.source = RecordingSource::Display;
        }
        for field in [
            &mut self.microphone_name,
            &mut self.camera_id,
            &mut self.window_label,
        ] {
            if bad_text(field) {
                *field = None;
            }
        }
        self
    }

    /// Largest output size, or None for the display's own size.
    pub fn max_size(&self) -> Option<(u32, u32)> {
        match self.quality {
            RecordingQuality::P720 => Some((1280, 720)),
            RecordingQuality::P1080 => Some((1920, 1080)),
            RecordingQuality::Native => None,
        }
    }
}

/// Parse whatever is saved. Unknown or broken values become defaults, one
/// field at a time, so one bad value never resets the rest.
pub fn from_saved(value: serde_json::Value) -> RecordingOptions {
    if let Ok(options) = serde_json::from_value::<RecordingOptions>(value.clone()) {
        return options.repaired();
    }
    let mut options = RecordingOptions::default();
    let serde_json::Value::Object(map) = value else {
        return options;
    };
    let base = serde_json::to_value(&options).unwrap_or_default();
    let serde_json::Value::Object(mut merged) = base else {
        return options;
    };
    for (key, field) in map {
        if !merged.contains_key(&key) {
            continue;
        }
        let mut trial = merged.clone();
        trial.insert(key.clone(), field.clone());
        if serde_json::from_value::<RecordingOptions>(serde_json::Value::Object(trial)).is_ok() {
            merged.insert(key, field);
        }
    }
    if let Ok(parsed) = serde_json::from_value(serde_json::Value::Object(merged)) {
        options = parsed;
    }
    options.repaired()
}

pub fn load(app: &AppHandle) -> RecordingOptions {
    app.store(crate::portable::store_path(STORE_FILE))
        .ok()
        .and_then(|store| store.get(STORE_KEY))
        .map(from_saved)
        .unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub fn get_recording_options(app: AppHandle) -> RecordingOptions {
    load(&app)
}

#[tauri::command]
#[specta::specta]
pub fn save_recording_options(
    app: AppHandle,
    options: RecordingOptions,
) -> Result<RecordingOptions, String> {
    options.validate()?;
    let store = app
        .store(crate::portable::store_path(STORE_FILE))
        .map_err(|_| "storage")?;
    let previous = store.get(STORE_KEY);
    store.set(
        STORE_KEY,
        serde_json::to_value(&options).map_err(|_| "storage")?,
    );
    if store.save().is_err() {
        match previous {
            Some(p) => store.set(STORE_KEY, p),
            None => {
                store.delete(STORE_KEY);
            }
        }
        return Err("storage".into());
    }
    let _ = app.emit("recording-options-changed", &options);
    Ok(options)
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq)]
pub struct DisplayInfo {
    pub id: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_main: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq)]
pub struct WindowInfo {
    pub id: u32,
    pub app: String,
    pub title: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq)]
pub struct CameraInfo {
    pub id: String,
    pub name: String,
}

/// What the setup panel can offer on this computer right now.
#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq, Default)]
pub struct RecordingSources {
    pub displays: Vec<DisplayInfo>,
    pub windows: Vec<WindowInfo>,
    pub cameras: Vec<CameraInfo>,
    /// True when windows can't be listed until Screen Recording is allowed.
    pub windows_need_permission: bool,
}

/// Displays, open windows and cameras. Never shows a permission prompt.
#[tauri::command]
#[specta::specta]
pub async fn list_recording_sources() -> Result<RecordingSources, String> {
    tauri::async_runtime::spawn_blocking(crate::screen_recorder::list_sources)
        .await
        .map_err(|_| "internal".to_string())?
}

/// Start the live camera thumbnail for the setup panel.
#[tauri::command]
#[specta::specta]
pub async fn start_camera_preview(camera_id: Option<String>) -> Result<(), String> {
    if bad_text(&camera_id) {
        return Err("invalid_device".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        crate::screen_recorder::camera_preview_start(camera_id)
    })
    .await
    .map_err(|_| "internal".to_string())?
    .map_err(|raw| crate::screen_recorder::error_code(&raw))
}

/// The newest thumbnail frame as a `data:image/jpeg` URL, if any.
#[tauri::command]
#[specta::specta]
pub fn camera_preview_frame() -> Option<String> {
    crate::screen_recorder::camera_preview_frame()
}

#[tauri::command]
#[specta::specta]
pub fn stop_camera_preview() {
    crate::screen_recorder::camera_preview_stop();
}

/// Open System Settings on Privacy & Security > Camera.
#[tauri::command]
#[specta::specta]
pub fn open_camera_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera")
            .status()
            .map_err(|_| "open_failed")?;
        if status.success() {
            return Ok(());
        }
        Err("open_failed".into())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("unsupported_platform".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_match_v1_and_suit_8gb_laptops() {
        let d = RecordingOptions::default();
        assert_eq!(d.source, RecordingSource::Display);
        assert!(d.microphone && d.system_audio && !d.webcam);
        assert_eq!(d.quality, RecordingQuality::P1080);
        assert_eq!(d.fps, 30);
        assert_eq!(d.max_size(), Some((1920, 1080)));
        assert_eq!(d.webcam_corner, WebcamCorner::BottomRight);
        assert_eq!(d.webcam_size, WebcamSize::Medium);
        assert!(d.validate().is_ok());
    }

    #[test]
    fn missing_file_fields_and_old_saves_load_as_defaults() {
        assert_eq!(from_saved(json!({})), RecordingOptions::default());
        assert_eq!(from_saved(json!(null)), RecordingOptions::default());
        assert_eq!(from_saved(json!("junk")), RecordingOptions::default());
        // A partial save keeps what it has.
        let partial = from_saved(json!({ "webcam": true, "fps": 60 }));
        assert!(partial.webcam);
        assert_eq!(partial.fps, 60);
        assert!(partial.microphone);
    }

    #[test]
    fn one_bad_field_does_not_reset_the_rest() {
        let loaded = from_saved(json!({
            "quality": "8k",
            "webcam": true,
            "webcam_corner": "top_left",
            "fps": 24,
            "camera_id": "",
            "source": "window"
        }));
        assert_eq!(loaded.quality, RecordingQuality::P1080);
        assert!(loaded.webcam);
        assert_eq!(loaded.webcam_corner, WebcamCorner::TopLeft);
        assert_eq!(loaded.fps, 30);
        assert_eq!(loaded.camera_id, None);
        // A window source without a window falls back to the display.
        assert_eq!(loaded.source, RecordingSource::Display);
    }

    #[test]
    fn validation_refuses_what_the_ui_never_sends() {
        let mut o = RecordingOptions::default();
        o.fps = 24;
        assert_eq!(o.validate().unwrap_err(), "invalid_fps");
        let mut o = RecordingOptions::default();
        o.source = RecordingSource::Window;
        assert_eq!(o.validate().unwrap_err(), "window_required");
        o.window_id = Some(42);
        assert!(o.validate().is_ok());
        let mut o = RecordingOptions::default();
        o.microphone_name = Some("x".repeat(MAX_DEVICE_TEXT + 1));
        assert_eq!(o.validate().unwrap_err(), "invalid_device");
        let mut o = RecordingOptions::default();
        o.camera_id = Some("cam\nera".into());
        assert_eq!(o.validate().unwrap_err(), "invalid_device");
        let mut o = RecordingOptions::default();
        o.fps = 60;
        o.quality = RecordingQuality::Native;
        assert!(o.validate().is_ok());
        assert_eq!(o.max_size(), None);
    }

    #[test]
    fn saved_shape_uses_plain_snake_case_words() {
        let mut o = RecordingOptions::default();
        o.quality = RecordingQuality::P720;
        o.webcam_corner = WebcamCorner::TopRight;
        let v = serde_json::to_value(&o).unwrap();
        assert_eq!(v["quality"], "p720");
        assert_eq!(v["webcam_corner"], "top_right");
        assert_eq!(v["webcam_size"], "medium");
        assert_eq!(v["source"], "display");
        assert_eq!(from_saved(v), o);
    }
}
