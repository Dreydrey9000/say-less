#!/usr/bin/env python3
"""Say Less Bridge — cloud offload + Title Box Ideas for the Say Less app.

Jobs:
  1. Watch ~/Movies/Say Less for new screen recordings, upload them to B2
     (bucket from config), optionally mirror to Google Drive via rclone, and
     record a registry entry with playable links any agent can read.
  2. Serve POST /ideas: screen image -> vision LLM -> title box options
     (question / statement / statistic / story styles), grounded in the
     client's proven hooks from ve-social.db, copied to the clipboard.

Runs on http://127.0.0.1:8810 (port in state/port.txt). Only ONE bridge can run:
a lock file stops a second copy from starting. No secrets are ever printed.
"""
import base64
import faulthandler
import fcntl
import hmac
import functools
import shutil
import json
import os
import re
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOME = Path(os.environ.get("SAYLESS_MEDIA_HOME") or Path.home())
# Config + state live here, outside the repo. Override with SAYLESS_BRIDGE_HOME.
BRIDGE_DIR = Path(os.environ.get("SAYLESS_BRIDGE_HOME")
                  or HOME / "Desktop" / "_Code" / "say-less-bridge")
STATE_DIR = BRIDGE_DIR / "state"
REGISTRY_PATH = STATE_DIR / "recordings.json"
CONFIG_PATH = BRIDGE_DIR / "config.json"
WATCH_DIR = HOME / "Movies" / "Say Less"
IMAGES_DIR = HOME / "Pictures" / "Say Less Images"
IMAGES_REGISTRY_PATH = STATE_DIR / "images.json"
VE_DB = Path(os.environ.get("SAYLESS_VE_DB")
             or HOME / "Desktop" / "_Code" / "frictionless" / "data" / "ve-social.db")
SECRETS = Path(os.environ.get("SAYLESS_SECRETS") or HOME / ".say-less")
LOG_PATH = STATE_DIR / "bridge.log"

DEFAULT_CONFIG = {
    "b2_bucket": "say-less",
    "b2_prefix": "say-less-recordings/",
    "b2_secrets_file": str(SECRETS / "b2-cloud-storage.env"),
    "presign_days": 7,
    "drive_enabled": True,
    "drive_remote": "gdrive",
    "drive_folder": "SayLess-Recordings",
    "delete_local_after_upload": False,
    "watch_enabled": True,
    "watch_interval_seconds": 10,
    "ideas_provider_chain": ["zai_small", "agy"],
    "zai_base_url": "https://api.z.ai/api/coding/paas/v4",
    "zai_timeout_seconds": 120,
    "claude_vision_model": "claude-haiku-4-5-20251001",
    "claude_timeout_seconds": 240,
    "zai_secrets_file": str(SECRETS / "zai.env"),
    "groq_secrets_file": str(SECRETS / "groq.env"),
    "agy_bin": str(HOME / ".local" / "bin" / "agy"),
    "agy_timeout_seconds": 170,
    "ideas_port": 8810,
}

_registry_lock = threading.Lock()
_b2_cache = {}
DESKTOP_TOKEN = None
DESKTOP_VERSION = None
_desktop_uploads = set()
DESKTOP_PAUSED = False
DESKTOP_ACTIVITY_LOCK = threading.RLock()


def desktop_connections():
    path = ":".join([str(HOME / ".local/bin"), str(HOME / ".claude/skills/subpowers/bin"),
                     "/opt/homebrew/bin", "/usr/local/bin", os.environ.get("PATH", "")])
    return {"watch_enabled": CONFIG["watch_enabled"], "b2_bucket": CONFIG["b2_bucket"],
            "auto_titles_enabled": CONFIG.get("auto_titles_enabled", False),
            "b2_secrets_file": CONFIG["b2_secrets_file"], "drive_enabled": CONFIG["drive_enabled"],
            "drive_remote": CONFIG["drive_remote"],
            "image_tool": bool(shutil.which("subpowers", path=path)),
            "cloud_tool": bool(shutil.which("b2", path=path)),
            "drive_tool": bool(shutil.which("rclone", path=path)),
            "cloud_credentials": Path(CONFIG["b2_secrets_file"]).is_file()}


def track_upload(fn):
    @functools.wraps(fn)
    def tracked(*args, **kwargs):
        task = object()
        with DESKTOP_ACTIVITY_LOCK:
            if DESKTOP_PAUSED:
                raise RuntimeError("Say Less is updating. Retry after it restarts.")
            _desktop_uploads.add(task)
        try:
            return fn(*args, **kwargs)
        finally:
            with DESKTOP_ACTIVITY_LOCK:
                _desktop_uploads.discard(task)
    return tracked


