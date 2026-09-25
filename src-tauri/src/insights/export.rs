//! Obsidian-friendly Markdown export of dictation history.
//!
//! Writes one `Daily/YYYY-MM-DD.md` note per day plus `Insights.md`, linked
//! with [[wikilinks]]. It only ever creates or rewrites files that carry the
//! `generated_by: say-less` marker; anything else at a target path is left
//! untouched and reported. It never deletes files.

use super::engine::{InsightsReport, Topic, TopicKind, Transcript};
use chrono::{DateTime, Local, TimeZone};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const MARKER: &str = "generated_by: say-less";
pub const DAILY_DIR: &str = "Daily";
pub const INSIGHTS_FILE: &str = "Insights.md";

#[derive(Clone, Debug, Default, Serialize, Deserialize, Type)]
pub struct ExportReport {
    pub folder: String,
    // Files created or changed this run.
    pub written: u32,
    // Files already up to date.
    pub unchanged: u32,
    // Existing files without our marker, left alone.
    pub skipped: Vec<String>,
    pub days: u32,
}

fn local(ts: i64) -> DateTime<Local> {
    Local
        .timestamp_opt(ts, 0)
        .single()
        .unwrap_or_else(|| Local.timestamp_opt(0, 0).unwrap())
}

pub fn day_key(ts: i64) -> String {
    local(ts).format("%Y-%m-%d").to_string()
}

fn kind_label(kind: TopicKind) -> &'static str {
    match kind {
        TopicKind::Problem => "Problem",
        TopicKind::Idea => "Idea",
        TopicKind::Other => "Theme",
    }
}

/// Wikilink-safe heading text (Obsidian treats `#|[]^` specially).
fn heading(label: &str) -> String {
    label
        .chars()
        .map(|c| if "#|[]^".contains(c) { ' ' } else { c })
        .collect::<String>()
        .trim()
        .to_string()
}

