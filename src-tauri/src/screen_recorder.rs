//! Screen recording: one MP4 with the screen (or one window), the microphone,
//! system audio and, if chosen, a round webcam bubble burned into the video.
//!
//! Flow: button, tray item or voice cue -> these commands -> saved
//! `RecordingOptions` (capture_options.rs) -> the platform recorder ->
//! `~/Movies/Say Less/Say Less 2026-09-25 at 14.03.07.mp4`.
//!
//! macOS 15+ uses ScreenCaptureKit's `SCRecordingOutput` through the Swift
//! bridge in `swift/screen_recorder.swift` (Apple encodes and writes the file).
//! TODO(windows, phase 2): implement `platform` for Windows with the
//! `windows-capture` crate plus `cpal` mic/loopback audio, as planned in
//! docs/review/screen-recording-plan.md. Until then Windows and Linux report
//! `supported: false` and the UI shows a disabled button with a plain reason.
use crate::capture_options::{RecordingOptions, RecordingSource, RecordingSources};
use serde::Serialize;
use specta::Type;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

/// What the recorder is doing right now.
#[derive(Clone, Copy, Debug, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecorderState {
    Idle,
    Starting,
    Recording,
    Stopping,
}

/// Everything the UI needs to draw the record button.
#[derive(Clone, Debug, Serialize, Type, PartialEq)]
pub struct ScreenRecordingStatus {
    pub state: RecorderState,
    /// False on Windows/Linux for now, and on Macs older than macOS 15.
    pub supported: bool,
    /// "macos_too_old", "windows_soon" or "linux_unsupported" when not supported.
    pub unsupported_reason: Option<String>,
    /// Milliseconds since recording started (0 when not recording).
    pub elapsed_ms: u32,
    /// Full path of the last finished recording.
    pub last_file: Option<String>,
    /// Short error code from the last attempt, such as "permission_denied".
    pub error: Option<String>,
}

/// The recorder's state machine, kept free of OS calls so it can be tested.
#[derive(Debug)]
pub struct Machine {
    state: RecorderState,
    started_at: Option<Instant>,
    current_file: Option<PathBuf>,
    last_file: Option<PathBuf>,
    error: Option<String>,
}

impl Machine {
    pub const fn new() -> Self {
        Self {
            state: RecorderState::Idle,
            started_at: None,
            current_file: None,
            last_file: None,
            error: None,
        }
    }

    pub fn state(&self) -> RecorderState {
        self.state
    }

    /// Idle -> Starting. Any other state means a second click; refuse it.
    pub fn begin_start(&mut self) -> Result<(), String> {
        match self.state {
            RecorderState::Idle => {
                self.state = RecorderState::Starting;
                self.error = None;
                Ok(())
            }
            RecorderState::Recording => Err("already_recording".into()),
            _ => Err("busy".into()),
        }
    }

    pub fn start_succeeded(&mut self, file: PathBuf, now: Instant) {
        self.state = RecorderState::Recording;
        self.started_at = Some(now);
        self.current_file = Some(file);
    }

    pub fn start_failed(&mut self, error: String) {
        self.state = RecorderState::Idle;
        self.started_at = None;
        self.current_file = None;
        self.error = Some(error);
    }

    /// Recording -> Stopping.
    pub fn begin_stop(&mut self) -> Result<(), String> {
        match self.state {
            RecorderState::Recording => {
                self.state = RecorderState::Stopping;
                Ok(())
            }
            RecorderState::Idle => Err("not_recording".into()),
            _ => Err("busy".into()),
        }
    }

    /// Back to Idle. A file that made it to disk is kept even when the
    /// recorder reported a problem, so nothing recorded is ever hidden.
    pub fn finish(&mut self, error: Option<String>, file_exists: bool) {
        let file = self.current_file.take();
        if file_exists {
            self.last_file = file;
        }
        self.state = RecorderState::Idle;
        self.started_at = None;
        self.error = error;
    }

    pub fn status(&self, now: Instant, support: Result<(), String>) -> ScreenRecordingStatus {
        let elapsed_ms = match (self.state, self.started_at) {
            (RecorderState::Recording | RecorderState::Stopping, Some(start)) => {
                u32::try_from(now.saturating_duration_since(start).as_millis()).unwrap_or(u32::MAX)
            }
            _ => 0,
        };
        ScreenRecordingStatus {
            state: self.state,
            supported: support.is_ok(),
            unsupported_reason: support.err(),
            elapsed_ms,
            last_file: self
                .last_file
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned()),
            error: self.error.clone(),
        }
    }
}