def log(msg):
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a") as f:
            f.write(line + "\n")
    except OSError:
        pass
    print(line, flush=True)


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text()))
        except (OSError, ValueError) as e:
            log(f"config parse failed, using defaults: {e}")
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    for key, val in list(cfg.items()):       # allow ~ in paths
        if isinstance(val, str) and val.startswith("~") and (key.endswith("_file") or key.endswith("_bin")):
            cfg[key] = os.path.expanduser(val)
    return cfg


CONFIG = load_config()


def read_env_file(path):
    """Parse a shell env file (export VAR=value lines). Values stay local."""
    env = {}
    try:
        for line in Path(path).read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
            if not m:
                continue
            key, val = m.group(1), m.group(2).strip().strip('"').strip("'")
            # Shell files may reference $HOME (bash expands on source; we don't
            # run a shell). Expand only HOME so key values are never touched.
            val = val.replace("$HOME", str(HOME)).replace("${HOME}", str(HOME))
            env[key] = val
    except OSError:
        pass
    return env


VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".heic"}
MAX_BODY_BYTES = 1_000_000


def safe_path(raw, suffixes, roots):
    """Resolve `raw` (symlinks followed) and return it only if it is a file with
    an allowed suffix inside one of `roots`. Otherwise None. This keeps a stray
    local request from asking the bridge to upload or read an arbitrary file."""
    try:
        p = Path(str(raw)).expanduser().resolve()
    except (OSError, RuntimeError, ValueError):
        return None
    if p.suffix.lower() not in suffixes or not p.is_file():
        return None
    for root in roots:
        try:
            p.relative_to(Path(root).resolve())
            return p
        except ValueError:
            continue
    return None


def video_roots():
    return [WATCH_DIR, HOME / "Movies"] + [Path(x) for x in CONFIG.get("extra_allowed_dirs", [])]


def image_roots():
    # Screenshots can live anywhere under the home folder; the bridge's own
    # state dir is included for the title-ideas capture.
    return [HOME, STATE_DIR]


