//! "Say less, stress less": turn local dictation history into a private
//! memory of what you keep saying. See docs/stress-less.md.
//!
//! - `engine`: recurring problems / ideas, no model required.
//! - `db`: read-only history access.
//! - `export`: opt-in Obsidian-style Markdown notes.
//! - `summary`: opt-in AI digest via the user's configured provider.
//! - `mcp`: `--mcp` stdio server so Claude (or any MCP client) can search.

pub mod db;
pub mod engine;
pub mod export;
pub mod mcp;
pub mod summary;

use engine::{EngineOptions, InsightsReport};
use export::ExportReport;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "insights.json";
const EXPORT_INTERVAL_SECS: i64 = 24 * 60 * 60;
const DEFAULT_NOTES_FOLDER: &str = "Say Less Notes";

#[derive(Clone, Debug, Default, Serialize, Deserialize, Type)]
#[serde(default)]
pub struct InsightsSettings {
    // Opt-in: export notes about once a day while the app runs.
    pub export_enabled: bool,
    // `None` = ~/Documents/Say Less Notes.
    pub export_folder: Option<String>,
    pub last_export_at: Option<i64>,
    pub last_export_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct McpSetup {
    pub binary_path: String,
    pub config_json: String,
    pub claude_command: String,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn history_db(app: &AppHandle) -> Result<PathBuf, String> {
    crate::portable::app_data_dir(app)
        .map(|d| d.join(db::HISTORY_DB_FILE))
        .map_err(|e| e.to_string())
}

fn load_settings(app: &AppHandle) -> InsightsSettings {
    app.store(crate::portable::store_path(STORE_FILE))
        .ok()
        .and_then(|s| s.get("settings"))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn store_settings(app: &AppHandle, settings: &InsightsSettings) -> Result<(), String> {
    let store = app
        .store(crate::portable::store_path(STORE_FILE))
        .map_err(|_| "storage")?;
    store.set(
        "settings",
        serde_json::to_value(settings).map_err(|_| "storage")?,
    );
    store.save().map_err(|_| "storage".to_string())
}

fn default_notes_folder(app: &AppHandle) -> PathBuf {
    app.path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(DEFAULT_NOTES_FOLDER)
}

fn notes_folder(app: &AppHandle, settings: &InsightsSettings) -> PathBuf {
    settings
        .export_folder
        .as_ref()
        .filter(|f| !f.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_notes_folder(app))
}

fn compute(app: &AppHandle, days: Option<u32>) -> Result<InsightsReport, String> {
    let path = history_db(app)?;
    let at = now();
    if !db::has_any_history(&path) {
        return Ok(engine::analyze(&[], days, at, &EngineOptions::default()));
    }
    let entries = db::open_history(&path)?.load_transcripts(db::cutoff(at, days))?;
    Ok(engine::analyze(
        &entries,
        days,
        at,
        &EngineOptions::default(),
    ))
}

fn validate_days(days: Option<u32>) -> Result<Option<u32>, String> {
    match days {
        Some(d) if d == 0 || d > 3650 => Err("invalid_window".into()),
        other => Ok(other),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_insights(app: AppHandle, days: Option<u32>) -> Result<InsightsReport, String> {
    let days = validate_days(days)?;
    tauri::async_runtime::spawn_blocking(move || compute(&app, days))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn search_history_text(
    app: AppHandle,
    query: String,
    days: Option<u32>,
) -> Result<Vec<db::TranscriptHit>, String> {
    let days = validate_days(days)?;
    if query.chars().count() > 200 {
        return Err("query_too_long".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let path = history_db(&app)?;
        if !db::has_any_history(&path) {
            return Ok(Vec::new());
        }
        db::open_history(&path)?.search(&query, db::cutoff(now(), days), 100)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub fn get_insights_settings(app: AppHandle) -> InsightsSettings {
    load_settings(&app)
}

// Saves only the user-editable fields; export bookkeeping is preserved.
#[tauri::command]
#[specta::specta]
pub fn save_insights_settings(
    app: AppHandle,
    export_enabled: bool,
    export_folder: Option<String>,
) -> Result<InsightsSettings, String> {
    let folder = export_folder
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty());
    if let Some(f) = &folder {
        if !PathBuf::from(f).is_absolute() || f.len() > 1024 {
            return Err("invalid_folder".into());
        }
    }
    let mut settings = load_settings(&app);
    settings.export_enabled = export_enabled;
    settings.export_folder = folder;
    store_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
#[specta::specta]
pub fn get_default_notes_folder(app: AppHandle) -> String {
    default_notes_folder(&app).display().to_string()
}

fn run_export(app: &AppHandle) -> Result<ExportReport, String> {
    let mut settings = load_settings(app);
    let folder = notes_folder(app, &settings);
    let result = (|| {
        let path = history_db(app)?;
        let entries = if db::has_any_history(&path) {
            db::open_history(&path)?.load_transcripts(i64::MIN)?
        } else {
            Vec::new()
        };
        // Insights.md reflects the last 30 days; daily notes cover everything.
        let at = now();
        let since = db::cutoff(at, Some(30));
        let recent: Vec<_> = entries
            .iter()
            .filter(|e| e.timestamp >= since)
            .cloned()
            .collect();
        let report = engine::analyze(&recent, Some(30), at, &EngineOptions::default());
        export::write_files(&folder, &export::render(&entries, &report))
    })();
    match &result {
        Ok(_) => {
            settings.last_export_at = Some(now());
            settings.last_export_error = None;
        }
        Err(e) => settings.last_export_error = Some(e.clone()),
    }
    let _ = store_settings(app, &settings);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn export_notes_now(app: AppHandle) -> Result<ExportReport, String> {
    tauri::async_runtime::spawn_blocking(move || run_export(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub fn get_ai_summary_status(app: AppHandle) -> summary::AiSummaryStatus {
    summary::status(&crate::settings::get_settings(&app))
}

// Only runs when the user clicks "Summarize with AI".
#[tauri::command]
#[specta::specta]
pub async fn summarize_insights(app: AppHandle, days: Option<u32>) -> Result<String, String> {
    let days = validate_days(days)?;
    let settings = crate::settings::get_settings(&app);
    let app2 = app.clone();
    let report = tauri::async_runtime::spawn_blocking(move || compute(&app2, days))
        .await
        .map_err(|e| e.to_string())??;
    summary::summarize(&settings, &report).await
}

pub fn mcp_setup_for(binary: &str) -> McpSetup {
    let config = serde_json::json!({
        "mcpServers": {
            "say-less": {"command": binary, "args": ["--mcp"]}
        }
    });
    let quoted = if binary.contains(' ') || binary.contains('\'') {
        format!("\"{}\"", binary.replace('"', "\\\""))
    } else {
        binary.to_string()
    };
    McpSetup {
        binary_path: binary.to_string(),
        config_json: serde_json::to_string_pretty(&config).unwrap_or_default(),
        claude_command: format!("claude mcp add say-less -- {quoted} --mcp"),
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_mcp_setup() -> Result<McpSetup, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe = exe.canonicalize().unwrap_or(exe);
    Ok(mcp_setup_for(&exe.display().to_string()))
}

/// Nightly export: shortly after start and then hourly, export if the user
/// opted in and 24 hours have passed. Cheap when off (one small store read).
pub fn start_background_export(app: AppHandle) {
    std::thread::Builder::new()
        .name("insights-export".into())
        .spawn(move || {
            std::thread::sleep(Duration::from_secs(90));
            loop {
                let settings = load_settings(&app);
                let due = settings
                    .last_export_at
                    .map(|t| now() - t >= EXPORT_INTERVAL_SECS)
                    .unwrap_or(true);
                if settings.export_enabled && due {
                    match run_export(&app) {
                        Ok(r) => log::info!(
                            "Notes export: {} written, {} unchanged, {} skipped",
                            r.written,
                            r.unchanged,
                            r.skipped.len()
                        ),
                        Err(e) => log::warn!("Notes export failed: {e}"),
                    }
                }
                std::thread::sleep(Duration::from_secs(60 * 60));
            }
        })
        .map(|_| ())
        .unwrap_or_else(|e| log::warn!("Could not start notes export thread: {e}"));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_setup_quotes_paths_with_spaces() {
        let s = mcp_setup_for("/Applications/Say Less.app/Contents/MacOS/handy");
        assert_eq!(
            s.claude_command,
            "claude mcp add say-less -- \"/Applications/Say Less.app/Contents/MacOS/handy\" --mcp"
        );
        let v: serde_json::Value = serde_json::from_str(&s.config_json).unwrap();
        assert_eq!(v["mcpServers"]["say-less"]["args"][0], "--mcp");
        let w = mcp_setup_for(r"C:\Program Files\Say Less\handy.exe");
        let v: serde_json::Value = serde_json::from_str(&w.config_json).unwrap();
        assert_eq!(
            v["mcpServers"]["say-less"]["command"],
            r"C:\Program Files\Say Less\handy.exe"
        );
        assert_eq!(
            mcp_setup_for("/usr/bin/handy").claude_command,
            "claude mcp add say-less -- /usr/bin/handy --mcp"
        );
    }

    #[test]
    fn window_validation() {
        assert_eq!(validate_days(None).unwrap(), None);
        assert_eq!(validate_days(Some(7)).unwrap(), Some(7));
        assert!(validate_days(Some(0)).is_err());
        assert!(validate_days(Some(99_999)).is_err());
    }
}
