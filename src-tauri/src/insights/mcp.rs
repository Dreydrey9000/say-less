//! `handy --mcp`: a minimal, read-only MCP server over stdio.
//!
//! Hand-rolled newline-delimited JSON-RPC 2.0 (no extra crate). It supports
//! `initialize`, `notifications/initialized`, `ping`, `tools/list` and
//! `tools/call`. It opens the history database read-only per call, never
//! starts the GUI, tray, audio or single-instance plugin, logs only to stderr,
//! and exits cleanly when stdin closes.

use super::db::{self, TranscriptHit};
use super::engine::{self, EngineOptions, Topic, TopicKind};
use chrono::{Local, TimeZone};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;

const SUPPORTED_PROTOCOLS: &[&str] = &["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_QUERY_CHARS: usize = 200;
const MAX_TEXT_CHARS: usize = 2000;

pub struct McpServer {
    db_path: Option<PathBuf>,
    now: fn() -> i64,
}

fn system_now() -> i64 {
    chrono::Utc::now().timestamp()
}

/// `--history-db` beats `SAYLESS_HISTORY_DB`, which beats the app's own data dir.
pub fn resolve_db_path(override_path: Option<PathBuf>) -> Option<PathBuf> {
    override_path
        .or_else(|| std::env::var_os("SAYLESS_HISTORY_DB").map(PathBuf::from))
        .or_else(|| db::default_app_data_dir().map(|d| d.join(db::HISTORY_DB_FILE)))
}

fn local_time(ts: i64) -> String {
    Local
        .timestamp_opt(ts, 0)
        .single()
        .map(|d| d.format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_default()
}

fn hit_json(hit: &TranscriptHit) -> Value {
    json!({
        "id": hit.id,
        "date": local_time(hit.timestamp),
        "text": engine::shorten(&hit.text, MAX_TEXT_CHARS),
    })
}

fn topic_json(topic: &Topic) -> Value {
    json!({
        "label": topic.label,
        "kind": topic.kind,
        "mentions": topic.count,
        "first_seen": local_time(topic.first_seen),
        "last_seen": local_time(topic.last_seen),
        "related": topic.keywords,
        "examples": topic.examples.iter().map(|q| json!({
            "id": q.entry_id,
            "date": local_time(q.timestamp),
            "quote": q.text,
        })).collect::<Vec<_>>(),
    })
}

fn tool_definitions() -> Value {
    let days = json!({
        "type": "integer", "minimum": 1, "maximum": 3650,
        "description": "Only look at the last N days. Omit for the tool's default."
    });
    json!([
        {
            "name": "search_transcripts",
            "title": "Search my dictations",
            "description": "Search the user's local Say Less dictation history. Every word in the query must appear. Returns newest matches first with dates.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Words to look for, e.g. \"export audio\"."},
                    "days": days,
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100, "description": "Max results (default 20)."}
                },
                "required": ["query"],
                "additionalProperties": false
            },
            "annotations": {"readOnlyHint": true, "openWorldHint": false}
        },
        {
            "name": "recent_transcripts",
            "title": "Recent dictations",
            "description": "List what the user dictated recently, newest first.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "days": days,
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100, "description": "Max results (default 30)."}
                },
                "additionalProperties": false
            },
            "annotations": {"readOnlyHint": true, "openWorldHint": false}
        },
        {
            "name": "recurring_topics",
            "title": "What I keep saying",
            "description": "Recurring problems and ideas found in the user's dictations (default: last 30 days), with mention counts, first/last dates and example quotes. Computed locally without a model.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "days": days,
                    "kind": {"type": "string", "enum": ["all", "problem", "idea", "other"], "description": "Filter by kind (default all)."}
                },
                "additionalProperties": false
            },
            "annotations": {"readOnlyHint": true, "openWorldHint": false}
        }
    ])
}

fn rpc_result(id: Value, result: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "result": result})
}

fn rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

fn tool_text(value: Value, is_error: bool) -> Value {
    let text = match value {
        Value::String(s) => s,
        other => serde_json::to_string_pretty(&other).unwrap_or_default(),
    };
    json!({"content": [{"type": "text", "text": text}], "isError": is_error})
}

fn int_arg(args: &Value, key: &str, min: i64, max: i64) -> Result<Option<i64>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => match v.as_i64() {
            Some(n) if (min..=max).contains(&n) => Ok(Some(n)),
            _ => Err(format!(
                "`{key}` must be a whole number from {min} to {max}."
            )),
        },
    }
}

impl McpServer {
    pub fn new(db_path: Option<PathBuf>) -> Self {
        Self {
            db_path,
            now: system_now,
        }
    }

    #[cfg(test)]
    fn with_clock(db_path: PathBuf, now: fn() -> i64) -> Self {
        Self {
            db_path: Some(db_path),
            now,
        }
    }