impl Default for Machine {
    fn default() -> Self {
        Self::new()
    }
}

static MACHINE: Mutex<Machine> = Mutex::new(Machine::new());

fn machine() -> std::sync::MutexGuard<'static, Machine> {
    MACHINE.lock().unwrap_or_else(|p| p.into_inner())
}

/// "Say Less 2026-09-25 at 14.03.07.mp4". Dots, not colons: Finder shows a
/// colon in a file name as a slash.
pub fn file_name_for(time: &chrono::NaiveDateTime) -> String {
    format!("Say Less {}.mp4", time.format("%Y-%m-%d at %H.%M.%S"))
}

/// Pick a name that does not exist yet (adds " 2", " 3" on a clash).
pub fn unique_path(dir: &Path, time: &chrono::NaiveDateTime) -> PathBuf {
    let first = dir.join(file_name_for(time));
    if !first.exists() {
        return first;
    }
    let stem = file_name_for(time).trim_end_matches(".mp4").to_string();
    (2..1000)
        .map(|n| dir.join(format!("{stem} {n}.mp4")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

/// ~/Movies/Say Less, or Data/ScreenRecordings next to a portable install.
fn recordings_dir() -> Result<PathBuf, String> {
    if let Some(dir) = crate::portable::data_dir() {
        return Ok(dir.join("ScreenRecordings"));
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or("no_home_folder")?;
    Ok(home.join("Movies").join("Say Less"))
}

/// Turn the Swift bridge's "code: details" text into the bare code.
pub fn error_code(raw: &str) -> String {
    raw.split(':').next().unwrap_or(raw).trim().to_string()
}

/// What the Swift recorder reads (`RecordOptions` in screen_recorder.swift).
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BridgeOptions {
    pub source: &'static str,
    pub display_id: Option<u32>,
    pub window_id: Option<u32>,
    pub microphone: bool,
    pub microphone_name: Option<String>,
    pub system_audio: bool,
    pub webcam: bool,
    pub camera_id: Option<String>,
    pub webcam_corner: String,
    pub webcam_size: String,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
    pub fps: u32,
}

/// Saved options plus the dictation microphone (used when no recording mic
/// is picked) into what the recorder needs.
pub fn bridge_options(options: &RecordingOptions, dictation_mic: Option<String>) -> BridgeOptions {
    let microphone_name = options
        .microphone_name
        .clone()
        .or(dictation_mic)
        .filter(|name| !name.eq_ignore_ascii_case("default"));
    let (max_width, max_height) = options.max_size().unzip();
    BridgeOptions {
        source: match options.source {
            RecordingSource::Display => "display",
            RecordingSource::Window => "window",
        },
        display_id: options.display_id,
        window_id: options.window_id,
        microphone: options.microphone,
        microphone_name: microphone_name.filter(|_| options.microphone),
        system_audio: options.system_audio,
        webcam: options.webcam,
        camera_id: options.camera_id.clone(),
        webcam_corner: word(&options.webcam_corner),
        webcam_size: word(&options.webcam_size),
        max_width,
        max_height,
        fps: options.fps,
    }
}

/// The saved snake_case word for a settings enum ("bottom_right").
fn word<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_char, c_int};

    extern "C" {
        fn sl_screen_recorder_supported() -> c_int;
        fn sl_screen_recorder_has_permission() -> c_int;
        fn sl_screen_recorder_mic_status() -> c_int;
        fn sl_screen_recorder_camera_status() -> c_int;
        fn sl_screen_recorder_start(
            path: *const c_char,
            options_json: *const c_char,
        ) -> *mut c_char;
        fn sl_screen_recorder_stop() -> *mut c_char;
        fn sl_screen_recorder_take_error() -> *mut c_char;
        fn sl_screen_recorder_sources() -> *mut c_char;
        fn sl_camera_preview_start(camera_id: *const c_char) -> *mut c_char;
        fn sl_camera_preview_frame() -> *mut c_char;
        fn sl_camera_preview_stop();
        fn sl_screen_recorder_free_string(value: *mut c_char);
    }

    fn take(ptr: *mut c_char) -> Option<String> {
        if ptr.is_null() {
            return None;
        }
        let text = unsafe { CStr::from_ptr(ptr) }
            .to_string_lossy()
            .into_owned();
        unsafe { sl_screen_recorder_free_string(ptr) };
        Some(text)
    }

    pub fn support() -> Result<(), String> {
        if unsafe { sl_screen_recorder_supported() } == 1 {
            Ok(())
        } else {
            Err("macos_too_old".into())
        }
    }

    pub fn has_permission() -> bool {
        unsafe { sl_screen_recorder_has_permission() == 1 }
    }

    pub fn mic_allowed() -> bool {
        unsafe { sl_screen_recorder_mic_status() == 3 }
    }

    pub fn camera_allowed() -> bool {
        unsafe { sl_screen_recorder_camera_status() == 3 }
    }

    /// The caller has already checked every permission `options` needs, so
    /// nothing the user turned on is silently dropped from the file.
    pub fn start(path: &str, options: &super::BridgeOptions) -> Result<(), String> {
        let path = CString::new(path).map_err(|_| "invalid_path")?;
        let json = serde_json::to_string(options).map_err(|_| "invalid_options")?;
        let json = CString::new(json).map_err(|_| "invalid_options")?;
        match take(unsafe { sl_screen_recorder_start(path.as_ptr(), json.as_ptr()) }) {
            None => Ok(()),
            Some(e) => Err(e),
        }
    }

    pub fn sources() -> Option<String> {
        take(unsafe { sl_screen_recorder_sources() })
    }

    pub fn camera_preview_start(camera_id: Option<String>) -> Result<(), String> {
        let id = camera_id
            .map(CString::new)
            .transpose()
            .map_err(|_| "invalid_device")?;
        let ptr = id.as_ref().map_or(std::ptr::null(), |c| c.as_ptr());
        match take(unsafe { sl_camera_preview_start(ptr) }) {
            None => Ok(()),
            Some(e) => Err(e),
        }
    }

    pub fn camera_preview_frame() -> Option<String> {
        take(unsafe { sl_camera_preview_frame() })
    }

    pub fn camera_preview_stop() {
        unsafe { sl_camera_preview_stop() }
    }

    pub fn stop() -> Result<(), String> {
        match take(unsafe { sl_screen_recorder_stop() }) {
            None => Ok(()),
            Some(e) => Err(e),
        }
    }

    pub fn take_error() -> Option<String> {
        take(unsafe { sl_screen_recorder_take_error() })
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    pub fn support() -> Result<(), String> {
        if cfg!(target_os = "windows") {
            Err("windows_soon".into())
        } else {
            Err("linux_unsupported".into())
        }
    }
    pub fn has_permission() -> bool {
        false
    }
    pub fn mic_allowed() -> bool {
        false
    }
    pub fn camera_allowed() -> bool {
        false
    }
    pub fn start(_path: &str, _options: &super::BridgeOptions) -> Result<(), String> {
        Err(support().unwrap_err())
    }
    pub fn sources() -> Option<String> {
        None
    }
    pub fn camera_preview_start(_camera_id: Option<String>) -> Result<(), String> {
        Err(support().unwrap_err())
    }
    pub fn camera_preview_frame() -> Option<String> {
        None
    }
    pub fn camera_preview_stop() {}
    pub fn stop() -> Result<(), String> {
        Err("not_recording".into())
    }
    pub fn take_error() -> Option<String> {
        None
    }
}

pub fn is_supported() -> bool {
    platform::support().is_ok()
}

/// Displays, windows and cameras for the setup panel (empty off macOS).
pub fn list_sources() -> Result<RecordingSources, String> {
    platform::support()?;
    match platform::sources() {
        Some(json) => serde_json::from_str(&json).map_err(|_| "internal".into()),
        None => Ok(RecordingSources::default()),
    }
}

pub fn camera_preview_start(camera_id: Option<String>) -> Result<(), String> {
    platform::support()?;
    platform::camera_preview_start(camera_id)
}

pub fn camera_preview_frame() -> Option<String> {
    platform::camera_preview_frame()
}

pub fn camera_preview_stop() {
    platform::camera_preview_stop()
}

/// The first permission `options` needs that is missing, as an error code.
/// Checked before ScreenCaptureKit or the camera are touched, so macOS never
/// pops a surprise prompt from a recording start.
pub fn missing_permission(
    options: &RecordingOptions,
    screen: bool,
    mic: bool,
    camera: bool,
) -> Option<&'static str> {
    if !screen {
        Some("permission_denied")
    } else if options.microphone && !mic {
        Some("microphone_denied")
    } else if options.webcam && !camera {
        Some("camera_denied")
    } else {
        None
    }
}

pub fn current_status() -> ScreenRecordingStatus {
    machine().status(Instant::now(), platform::support())
}

/// Recording (or finishing) right now, for the tray label.
pub fn is_active() -> bool {
    matches!(
        machine().state(),
        RecorderState::Recording | RecorderState::Stopping
    )
}

fn broadcast(app: &AppHandle) -> ScreenRecordingStatus {
    let status = current_status();
    let _ = app.emit("screen-recording-changed", &status);
    crate::tray::update_tray_menu(app);
    status
}

async fn run_blocking<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| "internal".to_string())
}