def acquire_singleton_lock():
    """Only one bridge may run. Returns the open lock file (keep a reference),
    or None if another bridge already holds it."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    fh = open(STATE_DIR / "bridge.lock", "a+")
    try:
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fh.close()
        return None
    fh.seek(0)
    fh.truncate()
    fh.write(str(os.getpid()))
    fh.flush()
    return fh


def backoff_seconds(failures):
    """30 s, 60 s, 120 s ... capped at 1 hour, so a failing upload of a 2-hour
    recording is not retried every 10 seconds forever."""
    return min(3600, 30 * (2 ** max(0, failures - 1)))


def registry_read():
    if not REGISTRY_PATH.exists():
        return []
    try:
        return json.loads(REGISTRY_PATH.read_text())
    except (OSError, ValueError):
        return []


def registry_write(entries):
    with _registry_lock:
        REGISTRY_PATH.write_text(json.dumps(entries, indent=2))


def registry_add(entry):
    with _registry_lock:
        entries = registry_read()
        entries = [e for e in entries if e.get("file") != entry.get("file")]
        entries.append(entry)
        entries.sort(key=lambda e: e.get("uploaded_at", ""), reverse=True)
        REGISTRY_PATH.write_text(json.dumps(entries, indent=2))
    return entries


# ---------------------------------------------------------------- B2 upload

def b2_env():
    env = dict(os.environ)
    env.update(read_env_file(CONFIG["b2_secrets_file"]))
    return env


def b2_cmd(args, timeout=600):
    proc = subprocess.run(
        [shutil.which("b2") or "/opt/homebrew/bin/b2"] + args,
        capture_output=True, text=True, timeout=timeout, env=b2_env(),
    )
    if proc.returncode != 0:
        raise RuntimeError(f"b2 {' '.join(args[:2])} failed: {proc.stderr.strip()[:300]}")
    return proc.stdout.strip()


def b2_account_info():
    if "info" not in _b2_cache:
        _b2_cache["info"] = json.loads(b2_cmd(["get-account-info"]))
    return _b2_cache["info"]


def b2_upload(local_path, remote_key):
    out = b2_cmd([
        "upload-file", "--no-progress", CONFIG["b2_bucket"], str(local_path), remote_key,
    ])
    info = None
    idx = out.find("{")
    if idx >= 0:
        try:
            info, _ = json.JSONDecoder().raw_decode(out[idx:])
        except ValueError:
            info = None
    if not info or "fileId" not in info:
        raise RuntimeError("b2 upload returned no fileId")
    return info


def b2_presign(remote_key, days):
    token = b2_cmd([
        "get-download-auth", "--prefix", remote_key,
        "--duration", str(int(days * 86400)), CONFIG["b2_bucket"],
    ])
    base = b2_account_info().get("downloadUrl", "https://backblazeb2.com")
    from urllib.parse import quote
    return f"{base}/file/{CONFIG['b2_bucket']}/{quote(remote_key)}?Authorization={token}"


DRIVE = {"ok": None, "error": None, "paused_until": 0.0}


def drive_upload(local_path, name):
    """Mirror to Google Drive with rclone. A dead login (invalid_grant) is
    reported once, clearly, and Drive is skipped for an hour so every upload
    does not wait on a call that cannot work."""
    if time.time() < DRIVE["paused_until"]:
        raise RuntimeError(DRIVE["error"] or "drive paused")
    remote = CONFIG["drive_remote"]
    folder = CONFIG["drive_folder"]
    proc = subprocess.run(
        ["/opt/homebrew/bin/rclone", "copyto", str(local_path), f"{remote}:{folder}/{name}"],
        capture_output=True, text=True, timeout=1800,
    )
    if proc.returncode != 0:
        err = (proc.stderr or "").strip()
        if "invalid_grant" in err or "token expired" in err:
            DRIVE["ok"] = False
            DRIVE["error"] = (f"Google Drive login expired. Run: "
                              f"rclone config reconnect {remote}:")
            DRIVE["paused_until"] = time.time() + 3600
            log(DRIVE["error"])
            raise RuntimeError(DRIVE["error"])
        raise RuntimeError(f"rclone copyto failed: {err[-300:]}")
    DRIVE["ok"], DRIVE["error"] = True, None
    link = subprocess.run(
        ["/opt/homebrew/bin/rclone", "link", f"{remote}:{folder}/{name}"],
        capture_output=True, text=True, timeout=120,
    )
    return link.stdout.strip() or None


# ------------------------------------------------------------ image library

def images_registry_read():
    if not IMAGES_REGISTRY_PATH.exists():
        return []
    try:
        return json.loads(IMAGES_REGISTRY_PATH.read_text())
    except (OSError, ValueError):
        return []


def register_image(path, prompt="", painter=""):
    """Add a generated image to the library: registry entry + B2 upload
    (bucket say-less-images/ prefix) + Drive mirror. Local file is kept."""
    path = Path(path)
    if not path.is_file():
        return None
    now = datetime.now(timezone.utc)
    remote_key = f"say-less-images/{now:%Y/%m}/{path.name}"
    entry = {
        "file": str(path),
        "name": path.name,
        "prompt": prompt,
        "painter": painter,
        "size_bytes": path.stat().st_size,
        "created_at": now.isoformat(timespec="seconds"),
    }
    try:
        info = b2_upload(path, remote_key)
        entry["b2"] = {"bucket": CONFIG["b2_bucket"], "key": remote_key,
                       "file_id": info["fileId"]}
        entry["url"] = b2_presign(remote_key, CONFIG["presign_days"])
    except Exception as e:
        log(f"image B2 upload failed {path.name}: {e}")
    if CONFIG["drive_enabled"]:
        try:
            entry["drive_link"] = drive_upload(path, f"SayLess-Images/{path.name}")
        except Exception as e:
            log(f"image drive upload failed {path.name}: {e}")
    with _registry_lock:
        entries = images_registry_read()
        entries.insert(0, entry)
        IMAGES_REGISTRY_PATH.write_text(json.dumps(entries, indent=2))
    log(f"image registered: {path.name} -> {CONFIG['b2_bucket']}/{remote_key}")
    return entry


@track_upload
def upload_recording(path, source="watcher"):
    path = Path(path)
    if not path.is_file():
        return None
    name = path.name
    now = datetime.now(timezone.utc)
    remote_key = f"{CONFIG['b2_prefix']}{now:%Y/%m/%d}/{name}"
    log(f"uploading ({source}): {name}")
    info = b2_upload(path, remote_key)
    entry = {
        "file": str(path),
        "name": name,
        "size_bytes": path.stat().st_size,
        "uploaded_at": now.isoformat(timespec="seconds"),
        "source": source,
        "b2_size_bytes": info.get("contentLength", info.get("size")),
        "b2": {
            "bucket": CONFIG["b2_bucket"],
            "key": remote_key,
            "file_id": info["fileId"],
        },
    }
    try:
        entry["url"] = b2_presign(remote_key, CONFIG["presign_days"])
        entry["url_expires_days"] = CONFIG["presign_days"]
    except Exception as e:  # presign is best-effort; agents can re-sign
        log(f"presign failed for {name}: {e}")
    if CONFIG["drive_enabled"]:
        try:
            entry["drive_link"] = drive_upload(path, name)
        except Exception as e:
            log(f"drive upload failed for {name}: {e}")
    registry_add(entry)
    log(f"uploaded OK: {name} -> {CONFIG['b2_bucket']}/{remote_key}")
    return entry


def _entry_time(entry):
    raw = entry.get("uploaded_at") or entry.get("created_at")
    try:
        return datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return None


def refresh_expiring_urls(now=None):
    """Presigned B2 links expire after `presign_days`. Re-sign any link that is
    in its last day so the Recordings app and agents never hand out a dead link."""
    now = now or datetime.now(timezone.utc)
    days = CONFIG["presign_days"]
    refreshed = 0
    def write_images(entries):
        with _registry_lock:
            IMAGES_REGISTRY_PATH.write_text(json.dumps(entries, indent=2))

    # registry_write takes the lock itself; never hold it while calling it.
    for reader, writer in (
        (registry_read, registry_write),
        (images_registry_read, write_images),
    ):
        entries = reader()
        changed = False
        for e in entries:
            key = (e.get("b2") or {}).get("key")
            made = _entry_time(e)
            stamp = e.get("url_refreshed_at")
            if stamp:
                try:
                    made = datetime.fromisoformat(stamp)
                except ValueError:
                    pass
            if not key or not made:
                continue
            if made.tzinfo is None:
                made = made.replace(tzinfo=timezone.utc)
            if (now - made).total_seconds() < (days - 1) * 86400:
                continue
            try:
                e["url"] = b2_presign(key, days)
                e["url_refreshed_at"] = now.isoformat(timespec="seconds")
                changed = True
                refreshed += 1
            except Exception as ex:
                log(f"link refresh failed for {e.get('name')}: {ex}")
        if changed:
            writer(entries)
    if refreshed:
        log(f"re-signed {refreshed} expiring link(s)")
    return refreshed


def watcher_loop():
    log(f"watching {WATCH_DIR}")
    seen = {}
    failures = {}   # name -> (count, retry_after_epoch)
    last_refresh = 0.0
    while True:
        if DESKTOP_TOKEN and (not CONFIG["watch_enabled"] or DESKTOP_PAUSED):
            time.sleep(1)
            continue
        try:
            if WATCH_DIR.is_dir():
                for p in WATCH_DIR.glob("*.mp4"):
                    try:
                        size1 = p.stat().st_size
                    except OSError:
                        continue
                    known = seen.get(p.name)
                    if known is not None and known == size1 and size1 > 0:
                        count, retry_at = failures.get(p.name, (0, 0))
                        already = any(
                            e.get("file") == str(p) for e in registry_read()
                        )
                        if not already and time.time() >= retry_at:
                            try:
                                entry = upload_recording(p, source="watcher")
                                failures.pop(p.name, None)
                                # Delete only when B2 holds the exact same number of bytes.
                                if (entry and CONFIG["delete_local_after_upload"]
                                        and entry.get("b2_size_bytes") == size1):
                                    p.unlink(missing_ok=True)
                                    log(f"local copy deleted after upload: {p.name}")
                            except Exception as e:
                                count += 1
                                wait = backoff_seconds(count)
                                failures[p.name] = (count, time.time() + wait)
                                log(f"upload failed {p.name} (try {count}, next in {wait}s): {e}")
                    seen[p.name] = size1
            if time.time() - last_refresh > 3600:
                last_refresh = time.time()
                refresh_expiring_urls()
        except Exception as e:
            log(f"watcher error: {e}")
        time.sleep(CONFIG["watch_interval_seconds"])


# ------------------------------------------------------------- title ideas

def ve_hooks(client, limit=10):
    """Proven opening/title hooks for a client from ve-social.db (top by views)."""
    if not VE_DB.exists() or not client:
        return []
    try:
        con = sqlite3.connect(f"file:{VE_DB}?mode=ro", uri=True)
        # Own work = client_roster.relationship, never posts.is_competitor
        # (that column is wrong both ways; past clients are still our work).
        rows = con.execute(
            "SELECT p.verbatim_hook, CAST(p.views AS INTEGER) FROM posts p "
            "JOIN client_roster r ON r.slug = p.client "
            "WHERE p.client=? "
            "AND r.relationship IN ('current_client','past_client','internal') "
            "AND p.verbatim_hook IS NOT NULL "
            "AND p.verbatim_hook != '' AND CAST(p.views AS INTEGER) > 20000 "
            "ORDER BY CAST(p.views AS INTEGER) DESC LIMIT ?",
            (client, limit),
        ).fetchall()
        con.close()
        return [h for h, _ in rows]
    except sqlite3.Error as e:
        log(f"ve-social query failed: {e}")
        return []


IDEAS_PROMPT = """You are the title-box generator inside Say Less, a dictation app for a \
professional short-form video editor.

