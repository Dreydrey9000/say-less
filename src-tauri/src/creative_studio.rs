//! The signed desktop app owns the private, bundled Studio runtime.
use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Child;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct StudioRuntime(Mutex<Option<Session>>, AtomicUsize, AtomicBool);
struct CaptureGuard(AppHandle);
impl Drop for CaptureGuard {
    fn drop(&mut self) {
        self.0
            .state::<StudioRuntime>()
            .1
            .fetch_sub(1, Ordering::SeqCst);
    }
}
struct Session {
    child: Child,
    base: String,
}
#[derive(Serialize, Type)]
pub struct StudioSession {
    url: String,
}
#[derive(Deserialize)]
struct Status {
    busy: bool,
    version: String,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|_| "studio_unavailable".into())
}

#[tauri::command]
#[specta::specta]
pub async fn creative_studio_session(app: AppHandle) -> Result<StudioSession, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("studio_platform".into())
    }
    #[cfg(target_os = "macos")]
    {
        let app_clone = app.clone();
        tauri::async_runtime::spawn_blocking(move || start(&app_clone))
            .await
            .map_err(|_| "studio_unavailable".to_string())?
    }
}

#[cfg(target_os = "macos")]
fn start(app: &AppHandle) -> Result<StudioSession, String> {
    use std::io::{Read, Write};
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    let runtime = app.state::<StudioRuntime>();
    let mut state = runtime.0.lock().map_err(|_| "studio_unavailable")?;
    if runtime.2.load(Ordering::SeqCst) {
        return Err("studio_updating".into());
    }
    if let Some(session) = state.as_mut() {
        if session
            .child
            .try_wait()
            .map_err(|_| "studio_unavailable")?
            .is_none()
        {
            return Ok(StudioSession {
                url: format!("{}/app", session.base),
            });
        }
    }
    *state = None;
    let resources = app
        .path()
        .resource_dir()
        .map_err(|_| "studio_unavailable")?;
    let executable = resources.join("resources/studio-runtime/say-less-studio");
    if !executable.is_file() {
        return Err("studio_missing".into());
    }
    let home = app
        .path()
        .app_data_dir()
        .map_err(|_| "studio_unavailable")?
        .join("creative-studio");
    std::fs::create_dir_all(&home).map_err(|_| "studio_storage")?;
    let legacy = app
        .path()
        .home_dir()
        .map_err(|_| "studio_storage")?
        .join("Desktop/_Code/say-less-bridge");
    let mut bytes = [0_u8; 32];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .map_err(|_| "studio_unavailable")?;
    let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let options = serde_json::json!({"token": token, "home": home, "legacy": legacy,
        "version": app.package_info().version.to_string()});
    let port_file = home.join("state/port.txt");
    if port_file.exists() {
        std::fs::remove_file(&port_file).map_err(|_| "studio_storage")?;
    }
    let mut child = Command::new(executable)
        .process_group(0)
        .env(
            "PATH",
            format!(
                "{}:{}/.claude/skills/subpowers/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
                app.path()
                    .home_dir()
                    .map_err(|_| "studio_storage")?
                    .join(".local/bin")
                    .display(),
                app.path()
                    .home_dir()
                    .map_err(|_| "studio_storage")?
                    .display()
            ),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "studio_unavailable")?;
    let ready = (|| {
        let mut stdin = child.stdin.take().ok_or("studio_unavailable")?;
        writeln!(stdin, "{options}").map_err(|_| "studio_unavailable")?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while std::time::Instant::now() < deadline {
            if child
                .try_wait()
                .map_err(|_| "studio_unavailable")?
                .is_some()
            {
                return Err("studio_unavailable");
            }
            if let Ok(port) = std::fs::read_to_string(&port_file) {
                if let Ok(port) = port.trim().parse::<u16>() {
                    if port != 0 {
                        return Ok(format!("http://127.0.0.1:{port}/s/{token}"));
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        Err("studio_unavailable")
    })();
    match ready {
        Ok(base) => {
            let url = format!("{base}/app");
            *state = Some(Session { child, base });
            Ok(StudioSession { url })
        }
        Err(error) => {
            terminate(&mut child);
            let _ = child.wait();
            Err(error.into())
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn creative_studio_busy(app: AppHandle) -> Result<bool, String> {
    if app.state::<StudioRuntime>().1.load(Ordering::SeqCst) > 0 {
        return Ok(true);
    }
    let base = {
        let runtime = app.state::<StudioRuntime>();
        let mut state = runtime.0.lock().map_err(|_| "studio_unavailable")?;
        match state.as_mut() {
            None => return Ok(false),
            Some(session) => {
                if session
                    .child
                    .try_wait()
                    .map_err(|_| "studio_unavailable")?
                    .is_some()
                {
                    *state = None;
                    return Ok(false);
                }
                session.base.clone()
            }
        }
    };
    let status: Status = client()?
        .get(format!("{base}/desktop-status"))
        .send()
        .await
        .map_err(|_| "studio_unavailable")?
        .error_for_status()
        .map_err(|_| "studio_unavailable")?
        .json()
        .await
        .map_err(|_| "studio_unavailable")?;
    if status.version != app.package_info().version.to_string() {
        return Err("studio_unavailable".into());
    }
    Ok(status.busy)
}

pub fn stop(app: &AppHandle) {
    if let Some(runtime) = app.try_state::<StudioRuntime>() {
        if let Ok(mut state) = runtime.0.lock() {
            if let Some(mut session) = state.take() {
                terminate(&mut session.child);
                let _ = session.child.wait();
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn creative_studio_connections(
    app: AppHandle,
    settings: Option<String>,
) -> Result<String, String> {
    let session = creative_studio_session(app).await?;
    let base = session
        .url
        .strip_suffix("/app")
        .ok_or("studio_unavailable")?;
    let http = client()?;
    let request = match settings {
        Some(body) if body.len() <= 4096 => http
            .post(format!("{base}/desktop-connections"))
            .header("Content-Type", "application/json")
            .body(body),
        Some(_) => return Err("studio_settings".into()),
        None => http.get(format!("{base}/desktop-connections")),
    };
    request
        .send()
        .await
        .map_err(|_| "studio_unavailable")?
        .error_for_status()
        .map_err(|_| "studio_settings")?
        .text()
        .await
        .map_err(|_| "studio_unavailable".into())
}

#[tauri::command]
#[specta::specta]
pub async fn creative_studio_prepare_update(app: AppHandle, resume: bool) -> Result<bool, String> {
    let base = {
        let runtime = app.state::<StudioRuntime>();
        let state = runtime.0.lock().map_err(|_| "studio_unavailable")?;
        if !resume && runtime.1.load(Ordering::SeqCst) > 0 {
            return Ok(true);
        }
        runtime.2.store(!resume, Ordering::SeqCst);
        match state.as_ref() {
            None => return Ok(false),
            Some(s) => s.base.clone(),
        }
    };
    let route = if resume {
        "desktop-resume"
    } else {
        "desktop-prepare-update"
    };
    let response = client()?
        .post(format!("{base}/{route}"))
        .send()
        .await
        .map_err(|_| "studio_unavailable")?
        .error_for_status()
        .map_err(|_| "studio_unavailable")?;
    if resume {
        return Ok(false);
    }
    let status: Status = response.json().await.map_err(|_| "studio_unavailable")?;
    if status.busy {
        app.state::<StudioRuntime>()
            .2
            .store(false, Ordering::SeqCst);
    }
    Ok(status.busy)
}

fn terminate(child: &mut Child) {
    #[cfg(target_os = "macos")]
    // PyInstaller's one-file loader has a child Python process. Terminate the
    // group, so quitting never leaves the private HTTP service running.
    unsafe {
        unsafe extern "C" {
            fn kill(pid: i32, signal: i32) -> i32;
        }
        kill(-(child.id() as i32), 15);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = child.kill();
}

#[tauri::command]
#[specta::specta]
pub async fn creative_studio_native(
    app: AppHandle,
    action: String,
    value: String,
) -> Result<String, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    if action == "copy" && value.len() <= 100_000 {
        app.clipboard()
            .write_text(value)
            .map_err(|_| "studio_clipboard")?;
        return Ok(String::new());
    }
    #[cfg(target_os = "macos")]
    {
        if action == "reveal" {
            let home = app.path().home_dir().map_err(|_| "studio_storage")?;
            let path = std::path::PathBuf::from(value);
            if path == home.join("Pictures/Say Less Images") || path == home.join("Movies/Say Less")
            {
                std::fs::create_dir_all(&path).map_err(|_| "studio_storage")?;
            }
            let file = path.canonicalize().map_err(|_| "studio_storage")?;
            if !file.starts_with(home) || !(file.is_file() || file.is_dir()) {
                return Err("studio_storage".into());
            }
            let mut command = std::process::Command::new("/usr/bin/open");
            if file.is_file() {
                command.arg("-R");
            }
            command.arg(file).spawn().map_err(|_| "studio_storage")?;
            return Ok(String::new());
        }
        if action == "capture" && ["screen", "region"].contains(&value.as_str()) {
            {
                let runtime = app.state::<StudioRuntime>();
                let _state = runtime.0.lock().map_err(|_| "studio_unavailable")?;
                if runtime.2.load(Ordering::SeqCst) {
                    return Err("studio_updating".into());
                }
                runtime.1.fetch_add(1, Ordering::SeqCst);
            }
            let capture_guard = CaptureGuard(app.clone());
            let directory = app
                .path()
                .app_data_dir()
                .map_err(|_| "studio_storage")?
                .join("creative-studio/state/captures");
            return tauri::async_runtime::spawn_blocking(move || {
                let _guard = capture_guard;
                std::fs::create_dir_all(&directory).map_err(|_| "studio_storage")?;
                let stamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|_| "studio_storage")?
                    .as_nanos();
                let file = directory.join(format!("capture-{stamp}.png"));
                let mut command = std::process::Command::new("/usr/sbin/screencapture");
                command.arg("-x");
                if value == "region" {
                    command.arg("-i");
                }
                let mut child = command.arg(&file).spawn().map_err(|_| "studio_capture")?;
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
                while child.try_wait().map_err(|_| "studio_capture")?.is_none() {
                    if std::time::Instant::now() > deadline {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err("studio_capture".to_string());
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                if !file.is_file() {
                    return Err("studio_capture".to_string());
                }
                Ok(file.to_string_lossy().into_owned())
            })
            .await
            .map_err(|_| "studio_capture".to_string())?;
        }
    }
    Err("studio_action".into())
}