/// Start recording. Refuses before touching ScreenCaptureKit when a
/// permission is missing, so macOS never pops a surprise prompt from here.
pub async fn start(app: &AppHandle) -> Result<ScreenRecordingStatus, String> {
    platform::support()?;
    machine().begin_start()?;
    let fail = |app: &AppHandle, code: String| {
        machine().start_failed(code.clone());
        broadcast(app);
        Err::<ScreenRecordingStatus, String>(code)
    };
    let options = crate::capture_options::load(app);
    if let Some(code) = missing_permission(
        &options,
        platform::has_permission(),
        platform::mic_allowed(),
        platform::camera_allowed(),
    ) {
        return fail(app, code.into());
    }
    let dictation_mic = crate::settings::get_settings(app).selected_microphone;
    let bridge = bridge_options(&options, dictation_mic);
    let dir = match recordings_dir() {
        Ok(dir) => dir,
        Err(e) => return fail(app, e),
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return fail(app, "folder_failed".into());
    }
    let path = unique_path(&dir, &chrono::Local::now().naive_local());
    let path_text = path.to_string_lossy().into_owned();
    broadcast(app);
    // The setup panel's thumbnail and the bubble would fight over the camera.
    if options.webcam {
        platform::camera_preview_stop();
    }
    match run_blocking(move || platform::start(&path_text, &bridge)).await? {
        Ok(()) => {
            machine().start_succeeded(path, Instant::now());
            log::info!("Screen recording started");
            spawn_watcher(app.clone());
            Ok(broadcast(app))
        }
        Err(raw) => {
            log::warn!("Screen recording failed to start: {raw}");
            fail(app, error_code(&raw))
        }
    }
}

