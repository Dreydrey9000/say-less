//! Read-only access to the dictation history database.
//!
//! Every connection here is opened with SQLITE_OPEN_READ_ONLY, so Insights,
//! the notes export and the MCP server can never modify history.

use super::engine::Transcript;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};

pub const HISTORY_DB_FILE: &str = "history.db";
/// Must match `identifier` in tauri.conf.json; Tauri's app data dir is
/// `<platform data dir>/<identifier>`.
pub const APP_IDENTIFIER: &str = "com.dreythomas.sayless";

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct TranscriptHit {
    pub id: i64,
    pub timestamp: i64,
    pub text: String,
}

/// App data dir without a running Tauri app (used by `--mcp`). Mirrors
/// Tauri's resolver: macOS `~/Library/Application Support/<id>`, Windows
/// `%APPDATA%\<id>`, Linux `$XDG_DATA_HOME/<id>` or `~/.local/share/<id>`.
/// Portable installs keep data next to the executable.
pub fn default_app_data_dir() -> Option<PathBuf> {
    if let Some(dir) = crate::portable::data_dir() {
        return Some(dir.clone());
    }
    let home = std::env::var_os("HOME").map(PathBuf::from);
    #[cfg(target_os = "macos")]
    let base = home.map(|h| h.join("Library").join("Application Support"));
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| home.map(|h| h.join(".local").join("share")));
    base.map(|b| b.join(APP_IDENTIFIER))
}

pub fn open_read_only(path: &Path) -> Result<Connection, String> {
    if !path.exists() {
        return Err(format!(
            "No Say Less history found at {}. Dictate something first, or pass --history-db.",
            path.display()
        ));
    }
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Could not open history read-only: {e}"))?;
    // The app may be writing at the same moment; wait briefly instead of failing.
    let _ = conn.busy_timeout(std::time::Duration::from_millis(2000));
    Ok(conn)
}

fn has_history_table(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='transcription_history'",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|c| c > 0)
    .unwrap_or(false)
}

/// Unix-seconds cutoff for a window of `days`, or `i64::MIN` for all history.
pub fn cutoff(now: i64, days: Option<u32>) -> i64 {
    match days {
        Some(d) if d > 0 => now - i64::from(d) * 86_400,
        _ => i64::MIN,
    }
}

/// The user's own words: raw transcription, falling back to the cleaned text.
const TEXT_SQL: &str =
    "COALESCE(NULLIF(TRIM(transcription_text), ''), NULLIF(TRIM(post_processed_text), ''), '')";

pub fn load_transcripts(conn: &Connection, since: i64) -> Result<Vec<Transcript>, String> {
    if !has_history_table(conn) {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT id, timestamp, {TEXT_SQL} FROM transcription_history
         WHERE timestamp >= ?1 ORDER BY timestamp ASC, id ASC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![since], |row| {
            Ok(Transcript {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                text: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let t = row.map_err(|e| e.to_string())?;
        if !t.text.trim().is_empty() {
            out.push(t);
        }
    }
    Ok(out)
}

fn escape_like(term: &str) -> String {
    let mut out = String::with_capacity(term.len());
    for ch in term.chars() {
        if matches!(ch, '%' | '_' | '\\') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

/// Case-insensitive search. Every word in `query` must appear (in the raw or
/// cleaned text). Newest first.
pub fn search(
    conn: &Connection,
    query: &str,
    since: i64,
    limit: u32,
) -> Result<Vec<TranscriptHit>, String> {
    if !has_history_table(conn) {
        return Ok(Vec::new());
    }
    let terms: Vec<String> = query
        .split_whitespace()
        .take(8)
        .map(|t| format!("%{}%", escape_like(&t.to_lowercase())))
        .collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let mut sql = format!(
        "SELECT id, timestamp, {TEXT_SQL} FROM transcription_history WHERE timestamp >= ?1"
    );
    for i in 0..terms.len() {
        let p = i + 2;
        sql.push_str(&format!(
            " AND (LOWER(transcription_text) LIKE ?{p} ESCAPE '\\' OR LOWER(COALESCE(post_processed_text, '')) LIKE ?{p} ESCAPE '\\')"
        ));
    }
    sql.push_str(&format!(
        " ORDER BY timestamp DESC, id DESC LIMIT ?{}",
        terms.len() + 2
    ));
    let mut values: Vec<rusqlite::types::Value> = vec![since.into()];
    values.extend(terms.into_iter().map(rusqlite::types::Value::from));
    values.push(i64::from(limit.clamp(1, 500)).into());
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(values), |row| {
            Ok(TranscriptHit {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                text: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Newest first.
pub fn recent(conn: &Connection, since: i64, limit: u32) -> Result<Vec<TranscriptHit>, String> {
    if !has_history_table(conn) {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT id, timestamp, {TEXT_SQL} FROM transcription_history
         WHERE timestamp >= ?1 ORDER BY timestamp DESC, id DESC LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![since, i64::from(limit.clamp(1, 500))], |row| {
            Ok(TranscriptHit {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                text: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
pub mod test_support {
    use rusqlite::{params, Connection};
    use std::path::Path;

    /// Same schema as HistoryManager's migrations.
    pub fn create_fixture_db(path: &Path, rows: &[(i64, &str)]) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE transcription_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                saved BOOLEAN NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                transcription_text TEXT NOT NULL,
                post_processed_text TEXT,
                post_process_prompt TEXT,
                post_process_requested BOOLEAN NOT NULL DEFAULT 0
            );",
        )
        .unwrap();
        for (ts, text) in rows {
            conn.execute(
                "INSERT INTO transcription_history (file_name, timestamp, title, transcription_text)
                 VALUES ('x.wav', ?1, 't', ?2)",
                params![ts, text],
            )
            .unwrap();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::create_fixture_db;
    use super::*;

    #[test]
    fn reads_searches_and_refuses_writes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("history.db");
        let now = 1_790_000_000;
        create_fixture_db(
            &path,
            &[
                (now - 40 * 86_400, "Old note about the 100% export"),
                (now - 3 * 86_400, "The video export audio is broken"),
                (now - 86_400, "Export finished fine"),
            ],
        );
        let conn = open_read_only(&path).unwrap();
        assert_eq!(
            load_transcripts(&conn, cutoff(now, Some(30)))
                .unwrap()
                .len(),
            2
        );
        assert_eq!(load_transcripts(&conn, cutoff(now, None)).unwrap().len(), 3);

        let hits = search(&conn, "EXPORT", cutoff(now, None), 10).unwrap();
        assert_eq!(hits.len(), 3);
        assert_eq!(hits[0].text, "Export finished fine", "newest first");
        let hits = search(&conn, "video audio", cutoff(now, None), 10).unwrap();
        assert_eq!(hits.len(), 1);
        // LIKE wildcards in the query are literal.
        let hits = search(&conn, "100%", cutoff(now, None), 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(search(&conn, "   ", cutoff(now, None), 10)
            .unwrap()
            .is_empty());

        assert_eq!(recent(&conn, cutoff(now, Some(2)), 10).unwrap().len(), 1);
        assert!(conn
            .execute("DELETE FROM transcription_history", [])
            .is_err());
    }

    #[test]
    fn missing_db_and_missing_table_are_clear() {
        let dir = tempfile::tempdir().unwrap();
        let err = open_read_only(&dir.path().join("nope.db")).unwrap_err();
        assert!(err.contains("No Say Less history"));
        let path = dir.path().join("empty.db");
        Connection::open(&path).unwrap();
        let conn = open_read_only(&path).unwrap();
        assert!(load_transcripts(&conn, i64::MIN).unwrap().is_empty());
    }
}