    /// Handle one JSON-RPC line. `None` means no reply (notifications).
    pub fn handle_line(&self, line: &str) -> Option<Value> {
        let msg: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => return Some(rpc_error(Value::Null, -32700, "Parse error")),
        };
        if !msg.is_object() {
            return Some(rpc_error(Value::Null, -32600, "Invalid Request"));
        }
        let method = msg.get("method").and_then(Value::as_str);
        let id = msg.get("id").cloned();
        let Some(id) = id.filter(|v| !v.is_null()) else {
            // Notifications (including notifications/initialized) get no reply.
            return None;
        };
        let Some(method) = method else {
            return Some(rpc_error(id, -32600, "Invalid Request"));
        };
        let params = msg.get("params").cloned().unwrap_or(Value::Null);
        Some(match method {
            "initialize" => {
                let requested = params
                    .get("protocolVersion")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let version = if SUPPORTED_PROTOCOLS.contains(&requested) {
                    requested
                } else {
                    SUPPORTED_PROTOCOLS[0]
                };
                rpc_result(
                    id,
                    json!({
                        "protocolVersion": version,
                        "capabilities": {"tools": {"listChanged": false}},
                        "serverInfo": {
                            "name": "say-less",
                            "title": "Say Less history",
                            "version": env!("CARGO_PKG_VERSION")
                        },
                        "instructions": "Read-only access to the user's own Say Less dictation history on this computer. Use recurring_topics to see what they keep saying, search_transcripts to find specific things, recent_transcripts for the latest."
                    }),
                )
            }
            "ping" => rpc_result(id, json!({})),
            "tools/list" => rpc_result(id, json!({"tools": tool_definitions()})),
            "tools/call" => {
                let name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let args = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                match name {
                    "search_transcripts" | "recent_transcripts" | "recurring_topics" => {
                        match self.call_tool(name, &args) {
                            Ok(value) => rpc_result(id, tool_text(value, false)),
                            Err(message) => rpc_result(id, tool_text(Value::String(message), true)),
                        }
                    }
                    _ => rpc_error(id, -32602, &format!("Unknown tool: {name}")),
                }
            }
            _ => rpc_error(id, -32601, &format!("Method not found: {method}")),
        })
    }

    fn call_tool(&self, name: &str, args: &Value) -> Result<Value, String> {
        if !args.is_object() {
            return Err("Arguments must be an object.".into());
        }
        let path = self
            .db_path
            .as_ref()
            .ok_or("Could not locate the Say Less data folder. Pass --history-db <path>.")?;
        let conn = db::open_read_only(path)?;
        let now = (self.now)();
        match name {
            "search_transcripts" => {
                let query = args
                    .get("query")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .unwrap_or("");
                if query.is_empty() || query.chars().count() > MAX_QUERY_CHARS {
                    return Err(format!(
                        "`query` is required (1-{MAX_QUERY_CHARS} characters)."
                    ));
                }
                let days = int_arg(args, "days", 1, 3650)?.map(|d| d as u32);
                let limit = int_arg(args, "limit", 1, 100)?.unwrap_or(20) as u32;
                let hits = db::search(&conn, query, db::cutoff(now, days), limit)?;
                Ok(json!({
                    "query": query,
                    "count": hits.len(),
                    "results": hits.iter().map(hit_json).collect::<Vec<_>>(),
                }))
            }
            "recent_transcripts" => {
                let days = int_arg(args, "days", 1, 3650)?.unwrap_or(7) as u32;
                let limit = int_arg(args, "limit", 1, 100)?.unwrap_or(30) as u32;
                let hits = db::recent(&conn, db::cutoff(now, Some(days)), limit)?;
                Ok(json!({
                    "days": days,
                    "count": hits.len(),
                    "results": hits.iter().map(hit_json).collect::<Vec<_>>(),
                }))
            }
            "recurring_topics" => {
                let days = int_arg(args, "days", 1, 3650)?.unwrap_or(30) as u32;
                let kind =
                    match args.get("kind").and_then(Value::as_str) {
                        None | Some("all") => None,
                        Some(k) => Some(TopicKind::parse(k).ok_or(
                            "`kind` must be one of: all, problem, idea, other.".to_string(),
                        )?),
                    };
                let entries = db::load_transcripts(&conn, db::cutoff(now, Some(days)))?;
                let report = engine::analyze(&entries, Some(days), now, &EngineOptions::default());
                let pick = |k: TopicKind, list: &Vec<Topic>| {
                    if kind.is_none() || kind == Some(k) {
                        list.iter().map(topic_json).collect::<Vec<_>>()
                    } else {
                        Vec::new()
                    }
                };
                Ok(json!({
                    "days": days,
                    "dictations_analyzed": report.analyzed_entries,
                    "fix_first": report.fix_first.as_ref().map(|t| t.label.clone()),
                    "problems": pick(TopicKind::Problem, &report.problems),
                    "ideas": pick(TopicKind::Idea, &report.ideas),
                    "other": pick(TopicKind::Other, &report.other),
                }))
            }
            _ => Err(format!("Unknown tool: {name}")),
        }
    }
}

