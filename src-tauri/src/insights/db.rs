//! Read-only access to the dictation history database.
//!
//! Every connection here is opened with SQLITE_OPEN_READ_ONLY, so Insights,
//! the notes export and the MCP server can never modify history.
//!
//! History has two sources: Say Less's own `history.db` and the opt-in Wispr
//! Flow import archive (`wispr-history.sqlite`, written by `wispr_import.rs`)
//! in the same folder. [`History`] merges both. A missing or broken Wispr
//! archive is logged and skipped; it never fails a read.

use super::engine::Transcript;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub const HISTORY_DB_FILE: &str = "history.db";
/// Wispr Flow import archive, kept next to `history.db`.
pub const WISPR_HISTORY_FILE: &str = "wispr-history.sqlite";
/// Must match `identifier` in tauri.conf.json; Tauri's app data dir is
/// `<platform data dir>/<identifier>`.
pub const APP_IDENTIFIER: &str = "com.dreythomas.sayless";

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct TranscriptHit {
    pub id: i64,
    pub timestamp: i64,
    pub text: String,
}

/// Wispr rows get negative ids (`-rowid`) so ids stay unique across both
/// files without changing their type.
pub fn source_of(id: i64) -> &'static str {
    if id < 0 {
        "wispr"
    } else {
        "say_less"
    }
}

/// `--mcp` runs without a logger, so fall back to stderr there.
fn warn(message: &str) {
    if log::max_level() == log::LevelFilter::Off {
        eprintln!("[say-less] {message}");
    } else {
        log::warn!("{message}");
    }
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

pub fn wispr_path_for(history_db: &Path) -> PathBuf {
    history_db.with_file_name(WISPR_HISTORY_FILE)
}

/// True when either history source exists.
pub fn has_any_history(history_db: &Path) -> bool {
    history_db.exists() || wispr_path_for(history_db).exists()
}

/// Wispr stores text timestamps like `2026-09-24 22:19:22.008 +00:00`.
/// Also accepts RFC 3339, a naive UTC datetime, or Unix seconds/millis.
fn parse_wispr_timestamp(raw: &str) -> Option<i64> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    if let Ok(n) = s.parse::<i64>() {
        return Some(if n.abs() >= 100_000_000_000 {
            n / 1000
        } else {
            n
        });
    }
    chrono::DateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f %:z")
        .or_else(|_| chrono::DateTime::parse_from_rfc3339(s))
        .map(|d| d.timestamp())
        .ok()
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f")
                .ok()
                .map(|d| d.and_utc().timestamp())
        })
}

fn open_wispr(path: &Path) -> Option<Connection> {
    if !path.exists() {
        return None;
    }
    match Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(conn) => {
            let _ = conn.busy_timeout(std::time::Duration::from_millis(2000));
            Some(conn)
        }
        Err(e) => {
            warn(&format!(
                "Skipping Wispr import history (could not open): {e}"
            ));
            None
        }
    }
}