Look at this screenshot of the editor. Read the video frame, any on-screen title box, \
and any visible transcript panel.

Write {count} options for the white rounded TITLE BOX overlay (the punchy caption box \
that sits over the video). Rules:
- Title Case, no quotes, 4-9 words each, punchy and scroll-stopping.
- They must MATCH what the person on screen is actually saying in the transcript \
shown (same moment, same claim).
- Cover these styles across the set: Question, Bold Statement, Statistic/Hook Number, \
Curiosity Gap, Contrarian, Story/Confession.
{hook_block}
Return ONLY a JSON array, one object per option: {{"style": "...", "text": "..."}}"""


def call_agy(image_path, prompt, tail="Answer with ONLY the JSON array, no other text."):
    """Antigravity CLI: reads the screenshot natively (view_file) with the
    image path in the prompt. Uses Luis's Antigravity subscription, no key."""
    bin_path = CONFIG.get("agy_bin", str(HOME / ".local" / "bin" / "agy"))
    if not Path(bin_path).exists():
        raise RuntimeError("agy CLI not found")
    full_prompt = (
        f"First use your view_file tool to look at this image: {image_path}\n\n"
        f"{prompt}\n\n{tail}"
    )
    proc = subprocess.run(
        [bin_path, "-p", full_prompt, "--effort", "low",
         "--add-dir", str(Path(image_path).parent)],
        capture_output=True, text=True, timeout=CONFIG["agy_timeout_seconds"],
    )
    if proc.returncode != 0 and not proc.stdout.strip():
        raise RuntimeError(f"agy failed: {proc.stderr.strip()[:200]}")
    return "agy antigravity", proc.stdout.strip()


