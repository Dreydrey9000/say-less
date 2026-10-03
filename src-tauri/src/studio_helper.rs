//! Say Less Create: the Studio helper.
//!
//! Create, Titles, Videos, Screens and Library are a small web app served by a
//! local helper (`bridge/` in this repo). This module lets the app find that
//! helper, install and start it with one click, and take the screen captures
//! that Titles needs. The helper listens on 127.0.0.1 only.
use serde::{Deserialize, Serialize};
use specta::Type;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Component, Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::{Command, Stdio};
use std::time::Duration;
#[cfg(target_os = "macos")]
use std::time::Instant;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

/// The port the helper uses unless its own config says otherwise.
const DEFAULT_PORT: u16 = 8810;
/// LaunchAgent label for the copy the app installs itself. A helper someone
/// already runs (for example from `bridge/install.sh`) is found and used as is.
const HELPER_LABEL: &str = "com.sayless.studio-helper";
const INSTALL_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq)]
pub struct StudioHelperStatus {
    pub running: bool,
    pub port: u16,
    /// The app can install and start the helper on this computer.
    pub can_start: bool,
}

fn helper_home(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("studio-helper"))
        .map_err(|e| e.to_string())
}

/// Ports to try, most likely first: the one our own helper wrote, then the default.
fn candidate_ports(home: &Path) -> Vec<u16> {
    let mut ports = Vec::new();
    if let Ok(text) = std::fs::read_to_string(home.join("state").join("port.txt")) {
        if let Ok(port) = text.trim().parse::<u16>() {
            ports.push(port);
        }
    }
    if !ports.contains(&DEFAULT_PORT) {
        ports.push(DEFAULT_PORT);
    }
    ports
}

/// True only when a Say Less helper answers on this port. Anything else that
/// happens to listen there does not count.
fn is_studio_helper(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(400)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
    let request =
        format!("GET /health HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut body = String::new();
    let _ = stream.take(65_536).read_to_string(&mut body);
    body.starts_with("HTTP/1.") && body.contains(" 200 ") && body.contains("say-less-bridge")
}

fn status_blocking(app: &AppHandle) -> StudioHelperStatus {
    let can_start = cfg!(target_os = "macos");
    let ports = helper_home(app)
        .map(|home| candidate_ports(&home))
        .unwrap_or_else(|_| vec![DEFAULT_PORT]);
    for port in &ports {
        if is_studio_helper(*port) {
            return StudioHelperStatus {
                running: true,
                port: *port,
                can_start,
            };
        }
    }
    StudioHelperStatus {
        running: false,
        port: ports.first().copied().unwrap_or(DEFAULT_PORT),
        can_start,
    }
}

/// Where the helper's files are: bundled with the app, or the repo's `bridge/`
/// folder when running from source.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn helper_source(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().resolve("studio-helper", BaseDirectory::Resource) {
        if dir.join("install.sh").is_file() {
            return Ok(dir);
        }
    }
    let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("../bridge");
    if dev.join("install.sh").is_file() {
        return Ok(dev);
    }
    Err("helper_missing".into())
}

#[cfg(target_os = "macos")]
fn find_python() -> Result<PathBuf, String> {
    for candidate in [
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/Library/Frameworks/Python.framework/Versions/Current/bin/python3",
    ] {
        if Path::new(candidate).is_file() {
            return Ok(PathBuf::from(candidate));
        }
    }
    // /usr/bin/python3 is only a stub that opens an install dialog until the
    // Xcode command line tools exist, so ask before using it.
    let tools_installed = Command::new("/usr/bin/xcode-select")
        .arg("-p")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if tools_installed && Path::new("/usr/bin/python3").is_file() {
        return Ok(PathBuf::from("/usr/bin/python3"));
    }
    Err("python_missing".into())
}

