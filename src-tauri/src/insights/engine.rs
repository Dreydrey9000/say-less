//! Recurring-theme engine for "Say less, stress less".
//!
//! Pure Rust, no model: normalize each transcript, drop stopwords, collect
//! keyword phrases (unigrams + adjacent bigrams), then greedily group entries
//! that share the strongest phrases into topics. Each topic is labelled a
//! Problem, an Idea, or Other from cue words in the entries it covers.
//! Everything here is deterministic and works on any platform.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::{HashMap, HashSet};

/// One dictation, as the engine sees it.
#[derive(Clone, Debug)]
pub struct Transcript {
    pub id: i64,
    /// Unix seconds.
    pub timestamp: i64,
    pub text: String,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TopicKind {
    Problem,
    Idea,
    Other,
}

impl TopicKind {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "problem" | "problems" => Some(Self::Problem),
            "idea" | "ideas" => Some(Self::Idea),
            "other" => Some(Self::Other),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct TopicQuote {
    pub entry_id: i64,
    pub timestamp: i64,
    pub text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct Topic {
    // Stable slug of the label, safe for file names and React keys.
    pub id: String,
    pub label: String,
    // Other phrases that usually appear alongside the label.
    pub keywords: Vec<String>,
    pub kind: TopicKind,
    // Number of dictations that mention this topic.
    pub count: u32,
    pub first_seen: i64,
    pub last_seen: i64,
    pub examples: Vec<TopicQuote>,
    // Every dictation in the topic, oldest first.
    pub entry_ids: Vec<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct InsightsReport {
    // `None` means all history.
    pub window_days: Option<u32>,
    pub analyzed_entries: u32,
    pub generated_at: i64,
    pub problems: Vec<Topic>,
    pub ideas: Vec<Topic>,
    pub other: Vec<Topic>,
    // The problem that came up most (ties go to the most recent).
    pub fix_first: Option<Topic>,
}

#[derive(Clone, Debug)]
pub struct EngineOptions {
    /// A phrase must appear in at least this many dictations to form a topic.
    pub min_count: usize,
    /// Topics kept per kind.
    pub per_kind_limit: usize,
    pub examples_per_topic: usize,
}

impl Default for EngineOptions {
    fn default() -> Self {
        Self {
            min_count: 2,
            per_kind_limit: 8,
            examples_per_topic: 3,
        }
    }
}

const MAX_TOPICS: usize = 40;
const MAX_CANDIDATE_PHRASES: usize = 3000;
const QUOTE_CHARS: usize = 180;
const BIGRAM_WEIGHT: f32 = 1.6;
const ABSORB_OVERLAP: f32 = 0.6;

/// Multi-word cues are matched against the space-joined lowercase words with
/// apostrophes kept, so "doesn't work" and "doesnt work" both hit.
const PROBLEM_CUES: &[&str] = &[
    "annoying",
    "annoyed",
    "annoys",
    "keeps",
    "keep happening",
    "broken",
    "broke",
    "breaks",
    "doesn't work",
    "doesnt work",
    "does not work",
    "not working",
    "isn't working",
    "isnt working",
    "won't",
    "wont work",
    "can't",
    "cant",
    "cannot",
    "can not",
    "hate",
    "frustrated",
    "frustrating",
    "bug",
    "bugs",
    "buggy",
    "again",
    "wish",
    "stuck",
    "problem",
    "problems",
    "issue",
    "issues",
    "crash",
    "crashes",
    "crashed",
    "crashing",
    "fails",
    "failing",
    "failed",
    "error",
    "errors",
    "ugh",
    "sucks",
    "painful",
];

const IDEA_CUES: &[&str] = &[
    "idea",
    "ideas",
    "what if",
    "we should",
    "i should build",
    "i want to build",
    "we could build",
    "maybe we could",
    "we could",
    "app that",
    "app idea",
    "tool that",
    "would be cool",
    "would be nice",
    "it'd be cool",
    "imagine",
    "let's build",
    "lets build",
    "we need to build",
    "build a",
    "startup",
    "business idea",
    "product idea",
    "feature idea",
    "concept",
];

const STOPWORDS: &[&str] = &[
    "a",
    "about",
    "above",
    "actually",
    "after",
    "again",
    "against",
    "ago",
    "all",
    "almost",
    "also",
    "always",
    "am",
    "an",
    "and",
    "another",
    "any",
    "anyone",
    "anything",
    "anyway",
    "are",
    "around",
    "as",
    "ask",
    "at",
    "away",
    "back",
    "bad",
    "basically",
    "be",
    "because",
    "been",
    "before",
    "being",
    "below",
    "best",
    "better",
    "between",
    "big",
    "bit",
    "both",
    "but",
    "by",
    "call",
    "came",
    "can",
    "cant",
    "cannot",
    "come",
    "could",
    "couldnt",
    "day",
    "did",
    "didnt",
    "do",
    "does",
    "doesnt",
    "doing",
    "done",
    "dont",
    "down",
    "during",
    "each",
    "else",
    "enough",
    "even",
    "ever",
    "every",
    "everything",
    "fine",
    "first",
    "for",
    "from",
    "further",
    "get",
    "gets",
    "getting",
    "give",
    "go",
    "goes",
    "going",
    "gonna",
    "good",
    "got",
    "gotta",
    "great",
    "had",
    "has",
    "have",
    "havent",
    "having",
    "he",
    "her",
    "here",
    "hers",
    "him",
    "his",
    "how",
    "however",
    "i",
    "id",
    "if",
    "ill",
    "im",
    "in",
    "into",
    "is",
    "isnt",
    "it",
    "its",
    "itself",
    "ive",
    "just",
    "keep",
    "kind",
    "know",
    "last",
    "later",
    "least",
    "less",
    "let",
    "lets",
    "like",
    "literally",
    "little",
    "long",
    "look",
    "looking",
    "lot",
    "lots",
    "make",
    "makes",
    "making",
    "many",
    "may",
    "maybe",
    "me",
    "mean",
    "might",
    "mine",
    "more",
    "most",
    "much",
    "must",
    "my",
    "myself",
    "need",
    "needs",
    "never",
    "new",
    "next",
    "nice",
    "no",
    "nor",
    "not",
    "nothing",
    "now",
    "of",
    "off",
    "oh",
    "ok",
    "okay",
    "old",
    "on",
    "once",
    "one",
    "only",
    "or",
    "other",
    "our",
    "ours",
    "out",
    "over",
    "own",
    "part",
    "people",
    "pretty",
    "probably",
    "put",
    "quite",
    "rather",
    "really",
    "right",
    "said",
    "same",
    "saw",
    "say",
    "saying",
    "says",
    "see",
    "seem",
    "seems",
    "she",
    "should",
    "shouldnt",
    "since",
    "so",
    "some",
    "someone",
    "something",
    "sometimes",
    "somewhere",
    "soon",
    "sort",
    "still",
    "stuff",
    "such",
    "sure",
    "take",
    "talk",
    "tell",
    "than",
    "thank",
    "thanks",
    "that",
    "thats",
    "the",
    "their",
    "theirs",
    "them",
    "then",
    "there",
    "theres",
    "these",
    "they",
    "theyre",
    "thing",
    "things",
    "think",
    "this",
    "those",
    "though",
    "thought",
    "through",
    "time",
    "times",
    "to",
    "today",
    "tomorrow",
    "too",
    "totally",
    "try",
    "trying",
    "two",
    "uh",
    "um",
    "under",
    "until",
    "up",
    "us",
    "use",
    "used",
    "using",
    "very",
    "want",
    "wanna",
    "wanted",
    "wants",
    "was",
    "wasnt",
    "way",
    "we",
    "week",
    "well",
    "went",
    "were",
    "weve",
    "what",
    "whatever",
    "when",
    "where",
    "whether",
    "which",
    "while",
    "who",
    "whole",
    "why",
    "will",
    "with",
    "without",
    "wont",
    "work",
    "working",
    "works",
    "would",
    "wouldnt",
    "yeah",
    "year",
    "yep",
    "yes",
    "yesterday",
    "yet",
    "you",
    "youd",
    "youll",
    "your",
    "youre",
    "yours",
    "yourself",
    "youve",
];

/// Cue words make good classifiers but bad topic labels ("annoying" is not a
/// topic), so they never become phrases.
const CUE_TOKENS: &[&str] = &[
    "annoying",
    "annoyed",
    "annoy",
    "annoys",
    "broken",
    "broke",
    "break",
    "breaks",
    "hate",
    "frustrated",
    "frustrating",
    "wish",
    "stuck",
    "problem",
    "issue",
    "crash",
    "crashed",
    "crashing",
    "fail",
    "fails",
    "failing",
    "failed",
    "error",
    "bug",
    "buggy",
    "idea",
    "build",
    "building",
    "built",
    "startup",
    "concept",
    "imagine",
    "cool",
    "ugh",
    "suck",
    "sucks",
    "painful",
    "happen",
    "happening",
    "happened",
    "app",
    "tool",
    "feature",
    "fix",
    "fixed",
];

/// Lowercase words with inner apostrophes kept (curly quotes normalized).
fn words(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        let ch = if ch == '\u{2019}' || ch == '\u{2018}' {
            '\''
        } else {
            ch
        };
        if ch.is_alphanumeric() || (ch == '\'' && !current.is_empty()) {
            current.extend(ch.to_lowercase());
        } else if !current.is_empty() {
            out.push(
                std::mem::take(&mut current)
                    .trim_end_matches('\'')
                    .to_string(),
            );
        }
    }
    if !current.is_empty() {
        out.push(current.trim_end_matches('\'').to_string());
    }
    out.retain(|w| !w.is_empty());
    out
}

/// Light English plural folding so "bugs" and "bug" share a phrase.
fn fold(word: &str) -> String {
    let w: String = word.chars().filter(|c| *c != '\'').collect();
    let len = w.chars().count();
    if len < 4 || !w.is_ascii() {
        return w;
    }
    if w.ends_with("sses") || w.ends_with("ss") || w.ends_with("us") || w.ends_with("is") {
        return w;
    }
    if w.ends_with("shes") || w.ends_with("ches") || w.ends_with("xes") {
        return w[..w.len() - 2].to_string();
    }
    if w.ends_with("ies") && len > 4 {
        return format!("{}y", &w[..w.len() - 3]);
    }
    if w.ends_with('s') {
        return w[..w.len() - 1].to_string();
    }
    w
}

struct Vocab {
    stop: HashSet<&'static str>,
    cue: HashSet<&'static str>,
}

impl Vocab {
    fn new() -> Self {
        Self {
            stop: STOPWORDS.iter().copied().collect(),
            cue: CUE_TOKENS.iter().copied().collect(),
        }
    }

    /// `None` marks a stopword gap (breaks bigrams).
    fn content_token(&self, word: &str) -> Option<String> {
        let bare: String = word.chars().filter(|c| *c != '\'').collect();
        if bare.chars().count() < 3
            || bare.chars().all(|c| c.is_ascii_digit())
            || self.stop.contains(bare.as_str())
        {
            return None;
        }
        let folded = fold(&bare);
        if self.stop.contains(folded.as_str())
            || self.cue.contains(folded.as_str())
            || self.cue.contains(bare.as_str())
        {
            return None;
        }
        Some(folded)
    }
}

fn content_tokens(vocab: &Vocab, text: &str) -> Vec<Option<String>> {
    words(text).iter().map(|w| vocab.content_token(w)).collect()
}

fn contains_run(tokens: &[Option<String>], run: &[&str]) -> bool {
    tokens
        .windows(run.len())
        .any(|w| w.iter().zip(run).all(|(t, r)| t.as_deref() == Some(*r)))
}

/// Distinct keyword phrases of one transcript.
fn phrases(vocab: &Vocab, text: &str) -> Vec<String> {
    let tokens = content_tokens(vocab, text);
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (i, token) in tokens.iter().enumerate() {
        let Some(word) = token else { continue };
        if seen.insert(word.clone()) {
            out.push(word.clone());
        }
        if let Some(Some(next)) = tokens.get(i + 1) {
            if next != word {
                let bigram = format!("{word} {next}");
                if seen.insert(bigram.clone()) {
                    out.push(bigram);
                }
            }
        }
    }
    out
}

fn padded(text: &str) -> String {
    format!(" {} ", words(text).join(" "))
}

fn has_cue(padded_text: &str, cues: &[&str]) -> bool {
    cues.iter()
        .any(|cue| padded_text.contains(&format!(" {cue} ")))
}

pub fn slug(label: &str) -> String {
    let mut out = String::new();
    for ch in label.chars() {
        if ch.is_alphanumeric() {
            out.extend(ch.to_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_string()
}

/// The sentence that best shows the topic, trimmed for display.
fn quote_for(text: &str, label_tokens: &[&str], vocab: &Vocab) -> String {
    let sentences = text
        .split(['.', '!', '?', '\n'])
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let mut best: Option<&str> = None;
    for sentence in sentences {
        let tokens: HashSet<String> = words(sentence)
            .iter()
            .filter_map(|w| vocab.content_token(w))
            .collect();
        if label_tokens.iter().all(|t| tokens.contains(*t)) {
            best = Some(sentence);
            break;
        }
        if best.is_none() && label_tokens.iter().any(|t| tokens.contains(*t)) {
            best = Some(sentence);
        }
    }
    shorten(best.unwrap_or(text.trim()), QUOTE_CHARS)
}

pub fn shorten(text: &str, max_chars: usize) -> String {
    let clean = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.chars().count() <= max_chars {
        return clean;
    }
    let cut: String = clean.chars().take(max_chars).collect();
    let cut = match cut.rfind(' ') {
        Some(idx) if idx > max_chars / 2 => cut[..idx].to_string(),
        _ => cut,
    };
    format!("{}…", cut.trim_end_matches([',', ';', ':', ' ']))
}

/// "video export" + "export audio" -> "video export audio" (either order).
fn chain(label: &str, bigram: &str) -> Option<String> {
    let lw: Vec<&str> = label.split(' ').collect();
    let bw: Vec<&str> = bigram.split(' ').collect();
    if lw.len() != 2 || bw.len() != 2 {
        return None;
    }
    if lw[1] == bw[0] && lw[0] != bw[1] {
        Some(format!("{} {} {}", lw[0], lw[1], bw[1]))
    } else if bw[1] == lw[0] && bw[0] != lw[1] {
        Some(format!("{} {} {}", bw[0], lw[0], lw[1]))
    } else {
        None
    }
}

struct Candidate {
    phrase: usize,
    score: f32,
}

/// Build the report. `entries` may be in any order.
pub fn analyze(
    entries: &[Transcript],
    window_days: Option<u32>,
    now: i64,
    options: &EngineOptions,
) -> InsightsReport {
    let vocab = Vocab::new();
    let n = entries.len();
    let min_count = options.min_count.max(2);

    // Phrase dictionary + posting lists (entry indices per phrase).
    let mut phrase_ids: HashMap<String, usize> = HashMap::new();
    let mut phrase_text: Vec<String> = Vec::new();
    let mut postings: Vec<Vec<u32>> = Vec::new();
    let mut entry_phrases: Vec<Vec<usize>> = Vec::with_capacity(n);
    let mut problem_cue = Vec::with_capacity(n);
    let mut idea_cue = Vec::with_capacity(n);

    for (idx, entry) in entries.iter().enumerate() {
        let padded_text = padded(&entry.text);
        problem_cue.push(has_cue(&padded_text, PROBLEM_CUES));
        idea_cue.push(has_cue(&padded_text, IDEA_CUES));
        let mut ids = Vec::new();
        for phrase in phrases(&vocab, &entry.text) {
            let id = *phrase_ids.entry(phrase.clone()).or_insert_with(|| {
                phrase_text.push(phrase);
                postings.push(Vec::new());
                postings.len() - 1
            });
            postings[id].push(idx as u32);
            ids.push(id);
        }
        entry_phrases.push(ids);
    }

    // Phrases in more than 40% of a large history are too generic to be topics.
    let generic_cap = if n >= 30 {
        (n as f32 * 0.4) as usize
    } else {
        n
    };
    let mut candidates: Vec<Candidate> = postings
        .iter()
        .enumerate()
        .filter(|(_, p)| p.len() >= min_count && p.len() <= generic_cap.max(min_count))
        .map(|(phrase, p)| {
            let weight = if phrase_text[phrase].contains(' ') {
                BIGRAM_WEIGHT
            } else {
                1.0
            };
            Candidate {
                phrase,
                score: p.len() as f32 * weight,
            }
        })
        .collect();
    candidates.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| phrase_text[a.phrase].cmp(&phrase_text[b.phrase]))
    });
    candidates.truncate(MAX_CANDIDATE_PHRASES);

    struct Group {
        label: usize,
        label_text: String,
        members: Vec<bool>,
        absorbed: Vec<usize>,
    }
    let mut groups: Vec<Group> = Vec::new();
    // How many topics already claim an entry; a later topic needs mostly
    // unclaimed entries so one dictation does not spawn five near-duplicates.
    let mut claimed = vec![0u8; n];

    for candidate in &candidates {
        let posting = &postings[candidate.phrase];
        // Absorb into an existing topic when most of this phrase's entries
        // already belong to it (e.g. "audio" inside "video export").
        let mut absorbed = false;
        for group in groups.iter_mut() {
            let overlap = posting
                .iter()
                .filter(|&&e| group.members[e as usize])
                .count();
            if overlap as f32 >= posting.len() as f32 * ABSORB_OVERLAP {
                let label_len = postings[group.label].len();
                if overlap == posting.len() && overlap == label_len {
                    if let Some(longer) = chain(&group.label_text, &phrase_text[candidate.phrase]) {
                        let run: Vec<&str> = longer.split(' ').collect();
                        let members: Vec<usize> = posting.iter().map(|&e| e as usize).collect();
                        let hits = members
                            .iter()
                            .filter(|&&e| {
                                contains_run(&content_tokens(&vocab, &entries[e].text), &run)
                            })
                            .count();
                        if hits * 5 >= members.len() * 4 {
                            group.label_text = longer;
                        }
                    }
                }
                if group.absorbed.len() < 6 {
                    group.absorbed.push(candidate.phrase);
                }
                absorbed = true;
                break;
            }
        }
        if absorbed || groups.len() >= MAX_TOPICS {
            continue;
        }
        let fresh = posting
            .iter()
            .filter(|&&e| claimed[e as usize] == 0)
            .count();
        if fresh < min_count {
            continue;
        }
        let mut members = vec![false; n];
        for &e in posting {
            members[e as usize] = true;
            claimed[e as usize] = claimed[e as usize].saturating_add(1);
        }
        groups.push(Group {
            label: candidate.phrase,
            label_text: phrase_text[candidate.phrase].clone(),
            members,
            absorbed: Vec::new(),
        });
    }

    let mut topics: Vec<Topic> = groups
        .into_iter()
        .map(|group| {
            build_topic(
                entries,
                &group.members,
                &group.label_text,
                &group.absorbed,
                &phrase_text,
                &entry_phrases,
                &problem_cue,
                &idea_cue,
                &vocab,
                options,
            )
        })
        .collect();

    // Most mentioned first; recency breaks ties.
    topics.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| b.last_seen.cmp(&a.last_seen))
            .then_with(|| a.label.cmp(&b.label))
    });