def call_claude(image_path, prompt, tail="Answer with ONLY the JSON, no other text."):
    """Claude's own CLI (your Claude plan, no API key): reads the picture with its Read tool.
    The reliable one: it answers in seconds even when the Mac is busy."""
    import shutil
    exe = CONFIG.get("claude_bin") or shutil.which("claude") or "/opt/homebrew/bin/claude"
    if not Path(exe).exists():
        raise RuntimeError("claude CLI not found")
    full = f"First use your Read tool to look at this image: {image_path}\n\n{prompt}\n\n{tail}"
    env = dict(os.environ)
    env["PATH"] = ":".join(["/opt/homebrew/bin", "/usr/local/bin", str(HOME / ".local" / "bin"), "/usr/bin", "/bin", env.get("PATH", "")])
    proc = subprocess.run(
        [exe, "-p", full, "--model", CONFIG["claude_vision_model"], "--allowedTools", "Read",
         "--add-dir", str(Path(image_path).parent), "--no-session-persistence", "--output-format", "text"],
        capture_output=True, text=True, timeout=CONFIG["claude_timeout_seconds"], cwd="/tmp", env=env,
    )
    if proc.returncode != 0 and not proc.stdout.strip():
        raise RuntimeError(f"claude failed: {proc.stderr.strip()[:200]}")
    return CONFIG["claude_vision_model"], proc.stdout.strip()


def call_zai(image_path, prompt, model_env_key):
    """GLM through the z.ai CODING PLAN endpoint (flat rate, your plan). GLM-5.3-Flash is natively
    multimodal and is on the plan; GLM-5.3-FlashX is not yet (the plan answers 1311). The
    pay-per-token endpoint (/api/paas/v4) needs a balance, so it is not used."""
    env = read_env_file(CONFIG["zai_secrets_file"])
    api_key = env.get("ZAI_API_KEY")
    model = env.get(model_env_key)
    if not api_key or not model:
        raise RuntimeError(f"zai env missing ZAI_API_KEY or {model_env_key}")
    suffix = Path(image_path).suffix.lower()
    mime = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"
    b64 = base64.b64encode(Path(image_path).read_bytes()).decode()
    body = {
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                {"type": "text", "text": prompt},
            ],
        }],
        "temperature": 1,
        "max_tokens": 4000,   # thinking cannot be turned off, so leave room for it
    }
    req = urllib.request.Request(
        CONFIG["zai_base_url"].rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=CONFIG["zai_timeout_seconds"]) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"z.ai {e.code}: {e.read()[:160].decode(errors='replace')}")
    text = (data["choices"][0]["message"].get("content") or "").strip()
    if not text:
        raise RuntimeError("z.ai answered with no text")
    return model, text


def call_groq(image_path, prompt):
    env = read_env_file(CONFIG["groq_secrets_file"])
    api_key = env.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("groq env missing GROQ_API_KEY")
    b64 = base64.b64encode(Path(image_path).read_bytes()).decode()
    body = {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                {"type": "text", "text": prompt},
            ],
        }],
        "temperature": 0.8,
        "max_tokens": 1200,
    }
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return "groq llama-4-scout", data["choices"][0]["message"]["content"]


def parse_titles(text):
    m = re.search(r"\[.*\]", text, re.S)
    if not m:
        return []
    try:
        arr = json.loads(m.group(0))
        return [
            {"style": str(o.get("style", "")).strip(), "text": str(o.get("text", "")).strip()}
            for o in arr if isinstance(o, dict) and o.get("text")
        ]
    except ValueError:
        return []