/// Serve MCP on stdin/stdout until stdin closes. Returns the exit code.
pub fn run_stdio(db_override: Option<PathBuf>) -> i32 {
    let db_path = resolve_db_path(db_override);
    match &db_path {
        Some(p) => eprintln!("[say-less mcp] read-only history: {}", p.display()),
        None => eprintln!("[say-less mcp] could not locate the Say Less data folder"),
    }
    let server = McpServer::new(db_path);
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        if let Some(reply) = server.handle_line(&line) {
            let mut out = stdout.lock();
            if writeln!(out, "{reply}").and_then(|_| out.flush()).is_err() {
                break;
            }
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::super::db::test_support::create_fixture_db;
    use super::*;

    const NOW: i64 = 1_790_000_000;
    fn fixed_now() -> i64 {
        NOW
    }

    fn server() -> (tempfile::TempDir, McpServer) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("history.db");
        let d = 86_400;
        create_fixture_db(
            &path,
            &[
                (NOW - 20 * d, "The video export audio is broken again"),
                (
                    NOW - 10 * d,
                    "Idea: an app that turns grocery receipts into meal plans",
                ),
                (
                    NOW - 5 * d,
                    "Video export audio keeps dropping, so annoying",
                ),
                (NOW - 3 * d, "What if we built a grocery receipt planner"),
                (NOW - d, "Another bug with the video export audio"),
                (NOW - 100 * d, "Ancient export note"),
            ],
        );
        (dir, McpServer::with_clock(path, fixed_now))
    }

    fn call(server: &McpServer, msg: Value) -> Value {
        server.handle_line(&msg.to_string()).expect("reply")
    }

    fn tool_payload(reply: &Value) -> Value {
        assert_eq!(reply["result"]["isError"], false, "{reply}");
        serde_json::from_str(reply["result"]["content"][0]["text"].as_str().unwrap()).unwrap()
    }

    #[test]
    fn initialize_negotiates_protocol_and_notifications_are_silent() {
        let (_d, s) = server();
        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}),
        );
        assert_eq!(r["id"], 1);
        assert_eq!(r["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(r["result"]["serverInfo"]["name"], "say-less");
        assert!(r["result"]["capabilities"]["tools"].is_object());
        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":"a","method":"initialize","params":{"protocolVersion":"1999-01-01"}}),
        );
        assert_eq!(r["result"]["protocolVersion"], SUPPORTED_PROTOCOLS[0]);
        assert!(s
            .handle_line(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#)
            .is_none());
        assert_eq!(
            call(&s, json!({"jsonrpc":"2.0","id":2,"method":"ping"}))["result"],
            json!({})
        );
    }

    #[test]
    fn lists_three_read_only_tools() {
        let (_d, s) = server();
        let r = call(&s, json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}));
        let names: Vec<&str> = r["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            [
                "search_transcripts",
                "recent_transcripts",
                "recurring_topics"
            ]
        );
    }

    #[test]
    fn tools_return_history() {
        let (_d, s) = server();
        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_transcripts","arguments":{"query":"export audio"}}}),
        );
        let p = tool_payload(&r);
        assert_eq!(p["count"], 3);
        assert_eq!(
            p["results"][0]["text"],
            "Another bug with the video export audio"
        );

        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_transcripts","arguments":{"query":"export","days":30}}}),
        );
        assert_eq!(tool_payload(&r)["count"], 3, "100-day-old note excluded");

        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"recent_transcripts","arguments":{"days":4}}}),
        );
        assert_eq!(tool_payload(&r)["count"], 2);

        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"recurring_topics","arguments":{"days":30}}}),
        );
        let p = tool_payload(&r);
        assert_eq!(p["fix_first"], "video export audio");
        assert_eq!(p["problems"][0]["mentions"], 3);
        assert_eq!(p["ideas"][0]["label"], "grocery receipt");

        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"recurring_topics","arguments":{"kind":"idea"}}}),
        );
        let p = tool_payload(&r);
        assert!(p["problems"].as_array().unwrap().is_empty());
        assert_eq!(p["ideas"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn errors_are_reported_not_panicked() {
        let (_d, s) = server();
        assert_eq!(s.handle_line("{not json").unwrap()["error"]["code"], -32700);
        assert_eq!(s.handle_line("[1,2]").unwrap()["error"]["code"], -32600);
        assert_eq!(
            call(
                &s,
                json!({"jsonrpc":"2.0","id":8,"method":"resources/list"})
            )["error"]["code"],
            -32601
        );
        assert_eq!(
            call(
                &s,
                json!({"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"delete_everything"}})
            )["error"]["code"],
            -32602
        );
        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"search_transcripts","arguments":{}}}),
        );
        assert_eq!(r["result"]["isError"], true);
        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"recent_transcripts","arguments":{"days":-4}}}),
        );
        assert_eq!(r["result"]["isError"], true);
        let r = call(
            &s,
            json!({"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"recurring_topics","arguments":{"kind":"secrets"}}}),
        );
        assert_eq!(r["result"]["isError"], true);

        let missing =
            McpServer::with_clock(PathBuf::from("/nonexistent/say-less/history.db"), fixed_now);
        let r = call(
            &missing,
            json!({"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"recent_transcripts"}}),
        );
        assert_eq!(r["result"]["isError"], true);
        assert!(r["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("No Say Less history"));
    }
}