fn read_wispr(conn: &Connection, since: i64) -> Result<Vec<Transcript>, rusqlite::Error> {
    let tables: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='history'",
        [],
        |row| row.get(0),
    )?;
    if tables == 0 {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare(
        "SELECT rowid, COALESCE(CAST(timestamp AS TEXT), ''), COALESCE(CAST(text AS TEXT), '')
         FROM history",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut out = Vec::new();
    let mut undated = 0usize;
    for row in rows {
        let (rowid, raw_time, text) = row?;
        if text.trim().is_empty() {
            continue;
        }
        let Some(timestamp) = parse_wispr_timestamp(&raw_time) else {
            undated += 1;
            continue;
        };
        if timestamp >= since {
            out.push(Transcript {
                id: -rowid,
                timestamp,
                text,
            });
        }
    }
    if undated > 0 {
        warn(&format!(
            "Skipped {undated} Wispr import entries without a readable date"
        ));
    }
    Ok(out)
}

fn hit(t: Transcript) -> TranscriptHit {
    TranscriptHit {
        id: t.id,
        timestamp: t.timestamp,
        text: t.text,
    }
}

/// Keep the first of any rows with the same second and the same words.
fn dedupe<T>(items: &mut Vec<T>, key: impl Fn(&T) -> (i64, String)) {
    let mut seen = HashSet::new();
    items.retain(|item| seen.insert(key(item)));
}

fn newest_first(hits: &mut Vec<TranscriptHit>, limit: u32) {
    hits.sort_by(|a, b| (b.timestamp, b.id).cmp(&(a.timestamp, a.id)));
    dedupe(hits, |h| (h.timestamp, h.text.trim().to_string()));
    hits.truncate(limit.clamp(1, 500) as usize);
}

/// Both history sources, opened read-only.
pub struct History {
    main: Option<Connection>,
    wispr: Option<Connection>,
}

/// Opens `history.db` and, when present, the Wispr archive beside it.
/// Errors only when `history.db` is unreadable or neither file exists.
pub fn open_history(history_db: &Path) -> Result<History, String> {
    let wispr_path = wispr_path_for(history_db);
    let main = if history_db.exists() || !wispr_path.exists() {
        Some(open_read_only(history_db)?)
    } else {
        None
    };
    Ok(History {
        main,
        wispr: open_wispr(&wispr_path),
    })
}

impl History {
    fn wispr_since(&self, since: i64) -> Vec<Transcript> {
        let Some(conn) = &self.wispr else {
            return Vec::new();
        };
        read_wispr(conn, since).unwrap_or_else(|e| {
            warn(&format!("Skipping Wispr import history (unreadable): {e}"));
            Vec::new()
        })
    }

    /// Oldest first, both sources.
    pub fn load_transcripts(&self, since: i64) -> Result<Vec<Transcript>, String> {
        let mut out = match &self.main {
            Some(conn) => load_transcripts(conn, since)?,
            None => Vec::new(),
        };
        out.extend(self.wispr_since(since));
        out.sort_by_key(|t| (t.timestamp, t.id));
        dedupe(&mut out, |t| (t.timestamp, t.text.trim().to_string()));
        Ok(out)
    }

    /// Same matching as [`search`], across both sources. Newest first.
    pub fn search(
        &self,
        query: &str,
        since: i64,
        limit: u32,
    ) -> Result<Vec<TranscriptHit>, String> {
        let terms: Vec<String> = query
            .split_whitespace()
            .take(8)
            .map(str::to_lowercase)
            .collect();
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        let mut hits = match &self.main {
            Some(conn) => search(conn, query, since, limit)?,
            None => Vec::new(),
        };
        hits.extend(
            self.wispr_since(since)
                .into_iter()
                .filter(|t| {
                    let text = t.text.to_lowercase();
                    terms.iter().all(|term| text.contains(term.as_str()))
                })
                .map(hit),
        );
        newest_first(&mut hits, limit);
        Ok(hits)
    }

    /// Newest first, both sources.
    pub fn recent(&self, since: i64, limit: u32) -> Result<Vec<TranscriptHit>, String> {
        let mut hits = match &self.main {
            Some(conn) => recent(conn, since, limit)?,
            None => Vec::new(),
        };
        hits.extend(self.wispr_since(since).into_iter().map(hit));
        newest_first(&mut hits, limit);
        Ok(hits)
    }
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

    /// Same schema as `wispr_import::archive`. Rows are (id, text, timestamp).
    pub fn create_wispr_fixture(path: &Path, rows: &[(&str, &str, &str)]) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE history (id TEXT PRIMARY KEY,text TEXT NOT NULL,timestamp TEXT NOT NULL)",
        )
        .unwrap();
        for (id, text, ts) in rows {
            conn.execute(
                "INSERT INTO history(id,text,timestamp) VALUES(?1,?2,?3)",
                params![id, text, ts],
            )
            .unwrap();
        }
    }

    /// Wispr's own timestamp format, in UTC.
    pub fn wispr_time(ts: i64) -> String {
        chrono::DateTime::from_timestamp(ts, 0)
            .unwrap()
            .format("%Y-%m-%d %H:%M:%S%.3f +00:00")
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{create_fixture_db, create_wispr_fixture, wispr_time};
    use super::*;

    const NOW: i64 = 1_790_000_000;
    const DAY: i64 = 86_400;

    fn texts<T>(items: &[T], text: impl Fn(&T) -> &str) -> Vec<String> {
        items.iter().map(|i| text(i).to_string()).collect()
    }

    #[test]
    fn insights_reads_both_sources_in_time_order() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(HISTORY_DB_FILE);
        create_fixture_db(
            &path,
            &[
                (NOW - 5 * DAY, "Say Less: export audio broke"),
                (NOW - DAY, "Say Less: newest"),
            ],
        );
        create_wispr_fixture(
            &wispr_path_for(&path),
            &[
                (
                    "w1",
                    "Wispr: oldest export audio note",
                    &wispr_time(NOW - 40 * DAY),
                ),
                ("w2", "Wispr: middle", &wispr_time(NOW - 3 * DAY)),
                ("w3", "   ", &wispr_time(NOW - 2 * DAY)),
                ("w4", "Wispr: no date", ""),
                // Same second and words as a Say Less row: counted once.
                ("w5", "Say Less: newest", &wispr_time(NOW - DAY)),
            ],
        );
        let history = open_history(&path).unwrap();

        let all = history.load_transcripts(i64::MIN).unwrap();
        assert_eq!(
            texts(&all, |t| &t.text),
            [
                "Wispr: oldest export audio note",
                "Say Less: export audio broke",
                "Wispr: middle",
                "Say Less: newest",
            ],
            "oldest first, blanks/undated/duplicates skipped"
        );
        assert_eq!(all[0].timestamp, NOW - 40 * DAY);
        assert_eq!(source_of(all[0].id), "wispr");
        assert_eq!(source_of(all[1].id), "say_less");

        let month = history.load_transcripts(cutoff(NOW, Some(30))).unwrap();
        assert_eq!(month.len(), 3, "window applies to Wispr rows too");

        let recent = history.recent(cutoff(NOW, None), 3).unwrap();
        assert_eq!(
            texts(&recent, |h| &h.text),
            [
                "Say Less: newest",
                "Wispr: middle",
                "Say Less: export audio broke"
            ]
        );

        let hits = history
            .search("EXPORT audio", cutoff(NOW, None), 10)
            .unwrap();
        assert_eq!(
            texts(&hits, |h| &h.text),
            [
                "Say Less: export audio broke",
                "Wispr: oldest export audio note"
            ]
        );
        assert_eq!(
            history
                .search("export", cutoff(NOW, None), 1)
                .unwrap()
                .len(),
            1
        );
        assert!(history.search("  ", i64::MIN, 10).unwrap().is_empty());

        let wispr = history.wispr.as_ref().unwrap();
        assert!(
            wispr.execute("DELETE FROM history", []).is_err(),
            "read-only"
        );
    }

    #[test]
    fn only_wispr_history_works() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(HISTORY_DB_FILE);
        create_wispr_fixture(
            &wispr_path_for(&path),
            &[
                ("a", "Imported one", &wispr_time(NOW - 2 * DAY)),
                ("b", "Imported two", &wispr_time(NOW - DAY)),
            ],
        );
        assert!(!path.exists());
        assert!(has_any_history(&path));
        let history = open_history(&path).unwrap();
        assert_eq!(history.load_transcripts(i64::MIN).unwrap().len(), 2);
        assert_eq!(
            history.recent(i64::MIN, 10).unwrap()[0].text,
            "Imported two"
        );
        assert_eq!(history.search("one", i64::MIN, 10).unwrap().len(), 1);
    }

    #[test]
    fn missing_wispr_file_is_fine() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(HISTORY_DB_FILE);
        create_fixture_db(&path, &[(NOW - DAY, "Only Say Less")]);
        let history = open_history(&path).unwrap();
        assert!(history.wispr.is_none());
        assert_eq!(history.load_transcripts(i64::MIN).unwrap().len(), 1);

        let empty = tempfile::tempdir().unwrap();
        let none = empty.path().join(HISTORY_DB_FILE);
        assert!(!has_any_history(&none));
        assert!(open_history(&none)
            .err()
            .unwrap()
            .contains("No Say Less history"));
    }

    #[test]
    fn corrupt_or_empty_wispr_file_never_breaks_history() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(HISTORY_DB_FILE);
        create_fixture_db(&path, &[(NOW - DAY, "Still here")]);
        std::fs::write(wispr_path_for(&path), b"this is not a sqlite database").unwrap();
        let history = open_history(&path).unwrap();
        assert_eq!(history.load_transcripts(i64::MIN).unwrap().len(), 1);
        assert_eq!(history.recent(i64::MIN, 10).unwrap().len(), 1);
        assert_eq!(history.search("still", i64::MIN, 10).unwrap().len(), 1);

        // Corrupt archive and no history.db: empty, not an error.
        let alone = tempfile::tempdir().unwrap();
        let path = alone.path().join(HISTORY_DB_FILE);
        std::fs::write(wispr_path_for(&path), b"garbage").unwrap();
        assert!(open_history(&path)
            .unwrap()
            .load_transcripts(i64::MIN)
            .unwrap()
            .is_empty());

        // Zero-byte archive (no table yet).
        let blank = tempfile::tempdir().unwrap();
        let path = blank.path().join(HISTORY_DB_FILE);
        create_fixture_db(&path, &[(NOW, "x")]);
        std::fs::write(wispr_path_for(&path), b"").unwrap();
        assert_eq!(
            open_history(&path)
                .unwrap()
                .load_transcripts(i64::MIN)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn locked_wispr_file_is_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(HISTORY_DB_FILE);
        create_fixture_db(&path, &[(NOW, "Say Less row")]);
        let wispr = wispr_path_for(&path);
        create_wispr_fixture(&wispr, &[("a", "Wispr row", &wispr_time(NOW))]);
        let writer = Connection::open(&wispr).unwrap();
        writer.execute_batch("BEGIN EXCLUSIVE").unwrap();
        let rows = open_history(&path)
            .unwrap()
            .load_transcripts(i64::MIN)
            .unwrap();
        assert_eq!(texts(&rows, |t| &t.text), ["Say Less row"]);
        writer.execute_batch("ROLLBACK").unwrap();
    }

    #[test]
    fn parses_wispr_timestamps() {
        let utc = NOW;
        assert_eq!(parse_wispr_timestamp(&wispr_time(utc)), Some(utc));
        assert_eq!(
            parse_wispr_timestamp("2026-09-24 22:19:22.008 +00:00"),
            Some(1_790_288_362)
        );
        assert_eq!(
            parse_wispr_timestamp("2026-09-25 00:19:22 +02:00"),
            Some(1_790_288_362),
            "offsets convert to UTC"
        );
        assert_eq!(
            parse_wispr_timestamp("2026-09-24T22:19:22.008Z"),
            Some(1_790_288_362)
        );
        assert_eq!(
            parse_wispr_timestamp("2026-09-24 22:19:22"),
            Some(1_790_288_362)
        );
        assert_eq!(parse_wispr_timestamp("1790288362"), Some(1_790_288_362));
        assert_eq!(parse_wispr_timestamp("1790288362008"), Some(1_790_288_362));
        assert_eq!(parse_wispr_timestamp(""), None);
        assert_eq!(parse_wispr_timestamp("last tuesday"), None);
    }

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
