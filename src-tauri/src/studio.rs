//! Say Less appearance and explicit, local voice actions.
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum WritingStyle {
    #[default]
    Original,
    Formal,
    Casual,
    Lowercase,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct AppStyle {
    pub app: String,
    pub style: WritingStyle,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct VoiceAction {
    pub cue: String,
    pub kind: String,
    pub target: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(default)]
pub struct StudioSettings {
    pub accent: String,
    pub floating: bool,
    pub actions_enabled: bool,
    pub actions: Vec<VoiceAction>,
    pub default_style: WritingStyle,
    pub app_styles: Vec<AppStyle>,
}
impl Default for StudioSettings {
    fn default() -> Self {
        Self {
            accent: "#b8ff65".into(),
            floating: false,
            actions_enabled: false,
            actions: vec![],
            default_style: WritingStyle::Original,
            app_styles: vec![],
        }
    }
}
pub fn cue_key(text: &str) -> String {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(str::to_lowercase)
        .collect::<Vec<_>>()
        .join(" ")
}
fn validate(settings: &StudioSettings) -> Result<(), String> {
    if settings.accent.len() != 7
        || !settings.accent.starts_with('#')
        || !settings.accent[1..].bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("invalid_color".into());
    }
    if settings.actions.len() > 100 || settings.app_styles.len() > 100 {
        return Err("too_many".into());
    }
    let mut seen = std::collections::HashSet::new();
    for action in &settings.actions {
        let key = cue_key(&action.cue);
        if key.is_empty()
            || key.starts_with("say less")
            || action.cue.chars().count() > 80
            || !seen.insert(key)
        {
            return Err("invalid_cue".into());
        }
        validate_target(action)?;
    }
    let mut apps = std::collections::HashSet::new();
    for rule in &settings.app_styles {
        if rule.app.trim().is_empty()
            || rule.app.len() > 200
            || !apps.insert(rule.app.to_lowercase())
        {
            return Err("invalid_app".into());
        }
    }
    Ok(())
}
pub fn validate_target(action: &VoiceAction) -> Result<(), String> {
    match action.kind.as_str() {
        "website" => {
            let url = tauri::Url::parse(&action.target).map_err(|_| "invalid_target")?;
            if !["https", "http"].contains(&url.scheme())
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
            {
                return Err("invalid_target".into());
            }
        }
        "app" => {
            let path = std::path::Path::new(&action.target);
            let canonical = path.canonicalize().map_err(|_| "invalid_target")?;
            let home = std::env::var_os("HOME")
                .map(std::path::PathBuf::from)
                .unwrap_or_default()
                .join("Applications");
            if path.extension().and_then(|s| s.to_str()) != Some("app")
                || !canonical.is_dir()
                || ![
                    std::path::Path::new("/Applications"),
                    std::path::Path::new("/System/Applications"),
                    home.as_path(),
                ]
                .iter()
                .any(|root| canonical.starts_with(root))
            {
                return Err("invalid_target".into());
            }
        }
        _ => return Err("invalid_target".into()),
    }
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub fn get_studio_settings(app: AppHandle) -> Result<StudioSettings, String> {
    let store = app
        .store(crate::portable::store_path("studio.json"))
        .map_err(|_| "storage")?;
    match store.get("settings") {
        Some(value) => serde_json::from_value(value).map_err(|_| "storage".into()),
        None => Ok(StudioSettings::default()),
    }
}
#[tauri::command]
#[specta::specta]
pub async fn save_studio_settings(app: AppHandle, settings: StudioSettings) -> Result<(), String> {
    validate(&settings)?;
    let store = app
        .store(crate::portable::store_path("studio.json"))
        .map_err(|_| "storage")?;
    let previous = store.get("settings");
    store.set(
        "settings",
        serde_json::to_value(&settings).map_err(|_| "storage")?,
    );
    if store.save().is_err() {
        if let Some(p) = previous {
            store.set("settings", p);
        } else {
            store.delete("settings");
        }
        return Err("storage".into());
    }
    let _ = app.emit("studio-changed", &settings);
    crate::floating::set_visible(&app, settings.floating)?;
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub fn list_launchable_apps() -> Vec<String> {
    let mut apps = Vec::new();
    let home = std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_default()
        .join("Applications");
    for root in [
        std::path::Path::new("/Applications"),
        std::path::Path::new("/System/Applications"),
        home.as_path(),
    ] {
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().and_then(|s| s.to_str()) == Some("app") {
                    apps.push(p.to_string_lossy().into_owned());
                }
            }
        }
    }
    apps.sort();
    apps.dedup();
    apps
}
pub fn matching_action<'a>(text: &str, settings: &'a StudioSettings) -> Option<&'a VoiceAction> {
    if !settings.actions_enabled {
        return None;
    }
    let key = cue_key(text);
    let cue = key.strip_prefix("say less ")?;
    settings.actions.iter().find(|a| cue_key(&a.cue) == cue)
}
/// Only the original transcript can launch an action, never AI output or snippet text.
pub fn execute_spoken_action(app: &AppHandle, text: &str) -> Result<bool, String> {
    let settings = get_studio_settings(app.clone()).unwrap_or_default();
    let Some(action) = matching_action(text, &settings) else {
        return Ok(false);
    };
    launch(action)?;
    let _ = app.emit("voice-action-result", true);
    Ok(true)
}
fn launch(action: &VoiceAction) -> Result<(), String> {
    validate_target(action)?;
    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("/usr/bin/open");
        if action.kind == "app" {
            cmd.arg("-a");
        }
        cmd.arg(&action.target);
        let status = cmd.status().map_err(|_| "launch_failed")?;
        if !status.success() {
            return Err("launch_failed".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("unsupported_platform".into())
    }
}
#[tauri::command]
#[specta::specta]
pub fn test_voice_action(app: AppHandle, cue: String) -> Result<(), String> {
    let settings = get_studio_settings(app)?;
    let action = settings
        .actions
        .iter()
        .find(|a| a.cue == cue)
        .ok_or("not_found")?;
    launch(action)
}
pub fn format_text(text: &str, style: &WritingStyle) -> String {
    match style {
        WritingStyle::Original => text.into(),
        WritingStyle::Lowercase => text.to_lowercase(),
        WritingStyle::Casual => text.trim_end_matches('.').to_string(),
        WritingStyle::Formal => {
            let mut chars = text.chars();
            let Some(first) = chars.next() else {
                return String::new();
            };
            let mut result = first.to_uppercase().collect::<String>() + chars.as_str();
            if !result.ends_with(['.', '!', '?', ':', ';', '\n']) {
                result.push('.');
            }
            result
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn actions_require_opt_in_prefix_and_exact_cue() {
        let mut s = StudioSettings::default();
        s.actions.push(VoiceAction {
            cue: "open notes".into(),
            kind: "app".into(),
            target: "/System/Applications/Notes.app".into(),
        });
        assert!(matching_action("Say less open notes", &s).is_none());
        s.actions_enabled = true;
        assert!(matching_action("SAY LESS, open notes!", &s).is_some());
        assert!(matching_action("Please say less open notes", &s).is_none());
        assert!(matching_action("Say less open notes and delete it", &s).is_none());
    }
    #[test]
    fn rejects_executable_urls_and_credentials() {
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://user:pass@example.com",
        ] {
            assert!(validate_target(&VoiceAction {
                cue: "x".into(),
                kind: "website".into(),
                target: url.into()
            })
            .is_err());
        }
    }
    #[test]
    fn colors_are_validated() {
        let mut s = StudioSettings::default();
        s.accent = "red;display:none".into();
        assert!(validate(&s).is_err());
    }
    #[test]
    fn styles_are_deterministic() {
        assert_eq!(
            format_text("hello there", &WritingStyle::Formal),
            "Hello there."
        );
        assert_eq!(format_text("Hello!", &WritingStyle::Lowercase), "hello!");
        assert_eq!(format_text("Hello.", &WritingStyle::Casual), "Hello");
    }
}

pub async fn apply_writing_style(app: &AppHandle, text: &str) -> String {
    let settings = get_studio_settings(app.clone()).unwrap_or_default();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let _ = app.run_on_main_thread(move || {
        #[cfg(target_os = "macos")]
        let name = {
            objc2_app_kit::NSWorkspace::sharedWorkspace()
                .frontmostApplication()
                .and_then(|a| a.localizedName())
                .map(|n| n.to_string())
                .unwrap_or_default()
        };
        #[cfg(not(target_os = "macos"))]
        let name = String::new();
        let _ = tx.send(name);
    });
    let name = tokio::time::timeout(std::time::Duration::from_millis(500), rx)
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default();
    let style = settings
        .app_styles
        .iter()
        .find(|r| r.app.eq_ignore_ascii_case(&name))
        .map(|r| &r.style)
        .unwrap_or(&settings.default_style);
    format_text(text, style)
}