    let mut problems = Vec::new();
    let mut ideas = Vec::new();
    let mut other = Vec::new();
    for topic in topics {
        let bucket = match topic.kind {
            TopicKind::Problem => &mut problems,
            TopicKind::Idea => &mut ideas,
            TopicKind::Other => &mut other,
        };
        if bucket.len() < options.per_kind_limit {
            bucket.push(topic);
        }
    }

    InsightsReport {
        window_days,
        analyzed_entries: n as u32,
        generated_at: now,
        fix_first: problems.first().cloned(),
        problems,
        ideas,
        other,
    }
}

#[allow(clippy::too_many_arguments)]
fn build_topic(
    entries: &[Transcript],
    members: &[bool],
    label_text: &str,
    absorbed: &[usize],
    phrase_text: &[String],
    entry_phrases: &[Vec<usize>],
    problem_cue: &[bool],
    idea_cue: &[bool],
    vocab: &Vocab,
    options: &EngineOptions,
) -> Topic {
    let mut idx: Vec<usize> = (0..entries.len()).filter(|&i| members[i]).collect();
    idx.sort_by_key(|&i| (entries[i].timestamp, entries[i].id));
    let count = idx.len();
    let problem_hits = idx.iter().filter(|&&i| problem_cue[i]).count();
    let idea_hits = idx.iter().filter(|&&i| idea_cue[i]).count();
    let needed = (count / 4).max(1);
    let kind = if problem_hits > idea_hits && problem_hits >= needed {
        TopicKind::Problem
    } else if idea_hits > problem_hits && idea_hits >= needed {
        TopicKind::Idea
    } else {
        TopicKind::Other
    };

    // Keywords: absorbed phrases first, then phrases in at least half the
    // topic's entries.
    let mut keywords: Vec<String> = Vec::new();
    let push_kw = |kw: &String, keywords: &mut Vec<String>| {
        if kw != label_text
            && !label_text.contains(kw.as_str())
            && !keywords.contains(kw)
            && keywords.len() < 4
        {
            keywords.push(kw.clone());
        }
    };
    for &p in absorbed {
        push_kw(&phrase_text[p], &mut keywords);
    }
    if keywords.len() < 4 && count >= 2 {
        let mut freq: HashMap<usize, usize> = HashMap::new();
        for &i in &idx {
            for &p in &entry_phrases[i] {
                *freq.entry(p).or_default() += 1;
            }
        }
        let mut common: Vec<(usize, usize)> = freq
            .into_iter()
            .filter(|(_, c)| *c >= 2 && *c * 2 >= count)
            .collect();
        common.sort_by(|a, b| {
            b.1.cmp(&a.1)
                .then_with(|| phrase_text[a.0].cmp(&phrase_text[b.0]))
        });
        for (p, _) in common {
            push_kw(&phrase_text[p], &mut keywords);
        }
    }

    // Examples: prefer entries that carry the topic's cue, newest first.
    let cue_of = |i: usize| match kind {
        TopicKind::Problem => problem_cue[i],
        TopicKind::Idea => idea_cue[i],
        TopicKind::Other => true,
    };
    let mut ranked = idx.clone();
    ranked.sort_by(|&a, &b| {
        cue_of(b)
            .cmp(&cue_of(a))
            .then_with(|| entries[b].timestamp.cmp(&entries[a].timestamp))
    });
    let label_tokens: Vec<&str> = label_text.split(' ').collect();
    let examples = ranked
        .iter()
        .take(options.examples_per_topic)
        .map(|&i| TopicQuote {
            entry_id: entries[i].id,
            timestamp: entries[i].timestamp,
            text: quote_for(&entries[i].text, &label_tokens, vocab),
        })
        .collect();

    Topic {
        id: slug(label_text),
        label: label_text.to_string(),
        keywords,
        kind,
        count: count as u32,
        first_seen: idx.first().map(|&i| entries[i].timestamp).unwrap_or(0),
        last_seen: idx.last().map(|&i| entries[i].timestamp).unwrap_or(0),
        examples,
        entry_ids: idx.iter().map(|&i| entries[i].id).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: i64 = 86_400;
    const NOW: i64 = 1_790_000_000;

    fn t(id: i64, days_ago: i64, text: &str) -> Transcript {
        Transcript {
            id,
            timestamp: NOW - days_ago * DAY,
            text: text.to_string(),
        }
    }

    fn fixture() -> Vec<Transcript> {
        vec![
            t(
                1,
                20,
                "The video export audio is broken again, so annoying.",
            ),
            t(
                2,
                18,
                "Ugh, the audio on the video export keeps dropping out.",
            ),
            t(
                3,
                15,
                "Reminder to pick up dry cleaning and call the dentist.",
            ),
            t(
                4,
                12,
                "Video export audio still doesn't work after the update.",
            ),
            t(
                5,
                10,
                "Idea: an app that turns grocery receipts into meal plans.",
            ),
            t(6, 9, "I hate that the video export loses the audio track."),
            t(7, 8, "Send the invoice to Maria by Friday."),
            t(
                8,
                6,
                "What if we built a grocery receipt scanner that plans dinners for the week?",
            ),
            t(
                9,
                4,
                "Another bug with video export audio today. Fix this first.",
            ),
            t(
                10,
                2,
                "We should build that grocery receipt meal planner, people would pay for it.",
            ),
            t(11, 1, "Lunch with Sam at noon went great."),
        ]
    }

    #[test]
    fn repeated_complaint_surfaces_as_top_problem_with_right_count() {
        let report = analyze(&fixture(), Some(30), NOW, &EngineOptions::default());
        let top = report.fix_first.expect("a problem should surface");
        assert_eq!(top.label, "video export");
        assert_eq!(top.kind, TopicKind::Problem);
        assert_eq!(top.count, 5);
        assert_eq!(top.entry_ids, vec![1, 2, 4, 6, 9]);
        assert_eq!(top.first_seen, NOW - 20 * DAY);
        assert_eq!(top.last_seen, NOW - 4 * DAY);
        assert!(
            top.keywords.iter().any(|k| k == "audio"),
            "{:?}",
            top.keywords
        );
        assert_eq!(top.examples.len(), 3);
        // Newest problem quote first, and quotes are the relevant sentence.
        assert_eq!(top.examples[0].entry_id, 9);
        assert_eq!(
            top.examples[0].text,
            "Another bug with video export audio today"
        );
        // No duplicate "audio" topic stealing the same dictations.
        assert!(report
            .problems
            .iter()
            .chain(&report.other)
            .all(|t| t.label != "audio"));
    }

    #[test]
    fn idea_is_classified_as_idea() {
        let report = analyze(&fixture(), None, NOW, &EngineOptions::default());
        let idea = report
            .ideas
            .iter()
            .find(|t| t.label == "grocery receipt")
            .unwrap_or_else(|| panic!("ideas: {:?}", report.ideas));
        assert_eq!(idea.kind, TopicKind::Idea);
        assert_eq!(idea.count, 3);
        assert_eq!(idea.first_seen, NOW - 10 * DAY);
        assert!(report.problems.iter().all(|t| t.label != "grocery receipt"));
    }

    #[test]
    fn one_off_notes_do_not_become_topics() {
        let report = analyze(&fixture(), None, NOW, &EngineOptions::default());
        let all: Vec<&str> = report
            .problems
            .iter()
            .chain(&report.ideas)
            .chain(&report.other)
            .map(|t| t.label.as_str())
            .collect();
        for noise in ["dentist", "invoice", "lunch", "maria"] {
            assert!(!all.iter().any(|l| l.contains(noise)), "{noise} in {all:?}");
        }
    }

    #[test]
    fn empty_and_tiny_histories_are_safe() {
        let empty = analyze(&[], Some(7), NOW, &EngineOptions::default());
        assert_eq!(empty.analyzed_entries, 0);
        assert!(empty.fix_first.is_none());
        let one = analyze(
            &[t(1, 0, "Hello there")],
            None,
            NOW,
            &EngineOptions::default(),
        );
        assert!(one.problems.is_empty() && one.ideas.is_empty() && one.other.is_empty());
    }

    #[test]
    fn normalization_handles_curly_apostrophes_and_plurals() {
        assert_eq!(words("It doesn’t WORK!"), vec!["it", "doesn't", "work"]);
        assert!(has_cue(&padded("It doesn’t work"), PROBLEM_CUES));
        assert_eq!(fold("bugs"), "bug");
        assert_eq!(fold("receipts"), "receipt");
        assert_eq!(fold("crashes"), "crash");
        assert_eq!(fold("stories"), "story");
        assert_eq!(fold("status"), "status");
        assert_eq!(slug("video export"), "video-export");
    }

    #[test]
    fn ten_thousand_entries_are_fast() {
        let subjects = [
            "the sync button",
            "invoice emails",
            "podcast edit",
            "client onboarding",
            "garage door",
            "gym schedule",
            "newsletter draft",
            "tax receipts",
        ];
        let entries: Vec<Transcript> = (0..10_000)
            .map(|i| {
                let s = subjects[i % subjects.len()];
                let text = if i % 3 == 0 {
                    format!("{s} is broken again and it keeps failing number {i}")
                } else if i % 3 == 1 {
                    format!("idea what if {s} had an app that sorted entry {i} automatically")
                } else {
                    format!("notes about {s} and random word{} for later", i % 97)
                };
                t(i as i64, (i % 90) as i64, &text)
            })
            .collect();
        let start = std::time::Instant::now();
        let report = analyze(&entries, None, NOW, &EngineOptions::default());
        let elapsed = start.elapsed();
        assert_eq!(report.analyzed_entries, 10_000);
        assert!(!report.problems.is_empty() || !report.other.is_empty());
        // Debug builds are ~10x slower than release; this still has headroom.
        assert!(elapsed.as_secs_f32() < 5.0, "took {elapsed:?}");
        eprintln!("analyze(10k) took {elapsed:?}");
    }
}