pub async fn stop(app: &AppHandle) -> Result<ScreenRecordingStatus, String> {
    machine().begin_stop()?;
    broadcast(app);
    let result = run_blocking(platform::stop).await?;
    let file_exists = machine().current_file.as_ref().is_some_and(|p| p.is_file());
    let error = result.err().map(|raw| {
        log::warn!("Screen recording stopped with a problem: {raw}");
        error_code(&raw)
    });
    machine().finish(error.clone(), file_exists);
    log::info!("Screen recording stopped");
    let status = broadcast(app);
    match error {
        Some(e) if !file_exists => Err(e),
        _ => Ok(status),
    }
}

/// Notice when macOS ends the recording on its own (for example the user
/// clicks Stop Sharing in the menu bar) and tell every window.
fn spawn_watcher(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(750));
        if machine().state() != RecorderState::Recording {
            return;
        }
        if let Some(raw) = platform::take_error() {
            log::warn!("Screen recording ended by the system: {raw}");
            let mut m = machine();
            if m.state() != RecorderState::Recording {
                return;
            }
            let exists = m.current_file.as_ref().is_some_and(|p| p.is_file());
            m.finish(Some(error_code(&raw)), exists);
            drop(m);
            broadcast(&app);
            return;
        }
    });
}

/// Start when idle, stop when recording. Used by the tray and voice cues.
pub fn toggle_in_background(app: &AppHandle, want_recording: Option<bool>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let recording = machine().state() == RecorderState::Recording;
        let result = match want_recording {
            Some(true) if recording => return,
            Some(false) if !recording => return,
            _ if recording => stop(&app).await.map(|_| ()),
            _ => start(&app).await.map(|_| ()),
        };
        if let Err(code) = result {
            // Permission problems need the full window to explain and fix.
            if matches!(
                code.as_str(),
                "permission_denied"
                    | "microphone_denied"
                    | "camera_denied"
                    | "camera_missing"
                    | "camera_failed"
                    | "window_missing"
                    | "macos_too_old"
            ) {
                crate::show_main_window_for(&app);
            }
        }
    });
}

