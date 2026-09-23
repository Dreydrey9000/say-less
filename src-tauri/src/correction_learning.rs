//! Local spelling learning. Full field contents are transient, never stored.
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::prepare;

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct LearnedCorrection {
    pub trigger: String,
    pub expansion: String,
    pub observations: u32,
    pub active: bool,
}
static STORE_LOCK: Mutex<()> = Mutex::new(());
fn read(app: &AppHandle) -> Result<Vec<LearnedCorrection>, String> {
    let store = app
        .store(crate::portable::store_path("learned-corrections.json"))
        .map_err(|_| "storage")?;
    serde_json::from_value(
        store
            .get("corrections")
            .unwrap_or_else(|| serde_json::json!([])),
    )
    .map_err(|_| "storage".into())
}
fn write(app: &AppHandle, rows: &[LearnedCorrection]) -> Result<(), String> {
    let store = app
        .store(crate::portable::store_path("learned-corrections.json"))
        .map_err(|_| "storage")?;
    let before = store.get("corrections");
    store.set(
        "corrections",
        serde_json::to_value(rows).map_err(|_| "storage")?,
    );
    if store.save().is_err() {
        if let Some(before) = before {
            store.set("corrections", before);
        } else {
            store.delete("corrections");
        }
        return Err("storage".into());
    }
    let _ = app.emit("learned-corrections-changed", ());
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub fn list_learned_corrections(app: AppHandle) -> Result<Vec<LearnedCorrection>, String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "storage")?;
    read(&app)
}
#[tauri::command]
#[specta::specta]
pub fn review_learned_correction(
    app: AppHandle,
    trigger: String,
    keep: bool,
) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "storage")?;
    let mut rows = read(&app)?;
    let index = rows
        .iter()
        .position(|r| r.trigger == trigger)
        .ok_or("missing")?;
    if keep {
        rows[index].active = true;
    } else {
        rows.remove(index);
    }
    write(&app, &rows)
}
fn observe(app: &AppHandle, trigger: String, expansion: String) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "storage")?;
    let mut rows = read(app)?;
    record_observation(&mut rows, trigger, expansion);
    write(app, &rows)
}
fn record_observation(rows: &mut Vec<LearnedCorrection>, trigger: String, expansion: String) {
    if let Some(row) = rows
        .iter_mut()
        .find(|r| r.trigger.eq_ignore_ascii_case(&trigger))
    {
        if row.expansion == expansion {
            row.observations = row.observations.saturating_add(1);
            row.active |= row.observations >= 2;
        } else if !row.active {
            row.expansion = expansion;
            row.observations = 1;
        }
    } else if rows.len() < 200 {
        rows.push(LearnedCorrection {
            trigger,
            expansion,
            observations: 1,
            active: false,
        });
    }
}
pub fn apply(app: &AppHandle, text: &str, explicit: &[crate::snippets::VoiceSnippet]) -> String {
    let rows = list_learned_corrections(app.clone()).unwrap_or_default();
    let rules = rows
        .into_iter()
        .filter(|r| {
            r.active
                && !explicit
                    .iter()
                    .any(|e| e.trigger.eq_ignore_ascii_case(&r.trigger))
        })
        .map(|r| crate::snippets::VoiceSnippet {
            trigger: r.trigger,
            expansion: r.expansion,
        })
        .collect::<Vec<_>>();
    crate::snippets::replace_words(text, &rules)
}

/// A single similar word changed, with all other words preserved. No phrases,
/// numbers, punctuation-only edits, insertions, or wholesale rewrites learned.
fn spelling_edit(before: &str, after: &str) -> Option<(String, String)> {
    let words = |s: &str| {
        s.split_whitespace()
            .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()).to_owned())
            .collect::<Vec<_>>()
    };
    let old = words(before);
    let new = words(after);
    if old.len() != new.len() || old.is_empty() {
        return None;
    }
    let differences = old
        .iter()
        .zip(&new)
        .filter(|(a, b)| a != b)
        .collect::<Vec<_>>();
    if differences.len() != 1 {
        return None;
    }
    let (a, b) = differences[0];
    if ![a, b]
        .iter()
        .all(|s| (2..=60).contains(&s.chars().count()) && s.chars().all(char::is_alphabetic))
    {
        return None;
    }
    if strsim::normalized_levenshtein(&a.to_lowercase(), &b.to_lowercase()) < 0.5 {
        return None;
    }
    Some((a.clone(), b.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_edits_activate_and_do_not_overwrite_accepted_spelling() {
        let mut rows = vec![];
        record_observation(&mut rows, "Louise".into(), "Luis".into());
        assert!(!rows[0].active);
        record_observation(&mut rows, "Louise".into(), "Luis".into());
        assert!(rows[0].active);
        assert_eq!(rows[0].observations, 2);
        record_observation(&mut rows, "Louise".into(), "Louisa".into());
        assert_eq!(rows[0].expansion, "Luis");
    }
    #[test]
    fn detects_only_bounded_spelling_edits() {
        assert_eq!(
            spelling_edit("Send Louise the file.", "Send Luis the file."),
            Some(("Louise".into(), "Luis".into()))
        );
        assert_eq!(
            spelling_edit("send luis the file", "send Luis the file"),
            Some(("luis".into(), "Luis".into()))
        );
        for (a, b) in [
            ("pay 100", "pay 900"),
            ("hello there", "hello"),
            ("hello there", "goodbye friend"),
            ("hello!", "hello?"),
            ("I like this", "I Luis this"),
        ] {
            assert!(spelling_edit(a, b).is_none(), "{a} -> {b}");
        }
    }
}
