//! Read-only Wispr migration. Only dictionary/snippets and opt-in history text are read.
use crate::snippets::{self, VoiceSnippet};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{collections::HashSet, path::PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ImportPreview {
    pub words: Vec<String>,
    pub snippets: Vec<VoiceSnippet>,
    pub skipped: u32,
    pub history_count: u32,
    pub fingerprint: String,
}
#[derive(Serialize, Type)]
pub struct ImportReport {
    pub words_added: u32,
    pub snippets_added: u32,
    pub history_added: u32,
    pub history_error: bool,
}
#[derive(Serialize, Type)]
pub struct ImportedHistory {
    pub id: String,
    pub text: String,
    pub timestamp: String,
}
fn source_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(PathBuf::from(std::env::var_os("HOME").ok_or("not_found")?)
            .join("Library/Application Support/Wispr Flow/flow.sqlite"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("unsupported_platform".into())
    }
}
fn source() -> Result<Connection, String> {
    let conn = Connection::open_with_flags(source_path()?, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "not_found")?;
    conn.busy_timeout(std::time::Duration::from_secs(2))
        .map_err(|_| "source_busy")?;
    Ok(conn)
}
fn read_source() -> Result<ImportPreview, String> {
    let conn = source()?;
    let mut stmt=conn.prepare("SELECT phrase,replacement,isSnippet FROM Dictionary WHERE isDeleted=0 ORDER BY modifiedAt DESC LIMIT 10001").map_err(|_|"unsupported_schema")?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, bool>(2)?,
            ))
        })
        .map_err(|_| "source_busy")?;
    let mut result = ImportPreview {
        words: vec![],
        snippets: vec![],
        skipped: 0,
        history_count: 0,
        fingerprint: String::new(),
    };
    for row in rows {
        let (phrase, replacement, is_snippet) = row.map_err(|_| "unsupported_schema")?;
        if let Some(text) = replacement.filter(|s| !s.trim().is_empty()) {
            result.snippets.push(VoiceSnippet {
                trigger: phrase,
                expansion: text,
            });
        } else if !is_snippet {
            result.words.push(phrase);
        } else {
            result.skipped += 1;
        }
    }
    if result.words.len() + result.snippets.len() > 10000 {
        return Err("too_many".into());
    }
    result.history_count = conn
        .query_row("SELECT COUNT(*) FROM History", [], |r| r.get(0))
        .unwrap_or(0);
    Ok(result)
}
fn parse_csv(text: &str) -> Result<Vec<Vec<String>>, String> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut closed = false;
    let mut chars = text.trim_start_matches('\u{feff}').chars().peekable();
    while let Some(c) = chars.next() {
        if quoted {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    field.push('"');
                } else {
                    quoted = false;
                    closed = true;
                }
            } else {
                field.push(c);
            }
            continue;
        }
        match c {
            '"' if field.trim().is_empty() && !closed => {
                field.clear();
                quoted = true;
            }
            ',' => {
                row.push(field.trim().into());
                field.clear();
                closed = false;
            }
            '\n' | '\r' => {
                if c == '\r' && chars.peek() == Some(&'\n') {
                    chars.next();
                }
                row.push(field.trim().into());
                field.clear();
                closed = false;
                if row.iter().any(|s: &String| !s.is_empty()) {
                    rows.push(std::mem::take(&mut row));
                } else {
                    row.clear();
                }
            }
            _ => {
                if closed && !c.is_whitespace() {
                    return Err("invalid_file".into());
                }
                field.push(c);
            }
        }
    }
    if quoted {
        return Err("invalid_file".into());
    }
    row.push(field.trim().into());
    if row.iter().any(|s| !s.is_empty()) {
        rows.push(row);
    }
    Ok(rows)
}
fn read_file(content: &str) -> Result<ImportPreview, String> {
    if content.len() > 3 * 1024 * 1024 {
        return Err("file_too_large".into());
    }
    let mut p = ImportPreview {
        words: vec![],
        snippets: vec![],
        skipped: 0,
        history_count: 0,
        fingerprint: String::new(),
    };
    if content.trim_start().starts_with('[') {
        let entries: Vec<serde_json::Value> =
            serde_json::from_str(content).map_err(|_| "invalid_file")?;
        if entries.len() > 1000 {
            return Err("too_many".into());
        }
        for e in entries {
            match (
                e.get("name").and_then(|v| v.as_str()),
                e.get("text").and_then(|v| v.as_str()),
            ) {
                (Some(name), Some(text)) => p.snippets.push(VoiceSnippet {
                    trigger: name.into(),
                    expansion: text.into(),
                }),
                _ => p.skipped += 1,
            }
        }
    } else {
        let rows = parse_csv(content)?;
        if rows.len() > 1000 {
            return Err("too_many".into());
        }
        for row in rows {
            match row.as_slice() {
                [word] => p.words.push(word.clone()),
                [word, correction] if correction.is_empty() => p.words.push(word.clone()),
                [word, correction] => p.snippets.push(VoiceSnippet {
                    trigger: word.clone(),
                    expansion: correction.clone(),
                }),
                _ => p.skipped += 1,
            }
        }
    }
    Ok(p)
}
fn deduplicate(mut p: ImportPreview, words: &[String], existing: &[VoiceSnippet]) -> ImportPreview {
    let mut seen_words: HashSet<String> = words.iter().map(|s| s.to_lowercase()).collect();
    let mut seen_snippets: HashSet<String> = existing
        .iter()
        .map(|s| crate::studio::cue_key(&s.trigger))
        .collect();
    p.words.retain(|word| {
        let valid = !word.trim().is_empty()
            && word.chars().count() <= 80
            && seen_words.insert(word.to_lowercase());
        if !valid {
            p.skipped += 1;
        }
        valid
    });
    let mut count = existing.len();
    p.snippets.retain(|s| {
        let valid = count < 1000
            && snippets::validate(std::slice::from_ref(s)).is_ok()
            && seen_snippets.insert(crate::studio::cue_key(&s.trigger));
        if valid {
            count += 1;
        } else {
            p.skipped += 1;
        }
        valid
    });
    use std::hash::{Hash, Hasher};
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    if let Ok(bytes) = serde_json::to_vec(&p) {
        bytes.hash(&mut hash);
    }
    p.fingerprint = format!("{:016x}", hash.finish());
    p
}
#[tauri::command]
#[specta::specta]
pub async fn preview_wispr_import(
    app: AppHandle,
    content: Option<String>,
) -> Result<ImportPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = match content {
            Some(c) => read_file(&c)?,
            None => read_source()?,
        };
        Ok(deduplicate(
            p,
            &crate::settings::get_settings(&app).custom_words,
            &snippets::list_voice_snippets(app.clone())?,
        ))
    })
    .await
    .map_err(|_| "import_failed".to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn apply_wispr_import(
    app: AppHandle,
    content: Option<String>,
    include_history: bool,
    expected_fingerprint: String,
) -> Result<ImportReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        static IMPORT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = IMPORT_LOCK.lock().map_err(|_| "storage")?;
        let local = content.is_none();
        let mut settings = crate::settings::get_settings(&app);
        let old_snippets = snippets::list_voice_snippets(app.clone())?;
        let p = deduplicate(
            match content {
                Some(c) => read_file(&c)?,
                None => read_source()?,
            },
            &settings.custom_words,
            &old_snippets,
        );
        if p.fingerprint != expected_fingerprint {
            return Err("source_changed".into());
        }
        let mut merged = old_snippets.clone();
        merged.extend(p.snippets.clone());
        snippets::validate(&merged)?;
        let store = app
            .store(crate::portable::store_path(
                crate::settings::SETTINGS_STORE_PATH,
            ))
            .map_err(|_| "storage")?;
        let previous = store.get("settings");
        // Keep a durable pre-import snapshot; never modify Wispr's files.
        let backup = app
            .store(crate::portable::store_path("wispr-import-backup.json"))
            .map_err(|_| "storage")?;
        if backup.get("custom_words").is_none() {
            backup.set(
                "custom_words",
                serde_json::to_value(&settings.custom_words).map_err(|_| "storage")?,
            );
            backup.set(
                "snippets",
                serde_json::to_value(&old_snippets).map_err(|_| "storage")?,
            );
            backup.save().map_err(|_| "storage")?;
        }
        settings.custom_words.extend(p.words.clone());
        snippets::save_voice_snippets(app.clone(), merged)?;
        store.set(
            "settings",
            serde_json::to_value(settings).map_err(|_| "storage")?,
        );
        if store.save().is_err() {
            if let Some(old) = previous {
                store.set("settings", old);
            } else {
                store.delete("settings");
            }
            let _ = snippets::save_voice_snippets(app.clone(), old_snippets);
            return Err("storage".into());
        }
        let history = if include_history && local {
            import_history(&app)
        } else {
            Ok(0)
        };
        Ok(ImportReport {
            words_added: p.words.len() as u32,
            snippets_added: p.snippets.len() as u32,
            history_added: history.clone().unwrap_or(0),
            history_error: history.is_err(),
        })
    })
    .await
    .map_err(|_| "import_failed".to_string())?
}
fn archive(app: &AppHandle) -> Result<Connection, String> {
    let root = app.path().app_data_dir().map_err(|_| "storage")?;
    std::fs::create_dir_all(&root).map_err(|_| "storage")?;
    let conn = Connection::open(root.join("wispr-history.sqlite")).map_err(|_| "storage")?;
    conn.execute_batch("CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY,text TEXT NOT NULL,timestamp TEXT NOT NULL)").map_err(|_|"storage")?;
    Ok(conn)
}
fn import_history(app: &AppHandle) -> Result<u32, String> {
    let src = source()?;
    let mut dst = archive(app)?;
    let tx = dst.transaction().map_err(|_| "storage")?;
    let mut stmt=src.prepare("SELECT transcriptEntityId,COALESCE(NULLIF(editedText,''),NULLIF(formattedText,''),asrText,''),COALESCE(timestamp,'') FROM History ORDER BY timestamp DESC LIMIT 50000").map_err(|_|"unsupported_schema")?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|_| "source_busy")?;
    let mut count = 0;
    let mut bytes = 0;
    for row in rows {
        let (id, text, time) = row.map_err(|_| "source_busy")?;
        bytes += text.len();
        if bytes > 100 * 1024 * 1024 {
            return Err("history_too_large".into());
        }
        if text.trim().is_empty() {
            continue;
        }
        count += tx
            .execute(
                "INSERT OR IGNORE INTO history(id,text,timestamp) VALUES(?1,?2,?3)",
                rusqlite::params![id, text, time],
            )
            .map_err(|_| "storage")? as u32;
    }
    tx.commit().map_err(|_| "storage")?;
    Ok(count)
}
#[tauri::command]
#[specta::specta]
pub async fn list_imported_history(
    app: AppHandle,
    offset: u32,
) -> Result<Vec<ImportedHistory>, String> {
    tauri::async_runtime::spawn_blocking(move||{let conn=archive(&app)?;let mut stmt=conn.prepare("SELECT id,text,timestamp FROM history ORDER BY timestamp DESC,id LIMIT 50 OFFSET ?1").map_err(|_|"storage")?;let rows=stmt.query_map([offset],|r|Ok(ImportedHistory{id:r.get(0)?,text:r.get(1)?,timestamp:r.get(2)?})).map_err(|_|"storage")?;rows.collect::<Result<Vec<_>,_>>().map_err(|_|"storage".into())}).await.map_err(|_|"storage".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_wispr_json_and_skips_bad_rows() {
        let p =
            read_file(r#"[{"name":"my link","text":"https://example.com"},{"name":5,"text":"x"}]"#)
                .unwrap();
        assert_eq!(p.snippets.len(), 1);
        assert_eq!(p.skipped, 1);
    }
    #[test]
    fn csv_handles_quotes_commas_crlf_and_multiline() {
        assert_eq!(
            parse_csv("\"hello, world\",greeting\r\n\"two\nlines\"\n").unwrap(),
            vec![vec!["hello, world", "greeting"], vec!["two\nlines"]]
        );
        assert!(parse_csv("\"unclosed").is_err());
    }
    #[test]
    fn imports_do_not_replace_existing_snippets() {
        let p = read_file(r#"[{"name":"My Link!","text":"new"}]"#).unwrap();
        let p = deduplicate(
            p,
            &[],
            &[VoiceSnippet {
                trigger: "my link".into(),
                expansion: "keep".into(),
            }],
        );
        assert_eq!(p.snippets.len(), 0);
        assert_eq!(p.skipped, 1);
    }
    #[test]
    fn rejects_oversized_files() {
        assert!(read_file(&"x".repeat(3 * 1024 * 1024 + 1)).is_err());
    }
}
