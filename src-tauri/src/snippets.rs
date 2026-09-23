//! Local, deterministic voice shortcuts. Expansions are never executed or recursively expanded.
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE: &str = "voice_snippets.json";
const MAX_SNIPPETS: usize = 100;

#[derive(Clone, Debug, Deserialize, Serialize, Type, PartialEq)]
pub struct VoiceSnippet {
    pub trigger: String,
    pub expansion: String,
}

fn tokens(text: &str) -> Vec<(usize, usize, String)> {
    let mut result = Vec::new();
    let mut start = None;
    for (offset, ch) in text.char_indices() {
        if ch.is_alphanumeric() || ch == '_' {
            start.get_or_insert(offset);
        } else if let Some(begin) = start.take() {
            result.push((begin, offset, text[begin..offset].to_lowercase()));
        }
    }
    if let Some(begin) = start {
        result.push((begin, text.len(), text[begin..].to_lowercase()));
    }
    result
}

fn key(text: &str) -> Vec<String> {
    tokens(text).into_iter().map(|(_, _, word)| word).collect()
}

fn validate(snippets: &[VoiceSnippet]) -> Result<(), String> {
    if snippets.len() > MAX_SNIPPETS {
        return Err("too_many".into());
    }
    let mut seen = HashSet::new();
    for snippet in snippets {
        let normalized = key(&snippet.trigger);
        if normalized.is_empty() || snippet.trigger.chars().count() > 80 {
            return Err("invalid_trigger".into());
        }
        if snippet.expansion.trim().is_empty() || snippet.expansion.chars().count() > 4000 {
            return Err("invalid_expansion".into());
        }
        if !seen.insert(normalized) {
            return Err("duplicate".into());
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn list_voice_snippets(app: AppHandle) -> Result<Vec<VoiceSnippet>, String> {
    let store = app
        .store(crate::portable::store_path(STORE))
        .map_err(|_| "storage")?;
    let snippets = match store.get("snippets") {
        Some(value) => serde_json::from_value(value).map_err(|_| "storage")?,
        None => Vec::new(),
    };
    validate(&snippets)?;
    Ok(snippets)
}

#[tauri::command]
#[specta::specta]
pub fn save_voice_snippets(app: AppHandle, snippets: Vec<VoiceSnippet>) -> Result<(), String> {
    validate(&snippets)?;
    let store = app
        .store(crate::portable::store_path(STORE))
        .map_err(|_| "storage")?;
    let previous = store.get("snippets");
    store.set(
        "snippets",
        serde_json::to_value(snippets).map_err(|_| "storage")?,
    );
    if store.save().is_err() {
        if let Some(value) = previous {
            store.set("snippets", value);
        } else {
            store.delete("snippets");
        }
        return Err("storage".into());
    }
    Ok(())
}

/// A whole-utterance cue returns the exact saved text. Inside a sentence,
/// longest phrases win, but cannot cross sentence punctuation or word boundaries.
pub fn expand(text: &str, snippets: &[VoiceSnippet]) -> String {
    expand_with_match(text, snippets).0
}

pub fn expand_with_match(text: &str, snippets: &[VoiceSnippet]) -> (String, bool) {
    let input = tokens(text);
    let mut candidates: Vec<_> = snippets
        .iter()
        .map(|s| (key(&s.trigger), &s.expansion))
        .filter(|(k, _)| !k.is_empty())
        .collect();
    candidates.sort_by_key(|(k, _)| std::cmp::Reverse(k.len()));
    if let Some((_, expansion)) = candidates
        .iter()
        .find(|(k, _)| k.iter().eq(input.iter().map(|t| &t.2)))
    {
        return ((*expansion).clone(), true);
    }
    let mut result = String::new();
    let mut copied = 0;
    let mut i = 0;
    let mut matched_any = false;
    while i < input.len() {
        let matched = candidates.iter().find(|(k, _)| {
            i + k.len() <= input.len()
                && k.iter().eq(input[i..i + k.len()].iter().map(|t| &t.2))
                && (i + 1..i + k.len()).all(|j| {
                    text[input[j - 1].1..input[j].0]
                        .chars()
                        .all(char::is_whitespace)
                })
        });
        if let Some((k, expansion)) = matched {
            matched_any = true;
            result.push_str(&text[copied..input[i].0]);
            result.push_str(expansion);
            copied = input[i + k.len() - 1].1;
            i += k.len();
        } else {
            i += 1;
        }
        // Bound expansion growth without ever returning a partial transcript.
        if result.len() > 100_000 {
            return (text.to_owned(), false);
        }
    }
    result.push_str(&text[copied..]);
    (result, matched_any)
}

#[tauri::command]
#[specta::specta]
pub fn preview_voice_snippets(text: String, snippets: Vec<VoiceSnippet>) -> Result<String, String> {
    validate(&snippets)?;
    if text.chars().count() > 4000 {
        return Err("too_long".into());
    }
    Ok(expand(&text, &snippets))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snippet(trigger: &str, expansion: &str) -> VoiceSnippet {
        VoiceSnippet {
            trigger: trigger.into(),
            expansion: expansion.into(),
        }
    }
    #[test]
    fn whole_utterance_keeps_saved_formatting_and_casing() {
        assert_eq!(
            expand(
                "  MY Booking Link! ",
                &[snippet(
                    "my booking link",
                    "Book here:\nhttps://example.com/Book"
                )]
            ),
            "Book here:\nhttps://example.com/Book"
        );
    }
    #[test]
    fn longest_match_wins_without_recursion() {
        let s = [
            snippet("my link", "SHORT"),
            snippet("my link please", "my link"),
        ];
        assert_eq!(
            expand("Send my link please, then my link.", &s),
            "Send my link, then SHORT."
        );
    }
    #[test]
    fn respects_word_and_sentence_boundaries() {
        let s = [snippet("my link", "URL")];
        assert_eq!(
            expand("dummy link and my_link and my. Link tomorrow", &s),
            "dummy link and my_link and my. Link tomorrow"
        );
    }
    #[test]
    fn unicode_and_repeated_cues_preserve_original_text() {
        let s = [
            snippet("私のリンク", "https://example.com"),
            snippet("café link", "CAFÉ"),
        ];
        assert_eq!(expand("Use café link, café link!", &s), "Use CAFÉ, CAFÉ!");
        assert_eq!(expand("私のリンク。", &s), "https://example.com");
    }
    #[test]
    fn rejects_ambiguous_empty_and_oversized_entries() {
        assert_eq!(
            validate(&[snippet("My Link", "x"), snippet("my link!", "y")]),
            Err("duplicate".into())
        );
        assert!(validate(&[snippet("!!!", "x")]).is_err());
        assert!(validate(&[snippet("link", "  ")]).is_err());
        assert!(validate(&vec![snippet("link", "x"); 101]).is_err());
    }
    #[test]
    fn empty_library_preserves_transcript() {
        assert_eq!(expand("Hello, world!", &[]), "Hello, world!");
    }
    #[test]
    fn identical_expansion_still_counts_as_a_match() {
        assert_eq!(
            expand_with_match("My Link", &[snippet("my link", "My Link")]),
            ("My Link".into(), true)
        );
    }
}