def generate_ideas(image_path, client=None, count=10, extra=None):
    if not Path(image_path).is_file():
        raise RuntimeError(f"image not found: {image_path}")
    hooks = ve_hooks(client)
    hook_block = ""
    if hooks:
        examples = "\n".join(f"- {h}" for h in hooks[:8])
        hook_block = (
            f"\nProven title/hook styles that already went viral for the client "
            f"'{client}' (match this energy, do not copy word-for-word):\n{examples}\n"
        )
    if extra:
        hook_block += f"\nExtra context from the editor: {extra}\n"
    prompt = IDEAS_PROMPT.format(count=count, hook_block=hook_block)
    errors = []
    for provider in CONFIG["ideas_provider_chain"]:
        try:
            if provider == "claude":
                model, text = call_claude(image_path, prompt)
            elif provider == "agy":
                model, text = call_agy(image_path, prompt)
            elif provider == "zai_big":
                model, text = call_zai(image_path, prompt, "ZAI_BIG_MODEL")
            elif provider == "zai_small":
                model, text = call_zai(image_path, prompt, "ZAI_SMALL_MODEL")
            elif provider == "groq":
                model, text = call_groq(image_path, prompt)
            else:
                continue
            titles = parse_titles(text)
            if titles:
                log(f"ideas OK via {provider} ({model}) -> {len(titles)} titles")
                return {"titles": titles[:count], "provider": f"{provider}:{model}"}
            errors.append(f"{provider}: unparseable response")
        except Exception as e:
            errors.append(f"{provider}: {e}")
            log(f"ideas provider {provider} failed: {e}")
    raise RuntimeError("all providers failed: " + " | ".join(errors))


def vision_text(image_path, prompt):
    """Ask a vision model about one picture. Same provider chain as the title ideas."""
    errors = []
    for provider in CONFIG["ideas_provider_chain"]:
        try:
            if provider == "claude":
                model, text = call_claude(image_path, prompt, tail="Answer with ONLY the JSON object, no other text.")
            elif provider == "agy":
                model, text = call_agy(image_path, prompt, tail="Answer with ONLY the JSON object, no other text.")
            elif provider == "zai_big":
                model, text = call_zai(image_path, prompt, "ZAI_BIG_MODEL")
            elif provider == "zai_small":
                model, text = call_zai(image_path, prompt, "ZAI_SMALL_MODEL")
            elif provider == "groq":
                model, text = call_groq(image_path, prompt)
            else:
                continue
            if text and text.strip():
                return f"{provider}:{model}", text
            errors.append(f"{provider}: empty answer")
        except Exception as e:
            errors.append(f"{provider}: {e}")
    raise RuntimeError("all vision providers failed: " + " | ".join(errors))


def registry_annotate(kind, ident, fields):
    """Write a title, summary and tags onto the saved entry for an image (by path) or a recording (by name)."""
    with _registry_lock:
        if kind == "img":
            entries, path, match = images_registry_read(), IMAGES_REGISTRY_PATH, lambda e: e.get("file") == ident
        else:
            entries, path, match = registry_read(), REGISTRY_PATH, lambda e: e.get("name") == ident
        hit = False
        for e in entries:
            if match(e):
                e.update(fields)
                hit = True
        if hit:
            path.write_text(json.dumps(entries, indent=2))
    return hit


def capture_screen(out_path):
    subprocess.run(["/usr/sbin/screencapture", "-x", str(out_path)], check=True, timeout=30)
    return out_path


def set_clipboard(text):
    subprocess.run(["/usr/bin/pbcopy"], input=text.encode(), check=True, timeout=10)


# ------------------------------------------------------------------ server

_STUDIO = None
_STUDIO_LOCK = threading.Lock()


def studio_instance():
    """The Say Less Studio (pages + API for the mini apps), created on first use."""
    global _STUDIO
    with _STUDIO_LOCK:
        if _STUDIO is None:
            import studio
            _STUDIO = studio.Studio(sys.modules[__name__])
        return _STUDIO