#[tauri::command]
#[specta::specta]
pub async fn start_screen_recording(app: AppHandle) -> Result<ScreenRecordingStatus, String> {
    start(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_screen_recording(app: AppHandle) -> Result<ScreenRecordingStatus, String> {
    stop(&app).await
}

#[tauri::command]
#[specta::specta]
pub fn screen_recording_status() -> ScreenRecordingStatus {
    current_status()
}

/// Show the last recording in Finder (or Explorer). Only ever the file we
/// wrote, never a path from the page.
#[tauri::command]
#[specta::specta]
pub fn show_screen_recording_in_folder(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = machine().last_file.clone().ok_or("no_recording")?;
    if !path.is_file() {
        return Err("file_missing".into());
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|_| "reveal_failed".into())
}

/// Open System Settings on Privacy & Security > Screen Recording.
#[tauri::command]
#[specta::specta]
pub fn open_screen_recording_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
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
    use std::time::Duration;

    fn time() -> chrono::NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 9, 25)
            .unwrap()
            .and_hms_opt(14, 3, 7)
            .unwrap()
    }

    #[test]
    fn file_name_matches_finder_friendly_pattern() {
        assert_eq!(
            file_name_for(&time()),
            "Say Less 2026-09-25 at 14.03.07.mp4"
        );
        assert!(!file_name_for(&time()).contains(':'));
    }

    #[test]
    fn unique_path_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("sl-rec-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = unique_path(&dir, &time());
        assert_eq!(first, dir.join("Say Less 2026-09-25 at 14.03.07.mp4"));
        std::fs::write(&first, b"x").unwrap();
        let second = unique_path(&dir, &time());
        assert_eq!(second, dir.join("Say Less 2026-09-25 at 14.03.07 2.mp4"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn happy_path_transitions_and_elapsed() {
        let mut m = Machine::new();
        let t0 = Instant::now();
        assert_eq!(m.status(t0, Ok(())).state, RecorderState::Idle);
        m.begin_start().unwrap();
        assert_eq!(m.state(), RecorderState::Starting);
        m.start_succeeded(PathBuf::from("/tmp/a.mp4"), t0);
        let s = m.status(t0 + Duration::from_millis(65_500), Ok(()));
        assert_eq!(s.state, RecorderState::Recording);
        assert_eq!(s.elapsed_ms, 65_500);
        m.begin_stop().unwrap();
        m.finish(None, true);
        let s = m.status(t0, Ok(()));
        assert_eq!(s.state, RecorderState::Idle);
        assert_eq!(s.elapsed_ms, 0);
        assert_eq!(s.last_file.as_deref(), Some("/tmp/a.mp4"));
        assert_eq!(s.error, None);
    }

    #[test]
    fn double_clicks_are_refused() {
        let mut m = Machine::new();
        m.begin_start().unwrap();
        assert_eq!(m.begin_start().unwrap_err(), "busy");
        assert_eq!(m.begin_stop().unwrap_err(), "busy");
        m.start_succeeded(PathBuf::from("/tmp/a.mp4"), Instant::now());
        assert_eq!(m.begin_start().unwrap_err(), "already_recording");
        m.begin_stop().unwrap();
        assert_eq!(m.begin_stop().unwrap_err(), "busy");
        m.finish(None, true);
        assert_eq!(m.begin_stop().unwrap_err(), "not_recording");
    }

    #[test]
    fn failures_return_to_idle_with_a_reason() {
        let mut m = Machine::new();
        m.begin_start().unwrap();
        m.start_failed("permission_denied".into());
        let s = m.status(Instant::now(), Ok(()));
        assert_eq!(s.state, RecorderState::Idle);
        assert_eq!(s.error.as_deref(), Some("permission_denied"));
        // A new attempt clears the old error.
        m.begin_start().unwrap();
        assert_eq!(m.status(Instant::now(), Ok(())).error, None);
        // A file that never reached disk is not offered as "saved".
        m.start_succeeded(PathBuf::from("/tmp/b.mp4"), Instant::now());
        m.begin_stop().unwrap();
        m.finish(Some("finish_timeout".into()), false);
        assert_eq!(m.status(Instant::now(), Ok(())).last_file, None);
    }

    #[test]
    fn unsupported_platforms_say_why() {
        let s = Machine::new().status(Instant::now(), Err("windows_soon".into()));
        assert!(!s.supported);
        assert_eq!(s.unsupported_reason.as_deref(), Some("windows_soon"));
    }

    #[test]
    fn bridge_errors_reduce_to_codes() {
        assert_eq!(
            error_code("permission_denied: SCStreamErrorDomain -3801: denied"),
            "permission_denied"
        );
        assert_eq!(error_code("timeout"), "timeout");
    }

    #[test]
    fn saved_options_reach_the_recorder() {
        use crate::capture_options::{RecordingQuality, WebcamCorner, WebcamSize};
        let defaults = bridge_options(&RecordingOptions::default(), None);
        assert_eq!(defaults.source, "display");
        assert!(defaults.microphone && defaults.system_audio && !defaults.webcam);
        assert_eq!(
            (defaults.max_width, defaults.max_height),
            (Some(1920), Some(1080))
        );
        assert_eq!(defaults.fps, 30);
        assert_eq!(defaults.webcam_corner, "bottom_right");
        assert_eq!(defaults.webcam_size, "medium");
        // No recording mic picked: follow the dictation mic, but "default"
        // means the system default.
        let o = RecordingOptions::default();
        assert_eq!(
            bridge_options(&o, Some("USB Mic".into()))
                .microphone_name
                .as_deref(),
            Some("USB Mic")
        );
        assert_eq!(
            bridge_options(&o, Some("Default".into())).microphone_name,
            None
        );
        let mut o = RecordingOptions::default();
        o.source = RecordingSource::Window;
        o.window_id = Some(7);
        o.microphone_name = Some("Studio Mic".into());
        o.webcam = true;
        o.camera_id = Some("cam-1".into());
        o.webcam_corner = WebcamCorner::TopLeft;
        o.webcam_size = WebcamSize::Large;
        o.quality = RecordingQuality::Native;
        o.fps = 60;
        let b = bridge_options(&o, Some("USB Mic".into()));
        assert_eq!(b.source, "window");
        assert_eq!(b.window_id, Some(7));
        assert_eq!(b.microphone_name.as_deref(), Some("Studio Mic"));
        assert_eq!(b.camera_id.as_deref(), Some("cam-1"));
        assert_eq!(
            (b.webcam_corner.as_str(), b.webcam_size.as_str()),
            ("top_left", "large")
        );
        assert_eq!((b.max_width, b.max_height, b.fps), (None, None, 60));
        // Mic off sends no mic name at all.
        o.microphone = false;
        assert_eq!(bridge_options(&o, None).microphone_name, None);
        // The JSON field names are the ones the Swift decoder reads.
        let json = serde_json::to_value(&b).unwrap();
        for key in [
            "displayId",
            "windowId",
            "microphoneName",
            "systemAudio",
            "cameraId",
            "webcamCorner",
            "webcamSize",
            "maxWidth",
            "maxHeight",
            "fps",
        ] {
            assert!(json.get(key).is_some(), "{key}");
        }
    }

    #[test]
    fn only_the_permissions_in_use_are_required() {
        let mut o = RecordingOptions::default();
        assert_eq!(
            missing_permission(&o, false, true, true),
            Some("permission_denied")
        );
        assert_eq!(
            missing_permission(&o, true, false, true),
            Some("microphone_denied")
        );
        // Camera permission is not needed while the webcam is off.
        assert_eq!(missing_permission(&o, true, true, false), None);
        o.webcam = true;
        assert_eq!(
            missing_permission(&o, true, true, false),
            Some("camera_denied")
        );
        // Mic off: recording works without microphone permission.
        o.microphone = false;
        assert_eq!(missing_permission(&o, true, false, true), None);
    }

    /// Real 5-second recording on this Mac with the mic and system audio.
    /// Run by hand: `cargo test real_recording -- --ignored --nocapture`
    /// It refuses to run (instead of prompting) when a permission is missing.
    /// The webcam bubble is a window and needs an app main thread, which
    /// libtest never gives a test, so `swift/record_check.swift` covers it.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn real_recording_writes_video_and_audio() {
        assert!(platform::support().is_ok(), "needs macOS 15+");
        assert!(
            platform::has_permission(),
            "Screen Recording permission is not granted for this terminal; not prompting"
        );
        assert!(
            platform::mic_allowed(),
            "Microphone permission missing; not prompting"
        );
        let dir = std::env::temp_dir().join("say-less-recorder-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = unique_path(&dir, &chrono::Local::now().naive_local());
        let bridge = bridge_options(&RecordingOptions::default(), None);
        platform::start(path.to_str().unwrap(), &bridge).unwrap();
        std::thread::sleep(Duration::from_secs(5));
        platform::stop().unwrap();
        let size = std::fs::metadata(&path).unwrap().len();
        println!("RECORDED {} ({size} bytes)", path.display());
        assert!(size > 10_000);
    }
}