fn quote_block(text: &str) -> String {
    text.lines()
        .map(|l| format!("> {l}"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Markdown for every file, keyed by path relative to the export folder.
pub fn render(entries: &[Transcript], report: &InsightsReport) -> BTreeMap<String, String> {
    let mut files = BTreeMap::new();
    let mut days: BTreeMap<String, Vec<&Transcript>> = BTreeMap::new();
    for e in entries {
        days.entry(day_key(e.timestamp)).or_default().push(e);
    }

    let topics: Vec<&Topic> = report
        .problems
        .iter()
        .chain(&report.ideas)
        .chain(&report.other)
        .collect();
    // entry id -> topic headings, for backlinks from daily notes.
    let mut topics_by_entry: BTreeMap<i64, Vec<String>> = BTreeMap::new();
    for topic in &topics {
        for id in &topic.entry_ids {
            topics_by_entry
                .entry(*id)
                .or_default()
                .push(heading(&topic.label));
        }
    }

    for (day, list) in &days {
        let mut md = format!(
            "---\n{MARKER}\ndate: {day}\nentries: {}\n---\n\n# {day}\n\n",
            list.len()
        );
        let mut day_topics: Vec<String> = list
            .iter()
            .flat_map(|e| topics_by_entry.get(&e.id).cloned().unwrap_or_default())
            .collect();
        day_topics.sort();
        day_topics.dedup();
        if !day_topics.is_empty() {
            let links: Vec<String> = day_topics
                .iter()
                .map(|t| format!("[[Insights#{t}|{t}]]"))
                .collect();
            md.push_str(&format!("Recurring topics: {}\n\n", links.join(" · ")));
        }
        let mut sorted = list.clone();
        sorted.sort_by_key(|e| (e.timestamp, e.id));
        for e in sorted {
            md.push_str(&format!(
                "## {}\n\n{}\n\n",
                local(e.timestamp).format("%H:%M"),
                e.text.trim()
            ));
        }
        files.insert(format!("{DAILY_DIR}/{day}.md"), md);
    }

    let window = match report.window_days {
        Some(d) => format!("the last {d} days"),
        None => "all of your history".to_string(),
    };
    let mut md = format!(
        "---\n{MARKER}\n---\n\n# Insights\n\nWhat you kept saying over {window} ({} dictations). \
         Built on this computer from your Say Less history. Nothing was uploaded.\n\n",
        report.analyzed_entries
    );
    if let Some(top) = &report.fix_first {
        md.push_str(&format!(
            "**Fix this first:** [[#{}]] (mentioned {} times)\n\n",
            heading(&top.label),
            top.count
        ));
    }
    for (title, list) in [
        ("Recurring problems", &report.problems),
        ("Recurring ideas", &report.ideas),
        ("Other recurring themes", &report.other),
    ] {
        if list.is_empty() {
            continue;
        }
        md.push_str(&format!("## {title}\n\n"));
        for topic in list {
            md.push_str(&format!(
                "### {}\n\n{} · mentioned {} times · first {} · last {}\n\n",
                heading(&topic.label),
                kind_label(topic.kind),
                topic.count,
                day_key(topic.first_seen),
                day_key(topic.last_seen)
            ));
            if !topic.keywords.is_empty() {
                md.push_str(&format!("Related: {}\n\n", topic.keywords.join(", ")));
            }
            for q in &topic.examples {
                md.push_str(&format!(
                    "{}\n> — [[{}]]\n\n",
                    quote_block(&q.text),
                    day_key(q.timestamp)
                ));
            }
            let ids: std::collections::HashSet<i64> = topic.entry_ids.iter().copied().collect();
            let topic_days: std::collections::BTreeSet<String> = entries
                .iter()
                .filter(|e| ids.contains(&e.id))
                .map(|e| day_key(e.timestamp))
                .collect();
            let links: Vec<String> = topic_days.iter().map(|d| format!("[[{d}]]")).collect();
            md.push_str(&format!("Mentioned on: {}\n\n", links.join(", ")));
        }
    }
    if topics.is_empty() {
        md.push_str("Nothing repeats yet. Keep dictating and check back.\n");
    }
    files.insert(INSIGHTS_FILE.to_string(), md);
    files
}

fn is_ours(path: &Path) -> bool {
    fs::read_to_string(path)
        .map(|c| c.lines().take(5).any(|l| l.trim() == MARKER))
        .unwrap_or(false)
}

fn write_atomic(path: &Path, content: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("md.say-less-tmp");
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

/// Write the rendered files under `folder`. Fails with a readable message if
/// the folder cannot be created or written.
pub fn write_files(
    folder: &Path,
    files: &BTreeMap<String, String>,
) -> Result<ExportReport, String> {
    let unwritable = |e: std::io::Error| {
        format!(
            "Couldn't write notes to {}: {e}. Choose another folder in Insights.",
            folder.display()
        )
    };
    fs::create_dir_all(folder.join(DAILY_DIR)).map_err(unwritable)?;
    let mut report = ExportReport {
        folder: folder.display().to_string(),
        ..Default::default()
    };
    for (rel, content) in files {
        let path: PathBuf = folder.join(rel);
        if rel.starts_with(DAILY_DIR) {
            report.days += 1;
        }
        if path.exists() {
            if !is_ours(&path) {
                report.skipped.push(rel.clone());
                continue;
            }
            if fs::read_to_string(&path)
                .map(|c| &c == content)
                .unwrap_or(false)
            {
                report.unchanged += 1;
                continue;
            }
        }
        write_atomic(&path, content).map_err(unwritable)?;
        report.written += 1;
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::super::engine::{analyze, EngineOptions};
    use super::*;

    fn entries() -> Vec<Transcript> {
        let base = Local
            .with_ymd_and_hms(2026, 9, 17, 9, 30, 0)
            .unwrap()
            .timestamp();
        let texts = [
            "The video export audio is broken again",
            "Video export audio keeps dropping, so annoying",
            "Call the bank",
            "Another bug with the video export audio",
        ];
        texts
            .iter()
            .enumerate()
            .map(|(i, text)| Transcript {
                id: i as i64 + 1,
                timestamp: base + i as i64 * 86_400,
                text: text.to_string(),
            })
            .collect()
    }

    #[test]
    fn renders_daily_notes_and_linked_insights() {
        let e = entries();
        let report = analyze(&e, Some(30), e[3].timestamp, &EngineOptions::default());
        let files = render(&e, &report);
        assert_eq!(files.len(), 5);
        let day = &files["Daily/2026-09-17.md"];
        assert!(day.starts_with("---\ngenerated_by: say-less\n"));
        assert!(day.contains("## 09:30\n\nThe video export audio is broken again"));
        assert!(day.contains("[[Insights#video export audio|video export audio]]"));
        let insights = &files["Insights.md"];
        assert!(
            insights.contains("**Fix this first:** [[#video export audio]] (mentioned 3 times)")
        );
        assert!(insights.contains("Mentioned on: [[2026-09-17]], [[2026-09-18]], [[2026-09-20]]"));
        assert!(!files["Daily/2026-09-19.md"].contains("Recurring topics"));
    }

    #[test]
    fn never_overwrites_foreign_files_and_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("Say Less Notes");
        fs::create_dir_all(folder.join(DAILY_DIR)).unwrap();
        let mine = folder.join(DAILY_DIR).join("2026-09-18.md");
        fs::write(&mine, "my own journal").unwrap();
        let unrelated = folder.join("Shopping.md");
        fs::write(&unrelated, "eggs").unwrap();

        let e = entries();
        let report = analyze(&e, Some(30), e[3].timestamp, &EngineOptions::default());
        let files = render(&e, &report);
        let first = write_files(&folder, &files).unwrap();
        assert_eq!(first.written, 4);
        assert_eq!(first.skipped, vec!["Daily/2026-09-18.md".to_string()]);
        assert_eq!(fs::read_to_string(&mine).unwrap(), "my own journal");
        assert_eq!(fs::read_to_string(&unrelated).unwrap(), "eggs");

        let second = write_files(&folder, &files).unwrap();
        assert_eq!(second.written, 0);
        assert_eq!(second.unchanged, 4);
    }

    #[cfg(unix)]
    #[test]
    fn unwritable_folder_gives_clear_error() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let locked = dir.path().join("locked");
        fs::create_dir(&locked).unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o500)).unwrap();
        let files = BTreeMap::from([("Insights.md".to_string(), MARKER.to_string())]);
        let result = write_files(&locked.join("notes"), &files);
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o700)).unwrap();
        let err = result.unwrap_err();
        assert!(err.starts_with("Couldn't write notes to"), "{err}");
    }
}