class Handler(BaseHTTPRequestHandler):
    # Keep-alive: a page that asks for 30 thumbnails reuses one connection instead of opening 30.
    protocol_version = "HTTP/1.1"

    def _desktop_authorized(self):
        if DESKTOP_TOKEN is None:
            return True
        prefix = f"/s/{DESKTOP_TOKEN}"
        candidate = self.path.split("/", 3)
        if len(candidate) < 4 or candidate[1] != "s" or not hmac.compare_digest(candidate[2], DESKTOP_TOKEN):
            self._send(403, {"error": "Studio session expired. Reopen Studio in Say Less."})
            return False
        self.path = self.path[len(prefix):]
        return True

    def end_headers(self):
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError):
            pass     # the page closed the connection; not worth a traceback

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            if self.close_connection:
                self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass     # the caller gave up waiting

    def _host_ok(self):
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        return host in ("127.0.0.1", "localhost", "[::1]")

    def _origin_ok(self):
        """No Origin (curl, the CLIs) or the bridge's own pages. Never another site."""
        origin = self.headers.get("Origin")
        if not origin:
            return True
        port = self.server.server_address[1]
        return origin in (f"http://127.0.0.1:{port}", f"http://localhost:{port}")

    def do_GET(self):
        if not self._desktop_authorized():
            return
        if not self._host_ok():
            return self._send(403, {"error": "bad host"})
        if not self._origin_ok():
            return self._send(403, {"error": "forbidden"})
        if DESKTOP_TOKEN and self.path == "/desktop-status":
            studio = studio_instance()
            with DESKTOP_ACTIVITY_LOCK, studio.lock, studio.titler.lock:
                busy = any(j["status"] == "running" for j in studio.jobs.values()) or bool(studio.titler.queued)
            return self._send(200, {"version": DESKTOP_VERSION, "busy": busy or bool(_desktop_uploads)})
        if DESKTOP_TOKEN and self.path == "/desktop-connections":
            return self._send(200, desktop_connections())
        if studio_instance().handle(self, "GET", self.path):
            return
        if self.path in ("/health", "/"):
            return self._send(200, {"ok": True, "service": "say-less-bridge",
                                    "pid": os.getpid(),
                                    "drive": {"ok": DRIVE["ok"], "error": DRIVE["error"]},
                                    "watch_dir": str(WATCH_DIR),
                                    "registry": str(REGISTRY_PATH)})
        if self.path == "/recordings":
            return self._send(200, {"recordings": registry_read()})
        if self.path == "/images":
            return self._send(200, {"images": images_registry_read()})
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        global DESKTOP_PAUSED
        if not self._desktop_authorized():
            return
        # A web page on another site must not be able to make the bridge upload
        # files or spend model credits. Our CLIs send no Origin; the Studio
        # pages send the bridge's own origin. Anything else is refused.
        self.close_connection = True      # bodies may go unread on a refusal; never reuse this connection
        if not self._host_ok() or not self._origin_ok():
            return self._send(403, {"error": "forbidden"})
        if DESKTOP_TOKEN and self.path == "/desktop-prepare-update":
            studio = studio_instance()
            with DESKTOP_ACTIVITY_LOCK, studio.lock, studio.titler.lock:
                busy = any(j["status"] == "running" for j in studio.jobs.values()) or bool(_desktop_uploads) or bool(studio.titler.queued)
                if not busy:
                    DESKTOP_PAUSED = True
            return self._send(200, {"busy": busy, "version": DESKTOP_VERSION})
        if DESKTOP_TOKEN and self.path == "/desktop-resume":
            DESKTOP_PAUSED = False
            return self._send(200, {"ok": True})
        if DESKTOP_PAUSED:
            return self._send(409, {"error": "Say Less is updating. Try again after it restarts."})
        if DESKTOP_TOKEN and self.path == "/desktop-connections":
            try:
                data = studio_instance()._body_json(self)
                path = Path(str(data.get("b2_secrets_file", ""))).expanduser().resolve()
                if not path.is_relative_to(HOME) or path.suffix != ".env":
                    raise ValueError("Choose a credentials .env file inside your home folder.")
                bucket = str(data.get("b2_bucket", "")).strip()
                remote = str(data.get("drive_remote", "")).strip()
                if bucket and not re.fullmatch(r"[A-Za-z0-9-]{6,63}", bucket):
                    raise ValueError("Enter a valid B2 bucket name.")
                if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", remote):
                    raise ValueError("Enter your configured Drive remote name.")
                enabled, drive = data.get("watch_enabled") is True, data.get("drive_enabled") is True
                ready = desktop_connections()
                if enabled and (not bucket or not path.is_file() or not ready["cloud_tool"]):
                    raise ValueError("Connect B2 and choose its credentials file before enabling uploads.")
                if drive and not ready["drive_tool"]:
                    raise ValueError("Connect Google Drive before enabling its mirror.")
                settings = {**CONFIG, "watch_enabled": enabled, "b2_bucket": bucket,
                            "auto_titles_enabled": data.get("auto_titles_enabled") is True,
                            "b2_secrets_file": str(path), "drive_enabled": drive, "drive_remote": remote}
                temp = CONFIG_PATH.with_suffix(".tmp")
                temp.write_text(json.dumps(settings, indent=2))
                temp.chmod(0o600)
                temp.replace(CONFIG_PATH)
                CONFIG.update(settings)
                studio_instance().titler.enabled = settings["auto_titles_enabled"]
                _b2_cache.clear()
                return self._send(200, desktop_connections())
            except (ValueError, OSError):
                return self._send(400, {"error": "Check your bucket, credentials file, and installed connections."})
        if self.path.startswith("/api/") and studio_instance().handle(self, "POST", self.path):
            return
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            return self._send(415, {"error": "content-type must be application/json"})
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            return self._send(400, {"error": "bad length"})
        if length > MAX_BODY_BYTES:
            return self._send(413, {"error": "body too large"})
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self._send(400, {"error": "bad json"})
        if self.path == "/upload":
            p = payload.get("path")
            if not p:
                return self._send(400, {"error": "path required"})
            p = safe_path(p, VIDEO_SUFFIXES, video_roots())
            if not p:
                return self._send(403, {"error": "path must be a video inside ~/Movies"})
            try:
                entry = upload_recording(p, source="api")
                return self._send(200, {"ok": True, "entry": entry})
            except Exception as e:
                return self._send(500, {"error": str(e)})
        if self.path == "/image-register":
            p = payload.get("path")
            if not p:
                return self._send(400, {"error": "path required"})
            p = safe_path(p, IMAGE_SUFFIXES, image_roots())
            if not p:
                return self._send(403, {"error": "path must be an image inside your home folder"})
            entry = register_image(p, prompt=payload.get("prompt", ""),
                                   painter=payload.get("painter", ""))
            return self._send(200, {"ok": True, "entry": entry})
        if self.path == "/ideas":
            image = payload.get("image_path")
            tmp = None
            try:
                if image:
                    image = safe_path(image, IMAGE_SUFFIXES, image_roots())
                    if not image:
                        return self._send(403, {"error": "image_path must be an image inside your home folder"})
                    image = str(image)
                else:
                    tmp = STATE_DIR / f"screenshot-{int(time.time())}.png"
                    try:
                        capture_screen(tmp)
                    except (subprocess.CalledProcessError, OSError):
                        return self._send(500, {"error": (
                            "The bridge runs in the background and macOS will not let it capture "
                            "the screen. Run `title-ideas` in your terminal (it captures there), "
                            "or send image_path.")})
                    image = str(tmp)
                result = generate_ideas(
                    image,
                    client=payload.get("client"),
                    count=int(payload.get("count", 10)),
                    extra=payload.get("extra"),
                )
                lines = [f"{t['style']}: {t['text']}" for t in result["titles"]]
                try:
                    set_clipboard("\n".join(t["text"] for t in result["titles"]))
                    result["clipboard_set"] = True
                except Exception:
                    result["clipboard_set"] = False
                result["rendered"] = "\n".join(lines)
                return self._send(200, {"ok": True, **result})
            except Exception as e:
                return self._send(500, {"error": str(e)})
            finally:
                if tmp and tmp.exists() and not payload.get("keep_image"):
                    tmp.unlink(missing_ok=True)
        return self._send(404, {"error": "not found"})

    def do_DELETE(self):
        if not self._desktop_authorized():
            return
        self.close_connection = True
        if not self._host_ok() or not self._origin_ok():
            return self._send(403, {"error": "forbidden"})
        if self.path.startswith("/api/") and studio_instance().handle(self, "DELETE", self.path):
            return
        return self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass


class StudioServer(ThreadingHTTPServer):
    """A page can ask for dozens of thumbnails at once; the default queue of 5 drops them."""
    request_queue_size = 128
    daemon_threads = True


def main():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    # `kill -USR1 <pid>` writes every thread's stack to state/stacks.log: the way to see why a request is slow
    faulthandler.register(signal.SIGUSR1, file=open(STATE_DIR / "stacks.log", "a"), all_threads=True)
    # A restart hands over from the old copy to the new one: give the old copy
    # a few seconds to let go of the lock before concluding it is a duplicate.
    lock = None
    for _ in range(15):
        lock = acquire_singleton_lock()
        if lock is not None:
            break
        time.sleep(1)
    if lock is None:
        log("another say-less-bridge is already running; this copy exits")
        sys.exit(0)
    if CONFIG["watch_enabled"] or DESKTOP_TOKEN:
        threading.Thread(target=watcher_loop, daemon=True).start()
    candidates = [CONFIG.get("ideas_port", 8810), 8812, 8815, 8821, 8833]
    server = None
    chosen = None
    for port in candidates:
        try:
            server = StudioServer(("127.0.0.1", port), Handler)
            chosen = port
            break
        except OSError:
            log(f"port {port} busy, trying next")
    if server is None:
        log(f"FATAL: no port available from {candidates}")
        sys.exit(1)
    chosen = server.server_address[1]
    (STATE_DIR / "port.txt").write_text(str(chosen))
    threading.Thread(target=lambda: (time.sleep(2), studio_instance().warm()), daemon=True).start()
    log(f"say-less-bridge listening on 127.0.0.1:{chosen} (pid {os.getpid()})")
    try:
        server.serve_forever()
    finally:
        lock.close()


if __name__ == "__main__":
    main()