#[cfg(target_os = "macos")]
fn run_installer(source: &Path, home: &Path, python: &Path) -> Result<(), String> {
    let python_dir = python.parent().unwrap_or_else(|| Path::new("/usr/bin"));
    let path = format!(
        "{}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        python_dir.display()
    );
    let mut child = Command::new("/bin/bash")
        .arg(source.join("install.sh"))
        .env("SAYLESS_BRIDGE_HOME", home)
        .env("SAYLESS_BRIDGE_LABEL", HELPER_LABEL)
        .env("PATH", path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("install_failed: {e}"))?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    return Ok(());
                }
                let mut tail = String::new();
                if let Some(mut stderr) = child.stderr.take() {
                    let _ = stderr.read_to_string(&mut tail);
                }
                let tail: String = tail
                    .trim()
                    .lines()
                    .last()
                    .unwrap_or("")
                    .chars()
                    .take(200)
                    .collect();
                return Err(format!("install_failed: {tail}"));
            }
            Ok(None) if started.elapsed() > INSTALL_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("install_timeout".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(200)),
            Err(e) => return Err(format!("install_failed: {e}")),
        }
    }
}

fn start_blocking(app: &AppHandle) -> Result<StudioHelperStatus, String> {
    let current = status_blocking(app);
    if current.running {
        return Ok(current);
    }
    #[cfg(target_os = "macos")]
    {
        let source = helper_source(app)?;
        let home = helper_home(app)?;
        let python = find_python()?;
        run_installer(&source, &home, &python)?;
        let after = status_blocking(app);
        if after.running {
            return Ok(after);
        }
        Err("helper_did_not_answer".into())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("unsupported_platform".into())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn studio_helper_status(app: AppHandle) -> Result<StudioHelperStatus, String> {
    tauri::async_runtime::spawn_blocking(move || status_blocking(&app))
        .await
        .map_err(|e| e.to_string())
}

/// Install (if needed) and start the helper, then report where it listens.
#[tauri::command]
#[specta::specta]
pub async fn studio_helper_start(app: AppHandle) -> Result<StudioHelperStatus, String> {
    tauri::async_runtime::spawn_blocking(move || start_blocking(&app))
        .await
        .map_err(|e| e.to_string())?
}

/// Create needs more room than the settings pages. Grow the main window to fit
/// it when it is smaller; never shrink it, and never go past the screen.
#[tauri::command]
#[specta::specta]
pub async fn studio_fit_window(app: AppHandle) -> Result<(), String> {
    const WANT_WIDTH: f64 = 1120.0;
    const WANT_HEIGHT: f64 = 780.0;
    const SCREEN_MARGIN: f64 = 80.0;
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let current = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    let (mut width, mut height) = (WANT_WIDTH, WANT_HEIGHT);
    if let Ok(Some(monitor)) = window.current_monitor() {
        let screen = monitor.size().to_logical::<f64>(monitor.scale_factor());
        width = width.min(screen.width - SCREEN_MARGIN);
        height = height.min(screen.height - SCREEN_MARGIN);
    }
    let (width, height) = (width.max(current.width), height.max(current.height));
    if width > current.width + 1.0 || height > current.height + 1.0 {
        window
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The helper keeps captures in `<its folder>/state/captures`. The app only
/// writes there, and only below the user's home folder.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn capture_dir_allowed(dir: &Path, home: &Path) -> bool {
    dir.is_absolute()
        && dir.starts_with(home)
        && !dir.components().any(|c| matches!(c, Component::ParentDir))
        && dir.file_name().is_some_and(|n| n == "captures")
        && dir
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|n| n == "state")
}

#[cfg(target_os = "macos")]
fn take_capture(region: bool, out: &Path) -> bool {
    let mut cmd = Command::new("/usr/sbin/screencapture");
    cmd.arg("-x");
    if region {
        cmd.arg("-i");
    }
    cmd.arg(out).stdout(Stdio::null()).stderr(Stdio::null());
    let Ok(mut child) = cmd.spawn() else {
        return false;
    };
    // A full-screen capture is quick; a region capture waits for the person.
    // Neither may hang forever.
    let limit = if region {
        Duration::from_secs(120)
    } else {
        Duration::from_secs(20)
    };
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return true,
            Ok(None) if started.elapsed() > limit => {
                let _ = child.kill();
                let _ = child.wait();
                return true;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(_) => return false,
        }
    }
}

/// Capture the screen for Titles. The app window hides first so it is not in
/// the picture, then comes back. Returns the saved file's path.
#[tauri::command]
#[specta::specta]
pub async fn studio_capture(app: AppHandle, region: bool, dir: String) -> Result<String, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&app, region, &dir);
        Err("unsupported_platform".into())
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "capture_failed".to_string())?;
        let dir = PathBuf::from(dir);
        if !capture_dir_allowed(&dir, &home) {
            return Err("invalid_capture_dir".into());
        }
        std::fs::create_dir_all(&dir).map_err(|_| "capture_failed".to_string())?;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let out = dir.join(format!("capture-{stamp}.png"));
        let window = app.get_webview_window("main");
        if let Some(w) = &window {
            let _ = w.hide();
        }
        let handle = app.clone();
        let target = out.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            std::thread::sleep(Duration::from_millis(450));
            let ran = take_capture(region, &target);
            crate::show_main_window_for(&handle);
            ran
        })
        .await
        .map_err(|e| e.to_string())?;
        let size = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
        if result && size > 1000 {
            return Ok(out.to_string_lossy().into_owned());
        }
        let _ = std::fs::remove_file(&out);
        if region && size == 0 {
            return Err("cancelled".into());
        }
        Err("capture_failed".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    /// Serve one canned HTTP response on a free port and return that port.
    fn serve_once(response: &'static str) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 512];
                let _ = stream.read(&mut buf);
                let _ = stream.write_all(response.as_bytes());
            }
        });
        port
    }

    #[test]
    fn recognises_the_helper_by_its_health_answer() {
        let port = serve_once(
            "HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n{\"ok\": true, \"service\": \"say-less-bridge\"}",
        );
        assert!(is_studio_helper(port));
    }

    #[test]
    fn ignores_other_things_that_listen_on_the_port() {
        let port = serve_once("HTTP/1.0 200 OK\r\n\r\n{\"service\": \"something-else\"}");
        assert!(!is_studio_helper(port));
        let port = serve_once("HTTP/1.0 404 Not Found\r\n\r\nsay-less-bridge");
        assert!(!is_studio_helper(port));
        // nothing listening at all
        let free = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = free.local_addr().unwrap().port();
        drop(free);
        assert!(!is_studio_helper(port));
    }

    #[test]
    fn tries_the_port_the_helper_wrote_then_the_default() {
        let dir = std::env::temp_dir().join(format!("sayless-helper-test-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("state")).unwrap();
        assert_eq!(candidate_ports(&dir), vec![DEFAULT_PORT]);
        std::fs::write(dir.join("state").join("port.txt"), "8844\n").unwrap();
        assert_eq!(candidate_ports(&dir), vec![8844, DEFAULT_PORT]);
        std::fs::write(dir.join("state").join("port.txt"), "garbage").unwrap();
        assert_eq!(candidate_ports(&dir), vec![DEFAULT_PORT]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn captures_are_only_written_to_a_helper_captures_folder_under_home() {
        let home = Path::new("/Users/someone");
        let ok = |p: &str| capture_dir_allowed(Path::new(p), home);
        assert!(ok(
            "/Users/someone/Library/Application Support/x/studio-helper/state/captures"
        ));
        assert!(ok("/Users/someone/Desktop/say-less-bridge/state/captures"));
        assert!(!ok("/tmp/state/captures"));
        assert!(!ok("/Users/someone/Documents"));
        assert!(!ok("/Users/someone/Desktop/captures"));
        assert!(!ok("/Users/someone/../other/state/captures"));
        assert!(!ok("state/captures"));
    }
}
