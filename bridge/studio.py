"""Say Less Studio: the API and pages behind the four mini apps.

One local web app, served by the bridge at http://127.0.0.1:<port>/app, with
five views: Image, Titles, Recordings, Screens and Library. The small native
launcher apps (bridge/launcher) each open one view in a real window.

Everything here is local: files are read only from allow-listed folders, long
work (painting an image, reading a screen) runs as a job you can poll, and
references you add stay on this Mac in ~/.subpowers/refs.
"""
import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

UI_DIR = Path(__file__).resolve().parent / "ui"
SET_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,30}$")
FILE_NAME = re.compile(r"[^A-Za-z0-9._ -]")
MAX_UPLOAD_BYTES = 40 * 1024 * 1024
PAINTERS = {"auto", "chatgpt", "antigravity", "grok", "council"}
SIZES = {"square": "1024x1024", "wide": "1536x1024", "tall": "1024x1536"}

SCREEN_PROMPT = (
    "Use view_file on this screenshot: {img}. Report: (1) what this screenshot shows, "
    "(2) any formulas, frameworks, lists or steps visible, (3) what the person was "
    "probably doing and why they screenshotted it. Be concrete and brief (max 8 lines)."
)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean_name(name, default="image"):
    stem = FILE_NAME.sub("", Path(name or default).name).strip(" .") or default
    return stem[:80]


def finished_process(proc):
    """The finished process, shaped like subprocess.run's result."""
    out, err = proc.communicate()
    return subprocess.CompletedProcess(proc.args, proc.returncode, out, err)


class Studio:
    def __init__(self, bridge):
        self.b = bridge
        self.jobs = {}
        self._cache = {}
        self.lock = threading.Lock()
        self._stale, self._flights, self._refreshing = {}, {}, set()
        self.thumb_slots = threading.Semaphore(3)     # never stampede the CPU with thumbnails
        state = bridge.STATE_DIR
        self.uploads = state / "uploads"
        self.thumbs = state / "thumbs"
        self.captures = state / "captures"
        self.screens_dir = state / "screens"
        self.history_path = state / "title-history.json"
        self.meta_path = state / "media-meta.json"
        self.refs_root = Path(os.environ.get("SUBPOWERS_REFS")
                              or Path.home() / ".subpowers" / "refs")
        self.sp_library = Path.home() / ".subpowers" / "library.jsonl"
        self.state = state
        for d in (self.uploads, self.thumbs, self.captures, self.screens_dir):
            d.mkdir(parents=True, exist_ok=True)
        import titler
        self.titler = titler.Titler(self)

    # ------------------------------------------------------------ helpers

    def cached(self, key, ttl, fn, swr=False):
        """Tiny in-memory cache so a burst of requests does the work once.

        swr=True: once a value exists it is ALWAYS answered at once, even when old; a
        single background thread refreshes it. The first screen never waits on disk."""
        now = time.time()
        with self.lock:
            hit = self._cache.get(key)
            if hit and now - hit[0] < ttl:
                return hit[1]
            stale = self._stale.get(key)
            if swr and stale is not None:
                if key not in self._refreshing:
                    self._refreshing.add(key)
                    threading.Thread(target=self._refresh, args=(key, fn), daemon=True).start()
                return stale
            flight = self._flights.setdefault(key, threading.Lock())
        with flight:                      # one build at a time; everyone else waits for it
            with self.lock:
                hit = self._cache.get(key)
                if hit and time.time() - hit[0] < ttl:
                    return hit[1]
            value = fn()
            with self.lock:
                self._cache[key] = (time.time(), value)
                self._stale[key] = value
            return value

    def _refresh(self, key, fn):
        try:
            value = fn()
            with self.lock:
                self._cache[key] = (time.time(), value)
                self._stale[key] = value
        except Exception as e:
            self.b.log(f"background refresh of {key} failed: {e}")
        finally:
            with self.lock:
                self._refreshing.discard(key)

    def invalidate(self):
        with self.lock:
            self._cache.clear()

    @staticmethod
    def bucket(width):
        """Snap thumbnail widths to a few sizes so each picture is resized once, not once per size."""
        for b in (160, 260, 440, 620):
            if width <= b:
                return b
        return 900

    def image_ok(self, raw):
        return self.b.safe_path(raw, self.b.IMAGE_SUFFIXES, self.b.image_roots())

    def video_ok(self, raw):
        return self.b.safe_path(raw, self.b.VIDEO_SUFFIXES, self.b.video_roots())

    def find_bin(self, name, extra=()):
        candidates = [shutil.which(name)] + [str(Path(p).expanduser() / name) for p in
                      (*extra, "~/.local/bin", "~/.claude/skills/subpowers/bin", "/opt/homebrew/bin")]
        for c in candidates:
            if c and Path(c).is_file() and os.access(c, os.X_OK):
                return c
        return None

    def run(self, cmd, timeout):
        env = dict(os.environ)
        env["PATH"] = ":".join([str(Path.home() / ".local/bin"),
                                str(Path.home() / ".claude/skills/subpowers/bin"),
                                "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin",
                                env.get("PATH", "")])
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)

    def thumb(self, path, width=480):
        """Cached JPEG thumbnail of an image, or the first frame of a video."""
        width = self.bucket(width)
        path = Path(path)
        try:
            st = path.stat()
        except OSError:
            return None
        key = hashlib.sha1(f"{path}|{st.st_mtime_ns}|{width}".encode()).hexdigest()[:20]
        out = self.thumbs / f"{key}.jpg"
        if out.exists() and out.stat().st_size > 0:
            return out
        with self.thumb_slots:
            return self._make_thumb(path, width, out)

    def _make_thumb(self, path, width, out):
        if out.exists() and out.stat().st_size > 0:
            return out
        if path.suffix.lower() in self.b.VIDEO_SUFFIXES:
            ff = self.find_bin("ffmpeg")
            if not ff:
                return None
            cmd = [ff, "-y", "-loglevel", "error", "-ss", "1", "-i", str(path),
                   "-frames:v", "1", "-vf", f"scale={width}:-2", str(out)]
            r = self.run(cmd, 60)
            if r.returncode != 0 or not out.exists():
                cmd[cmd.index("-ss") + 1] = "0"       # very short clips
                self.run(cmd, 60)
        else:
            if not self._pil_thumb(path, width, out):
                # HEIC and other formats Pillow cannot open: let macOS do it
                self.run(["/usr/bin/sips", "-s", "format", "jpeg", "-Z", str(width),
                          str(path), "--out", str(out)], 20)
        return out if out.exists() and out.stat().st_size > 0 else None

    def _pil_thumb(self, path, width, out):
        """Resize in-process with Pillow. sips can stall when run from a LaunchAgent."""
        try:
            from PIL import Image, ImageOps
        except ImportError:
            return False
        try:
            with Image.open(path) as im:
                im = ImageOps.exif_transpose(im)
                im.thumbnail((width, width * 3))
                if im.mode not in ("RGB", "L"):
                    bg = Image.new("RGB", im.size, (15, 17, 19))
                    bg.paste(im, mask=im.getchannel("A") if "A" in im.getbands() else None)
                    im = bg
                im.convert("RGB").save(out, "JPEG", quality=84)
            return True
        except Exception:
            out.unlink(missing_ok=True)
            return False

    def rec_thumb(self, name):
        """Thumbnail for a recording: from the local file, else one frame read from the cloud copy."""
        entry = next((e for e in self.b.registry_read() if e.get("name") == name), None)
        if not entry:
            return None
        local = Path(entry.get("file", ""))
        if local.is_file():
            return self.thumb(local, 560)
        key = (entry.get("b2") or {}).get("key") or name
        out = self.thumbs / (hashlib.sha1(f"cloud|{key}".encode()).hexdigest()[:20] + ".jpg")
        if out.exists() and out.stat().st_size > 0:
            return out
        url, ff = entry.get("url"), self.find_bin("ffmpeg")
        if not url or not ff:
            return None
        try:
            self.run([ff, "-y", "-loglevel", "error", "-ss", "2", "-i", url,
                      "-frames:v", "1", "-vf", "scale=560:-2", str(out)], 90)
        except subprocess.TimeoutExpired:
            out.unlink(missing_ok=True)
            return None
        return out if out.exists() and out.stat().st_size > 0 else None

    def media_meta(self, path, cached_only=False):
        path = Path(path)
        try:
            st = path.stat()
        except OSError:
            return {}
        try:
            meta = json.loads(self.meta_path.read_text())
        except (OSError, ValueError):
            meta = {}
        hit = meta.get(str(path))
        if hit and hit.get("size") == st.st_size:
            return hit
        if cached_only:
            return {"size": st.st_size, "duration": None}
        probe = self.find_bin("ffprobe")
        dur = None
        if probe:
            r = self.run([probe, "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(path)], 30)
            try:
                dur = round(float(r.stdout.strip()), 1)
            except ValueError:
                dur = None
        hit = {"size": st.st_size, "duration": dur}
        meta[str(path)] = hit
        try:
            self.meta_path.write_text(json.dumps(meta))
        except OSError:
            pass
        return hit

    def warm(self, limit=60):
        """Build thumbnails for the newest pictures in the background, so the first screen is already cached."""
        def work():
            try:
                self.boot()                 # the first screen is ready before anyone asks
                items, _ = self._library("", "mine", limit)
                for it in items:
                    for w in (260, 440):
                        self.thumb(it["path"], w)
                for s in self.list_refs():
                    for it in s["items"][:10]:
                        self.thumb(it["path"], 160)
                        self.thumb(it["path"], 260)
            except Exception as e:
                self.b.log(f"thumbnail warm-up stopped: {e}")
        threading.Thread(target=work, daemon=True).start()

    def boot(self):
        """Everything the Create screen needs, in one round trip."""
        def build():
            items, total = self._library("", "mine", 15)
            recs = self.recordings(light=True)
            return {"refs": self.list_refs(), "recent": items, "recordings": recs[:6], "recording_count": len(recs),
                    "history": self.title_history()[:3], "drive": self.b.DRIVE,
                    "captures_dir": str(self.captures)}
        return self.cached(("boot",), 3.0, build, swr=True)

    # --------------------------------------------------------------- jobs

    def new_job(self, kind, **fields):
        job = {"id": uuid.uuid4().hex[:12], "kind": kind, "status": "running",
               "stage": "Starting", "created": time.time(), "partial": [], **fields}
        with self.lock:
            self.jobs[job["id"]] = job
            for jid in [k for k, v in self.jobs.items()
                        if time.time() - v["created"] > 6 * 3600]:
                self.jobs.pop(jid, None)
        return job

    def stop_job_process(self, job):
        """End a running job's whole process group (the painters are children of the subpowers script)."""
        import signal
        pid = job.get("pid")
        if not pid:
            return
        try:
            os.killpg(pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass

    def cancel_job(self, job_id):
        job = self.jobs.get(job_id)
        if not job:
            return False
        job["cancelled"] = True
        self.stop_job_process(job)
        return True

    def finish(self, job, **fields):
        with self.lock:
            job.update(fields)
            job["finished"] = time.time()

    def job_view(self, job):
        with self.lock:
            view = dict(job)
        end = view.get("finished") or time.time()
        view["elapsed"] = round(end - view["created"], 1)
        return view

    # ---------------------------------------------------------- references

    def list_refs(self):
        sets = []
        if self.refs_root.is_dir():
            for d in sorted(p for p in self.refs_root.iterdir() if p.is_dir()):
                items = [{"name": f.name, "path": str(f), "v": f.stat().st_mtime_ns // 1000} for f in sorted(d.iterdir())
                         if f.suffix.lower() in self.b.IMAGE_SUFFIXES]
                sets.append({"name": d.name, "items": items})
        return sets

    def save_ref(self, set_name, filename, data):
        if not SET_NAME.match(set_name or ""):
            raise ValueError("Set names use lowercase letters, numbers and dashes.")
        suffix = Path(filename).suffix.lower()
        if suffix not in self.b.IMAGE_SUFFIXES:
            raise ValueError("References must be images (png, jpg, webp or heic).")
        folder = self.refs_root / set_name
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / (clean_name(Path(filename).stem) + suffix)
        n = 2
        while target.exists():
            target = folder / f"{clean_name(Path(filename).stem)}-{n}{suffix}"
            n += 1
        target.write_bytes(data)
        self.invalidate()
        return target

    def delete_ref(self, set_name, filename):
        if not SET_NAME.match(set_name or ""):
            raise ValueError("bad set")
        target = (self.refs_root / set_name / Path(filename).name).resolve()
        if self.refs_root.resolve() not in target.parents or not target.is_file():
            raise ValueError("That reference is not on the shelf.")
        target.unlink()
        self.invalidate()

    def keep_ref(self, path, set_name):
        """Copy a picture that already exists (an upload, a library image) onto a shelf."""
        src = self.image_ok(path)
        if not src:
            raise ValueError("That picture could not be read.")
        return self.save_ref(set_name, src.name, src.read_bytes())

    def delete_set(self, set_name):
        if not SET_NAME.match(set_name or ""):
            raise ValueError("bad shelf name")
        folder = self.refs_root / set_name
        if folder.is_dir() and any(folder.iterdir()):
            raise ValueError("Remove the pictures from this shelf first.")
        if folder.is_dir():
            folder.rmdir()

    def save_upload(self, filename, data):
        suffix = Path(filename).suffix.lower()
        if suffix not in self.b.IMAGE_SUFFIXES:
            raise ValueError("Please drop an image (png, jpg, webp or heic).")
        for old in self.uploads.glob("*"):
            if time.time() - old.stat().st_mtime > 7 * 86400:
                old.unlink(missing_ok=True)
        target = self.uploads / f"{uuid.uuid4().hex[:10]}-{clean_name(Path(filename).stem)}{suffix}"
        target.write_bytes(data)
        return target

    # --------------------------------------------------------------- image

    def start_image(self, payload):
        prompt = (payload.get("prompt") or "").strip()
        if not prompt:
            raise ValueError("Describe the image first.")
        painter = payload.get("painter") or "auto"
        if painter not in PAINTERS:
            raise ValueError("Unknown painter.")
        size = SIZES.get(payload.get("size") or "")
        sets = [s for s in payload.get("ref_sets", []) if SET_NAME.match(str(s))]
        files = []
        for p in payload.get("ref_paths", []):
            ok = self.image_ok(p)
            if not ok:
                raise ValueError("One reference could not be read.")
            files.append(str(ok))
        job = self.new_job("image", prompt=prompt, painter=painter)
        threading.Thread(target=self._run_image,
                         args=(job, prompt, painter, size, sets, files, bool(payload.get("copy"))),
                         daemon=True).start()
        return job

    def _run_image(self, job, prompt, painter, size, sets, files, copy):
        sp = self.find_bin("subpowers")
        if not sp:
            return self.finish(job, status="error", error=(
                "The image tool (subpowers) was not found. Run: subpowers doctor"))
        stamp = datetime.now()
        folder = self.b.IMAGES_DIR / f"{stamp:%Y/%m}"
        folder.mkdir(parents=True, exist_ok=True)
        import titler
        words = titler.slug(titler.title_from_prompt(prompt) or "picture")
        out = folder / f"{words}-{stamp:%d-%H%M%S}.png"
        stages = {"council": "Compare all: each picture appears the moment it lands. The slowest painter can take minutes",
                  "chatgpt": "ChatGPT is painting (about 1 to 2 minutes)",
                  "antigravity": "Nano Banana is painting (about 30 seconds)",
                  "grok": "Grok is painting (about 40 seconds)",
                  "auto": "Painting with the first painter that answers"}

        def found():
            return sorted(p for p in folder.glob(out.stem + "*")
                          if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")
                          and ".original" not in p.name and p.stat().st_size > 1000)
        env = dict(os.environ)
        env["PATH"] = ":".join([str(Path.home() / ".local/bin"), str(Path.home() / ".claude/skills/subpowers/bin"),
                                "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", env.get("PATH", "")])

        def run_once(which):
            cmd = [sp, "image", prompt, str(out), "--painter", which]
            for s_ in sets:
                cmd += ["--refs", s_]
            for f in files:
                cmd += ["--ref", f]
            if size:
                cmd += ["--size", size]
            job["stage"] = stages.get(which, "Painting (30 seconds to 2 minutes)")
            logfile = self.state / f"job-{job['id']}.log"
            errf = open(logfile, "w")
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errf, text=True, env=env,
                                    start_new_session=True)
            job["pid"] = proc.pid
            started, seen_lines = time.time(), 0

            def hear():
                """What the painters are saying, so the card can show it."""
                nonlocal seen_lines
                try:
                    lines = [ln.strip() for ln in logfile.read_text(errors="ignore").splitlines() if ln.strip()]
                except OSError:
                    return
                if len(lines) != seen_lines:
                    seen_lines = len(lines)
                    with self.lock:
                        job["log"] = [ln[:200] for ln in lines[-4:]]
            while proc.poll() is None:
                if job.get("cancelled"):
                    self.stop_job_process(job)
                    break
                if time.time() - started > 900:
                    self.stop_job_process(job)
                    errf.close()
                    return None, "That took over 15 minutes, so I stopped it. Try again."
                time.sleep(0.6)
                hear()
                seen = found()
                if seen:   # compare-all paints several: show each one the moment it lands
                    with self.lock:
                        job["outputs"] = [{"path": str(p), "name": p.name} for p in seen]
            errf.close()
            hear()
            if job.get("cancelled"):
                return None, "Stopped. Nothing more will be made from that request."
            stdout_text = proc.communicate()[0]
            try:
                err = logfile.read_text(errors="ignore").strip()
            except OSError:
                err = ""
            return found(), (err or (stdout_text or "").strip())

        outputs, said = run_once(painter)
        if outputs is None:
            return self.finish(job, status="error", error=said)
        if not outputs and painter not in ("auto", "council"):
            # The painter you picked did not answer (a busy Mac makes its login check time out).
            # Try whichever painter does answer, and say so, instead of failing the job.
            self.b.log(f"painter {painter} gave no image ({said[-120:]}); trying auto")
            job["note"] = f"{stages.get(painter, painter).split(' is ')[0]} did not answer, so another painter took over."
            outputs, said = run_once("auto")
            if outputs is None:
                return self.finish(job, status="error", error=said)
        if not outputs:
            tail = said.splitlines()[-3:]
            return self.finish(job, status="error", error=(
                "No image came back. " + " ".join(tail)[:300] +
                " Run `subpowers doctor` to see which painter needs attention."))
        result = [{"path": str(p), "name": p.name} for p in outputs]
        self.invalidate()
        self.finish(job, status="done", stage="Done", outputs=result)
        threading.Thread(target=lambda: [self.thumb(p, w) for p in outputs for w in (260, 440, 900)], daemon=True).start()
        if copy:
            self.copy_image(outputs[0])
        threading.Thread(target=self._register, args=(outputs, prompt, painter),
                         daemon=True).start()

    def _register(self, outputs, prompt, painter):
        for p in outputs:
            try:
                self.b.register_image(p, prompt=prompt, painter=painter)
            except Exception as e:   # cloud copy is best-effort; the image is already saved
                self.b.log(f"image cloud copy failed {p.name}: {e}")

    def copy_image(self, path):
        script = ('set the clipboard to (read (POSIX file "%s") as «class PNGf»)'
                  % str(path).replace('"', '\\"'))
        if Path(path).suffix.lower() != ".png":
            return False
        return self.run(["/usr/bin/osascript", "-e", script], 20).returncode == 0

    # ------------------------------------------------------------- library

    def library(self, query="", scope="mine", limit=120):
        return self.cached(("library", query, scope, limit), 3.0, lambda: self._library(query, scope, limit))

    def _library(self, query, scope, limit):
        registry = {e.get("file"): e for e in self.b.images_registry_read()}
        items = {}
        if self.sp_library.exists():
            for line in self.sp_library.read_text(errors="ignore").splitlines():
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                path = row.get("path")
                if not path or not Path(path).is_file():
                    continue
                items[path] = {"path": path, "prompt": row.get("prompt", ""),
                               "ts": row.get("ts", ""), "w": row.get("width"),
                               "h": row.get("height"), "model": row.get("image_model")
                               or row.get("driver") or ""}
        for path, e in registry.items():
            if path and Path(path).is_file():
                it = items.setdefault(path, {"path": path, "prompt": "", "ts": "",
                                             "w": None, "h": None, "model": ""})
                it["prompt"] = it["prompt"] or e.get("prompt", "")
                it["ts"] = it["ts"] or e.get("created_at", "")
        for p in self.b.IMAGES_DIR.rglob("*.png"):
            if ".original" in p.name:
                continue
            items.setdefault(str(p), {"path": str(p), "prompt": "", "ts":
                             datetime.fromtimestamp(p.stat().st_mtime).astimezone().isoformat(),
                             "w": None, "h": None, "model": ""})
        mine_root = str(self.b.IMAGES_DIR.resolve())
        out = []
        q = query.lower().strip()
        for path, it in items.items():
            if scope == "mine" and not str(Path(path).resolve()).startswith(mine_root):
                continue
            known = self.titler.info("img", path) or {}
            hay = f"{it['prompt']} {Path(path).name} {known.get('title', '')} {known.get('summary', '')} {' '.join(known.get('tags', []))}".lower()
            if q and q not in hay:
                continue
            e = registry.get(path) or {}
            try:
                v = Path(path).stat().st_mtime_ns // 1000
            except OSError:
                v = 0
            out.append({**it, "v": v, "name": Path(path).name, "cloud": bool(e.get("url")),
                        "drive": bool(e.get("drive_link")), "url": e.get("url"),
                        "drive_link": e.get("drive_link")})
        out.sort(key=lambda x: x.get("ts") or "", reverse=True)
        for it in out[:limit]:
            f = self.titler.image_fields(it["path"], it["prompt"], it["ts"])
            it.update(title=f["title"], summary=f["summary"], tags=f["tags"], title_src=f["src"])
        return out[:limit], len(out)

    # ---------------------------------------------------------- recordings

    def _rec_title(self, name, when):
        f = self.titler.video_fields(name, when or "")
        return {"title": f["title"], "summary": f["summary"], "tags": f["tags"], "title_src": f["src"]}

    def recordings(self, light=False):
        out = []
        seen = set()
        for e in self.b.registry_read():
            f = Path(e.get("file", ""))
            seen.add(str(f))
            local = f.is_file()
            meta = (self.media_meta(f, light) if local else {})
            out.append({
                "name": e.get("name") or f.name, "path": str(f), "local": local,
                "size": e.get("size_bytes") or meta.get("size"),
                "duration": meta.get("duration"),
                "when": e.get("uploaded_at"), "url": e.get("url"),
                "drive_link": e.get("drive_link"), "cloud": bool(e.get("b2")),
                "status": "uploaded",
                **self._rec_title(e.get("name") or f.name, e.get("uploaded_at")),
            })
        if self.b.WATCH_DIR.is_dir():
            for f in sorted(self.b.WATCH_DIR.glob("*.mp4")):
                if str(f) in seen:
                    continue
                st = f.stat()
                out.append({"name": f.name, "path": str(f), "local": True, "size": st.st_size,
                            "duration": self.media_meta(f, light).get("duration"),
                            "when": datetime.fromtimestamp(st.st_mtime, timezone.utc)
                            .isoformat(timespec="seconds"),
                            "url": None, "drive_link": None, "cloud": False,
                            "status": "waiting",
                            **self._rec_title(f.name, datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat())})
        out.sort(key=lambda r: r.get("when") or "", reverse=True)
        return out

    # -------------------------------------------------------------- titles

    def clients(self):
        db = self.b.VE_DB
        rows = []
        if Path(db).exists():
            import sqlite3
            try:
                con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
                rows = con.execute(
                    "SELECT slug, name FROM client_roster WHERE relationship IN "
                    "('current_client','past_client','internal') "
                    "ORDER BY (relationship='current_client') DESC, name").fetchall()
                con.close()
            except sqlite3.Error:
                rows = []
        default = self.b.CONFIG.get("default_client") or ""
        if not rows:
            rows = [("", "No client (general ideas)")]
        return {"default": default, "clients": [{"slug": s, "name": n} for s, n in rows]}

    def title_history(self):
        try:
            return json.loads(self.history_path.read_text())
        except (OSError, ValueError):
            return []

    def start_titles(self, payload):
        image = payload.get("image_path")
        if not image:
            raise ValueError("Capture the screen or drop a screenshot first.")
        ok = self.image_ok(image)
        if not ok:
            raise ValueError("That image could not be read.")
        client = (payload.get("client") or "").strip() or None
        count = max(3, min(int(payload.get("count") or 10), 20))
        job = self.new_job("titles", client=client, image=str(ok),
                           stage="Reading the screen (about 1 to 2 minutes)")
        threading.Thread(target=self._run_titles,
                         args=(job, str(ok), client, count, payload.get("extra")),
                         daemon=True).start()
        return job

    def _run_titles(self, job, image, client, count, extra):
        try:
            result = self.b.generate_ideas(image, client=client, count=count, extra=extra)
        except Exception as e:
            return self.finish(job, status="error", error=str(e)[:500])
        history = self.title_history()
        history.insert(0, {"id": job["id"], "at": now_iso(), "client": client, "image": image,
                           "provider": result.get("provider"), "titles": result["titles"]})
        try:
            self.history_path.write_text(json.dumps(history[:60], indent=2))
        except OSError:
            pass
        self.finish(job, status="done", stage="Done", titles=result["titles"],
                    provider=result.get("provider"))

    # ------------------------------------------------------------- screens

    def screen_dirs(self):
        base = Path.home() / "Desktop" / "Screenshots"
        return sorted((d for d in base.glob("*") if d.is_dir()), reverse=True)[:3] if base.is_dir() else []

    def list_screens(self, limit=36):
        files = []
        for d in self.screen_dirs():
            files += [p for p in d.glob("*") if p.suffix.lower() in self.b.IMAGE_SUFFIXES]
        files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        loose = self.loose_screenshots()
        return {"screens": [{"path": str(p), "name": p.name,
                             "when": datetime.fromtimestamp(p.stat().st_mtime).astimezone().isoformat(timespec="seconds")}
                            for p in files[:limit]], "loose": len(loose)}

    def loose_screenshots(self):
        home = Path.home()
        found = []
        for src in [*(home / "Desktop").glob("*/"), home / "Desktop", home / "Downloads"]:
            if not src.is_dir():
                continue
            for pat in ("Screen Shot*.png", "Screenshot*.png", "CleanShot*.png"):
                found += [p for p in src.glob(pat) if p.is_file()]
        return found

    def gather_screens(self):
        dest = Path.home() / "Desktop" / "Screenshots" / datetime.now().strftime("%Y-%m-%d")
        dest.mkdir(parents=True, exist_ok=True)
        moved = 0
        for p in self.loose_screenshots():
            target = dest / p.name
            if not target.exists():
                shutil.move(str(p), str(target))
                moved += 1
        return moved

    def start_screens(self, payload):
        paths = []
        for p in payload.get("paths", [])[:12]:
            ok = self.image_ok(p)
            if ok:
                paths.append(str(ok))
        if not paths:
            raise ValueError("Pick at least one screenshot to read.")
        job = self.new_job("screens", total=len(paths), stage="Checking the Antigravity login")
        threading.Thread(target=self._run_screens, args=(job, paths), daemon=True).start()
        return job

    def _run_screens(self, job, paths):
        agy = self.b.CONFIG.get("agy_bin") or str(Path.home() / ".local/bin/agy")
        if not Path(agy).exists():
            return self.finish(job, status="error", error="The Antigravity tool (agy) was not found.")
        try:
            probe = self.run([agy, "-p", "Reply with exactly: OK"], 45)
        except subprocess.TimeoutExpired:
            probe = None
        if not probe or "OK" not in probe.stdout:
            return self.finish(job, status="error", error=(
                "Antigravity is not signed in, so nothing was read. Run `agy` in Terminal and sign in."))
        for i, img in enumerate(paths, 1):
            job["stage"] = f"Reading screen {i} of {len(paths)}"
            try:
                r = self.run([agy, "-p", SCREEN_PROMPT.format(img=img), "--effort", "low",
                              "--add-dir", str(Path(img).parent)], 240)
                text = "\n".join((r.stdout or "").strip().splitlines()[-12:]).strip()
            except subprocess.TimeoutExpired:
                text = ""
            with self.lock:
                job["partial"].append({"path": img, "name": Path(img).name,
                                       "text": text or "No answer came back for this one."})
        report = self.screens_dir / f"READ-{datetime.now():%Y%m%d-%H%M%S}.md"
        lines = [f"# Screens read by Antigravity, {datetime.now():%Y-%m-%d %H:%M}", ""]
        for item in job["partial"]:
            lines += [f"## {item['name']}", "", item["text"], "", "---", ""]
        report.write_text("\n".join(lines))
        self.finish(job, status="done", stage="Done", report=str(report))

    # ------------------------------------------------------------ HTTP glue

    def handle(self, h, method, raw_path):
        """Return True if this request belongs to the studio."""
        url = urlparse(raw_path)
        path, qs = url.path, parse_qs(url.query)
        q = lambda k, d="": (qs.get(k) or [d])[0]
        try:
            if method == "GET":
                return self._get(h, path, q)
            if method in ("POST", "DELETE"):
                return self._post(h, method, path, q)
        except ValueError as e:
            h._send(400, {"error": str(e)})
            return True
        except (BrokenPipeError, ConnectionResetError):
            return True          # the page went away mid-request; nothing to tell it
        except Exception as e:  # never leave a request hanging
            self.b.log(f"studio error {method} {path}: {e}")
            h._send(500, {"error": "Something went wrong inside the bridge. Check state/bridge.log."})
            return True
        return False

    def _get(self, h, path, q):
        if path in ("/app", "/app/"):
            return self.index(h)
        if path.startswith("/app/"):
            target = (UI_DIR / unquote(path[5:])).resolve()
            if UI_DIR.resolve() not in target.parents or not target.is_file():
                h._send(404, {"error": "not found"})
                return True
            return self.static(h, target)
        if path == "/media":
            p = self.image_ok(q("path")) or self.video_ok(q("path"))
            if not p:
                h._send(403, {"error": "That file cannot be shown."})
                return True
            return self.serve_file(h, p)
        if path == "/thumb":
            p = self.image_ok(q("path")) or self.video_ok(q("path"))
            if not p:
                h._send(403, {"error": "That file cannot be shown."})
                return True
            t = self.thumb(p, max(64, min(int(q("w", "480") or 480), 1600)))
            if not t:
                h._send(404, {"error": "no thumbnail"})
                return True
            return self.serve_file(h, t, immutable=bool(q("v")))
        if path == "/rec-thumb":
            t = self.rec_thumb(q("name"))
            if not t:
                h._send(404, {"error": "no thumbnail"})
                return True
            return self.serve_file(h, t)
        if not path.startswith("/api/"):
            return False
        route = path[5:]
        if route == "state":
            h._send(200, {"ok": True, "drive": self.b.DRIVE, "port": h.server.server_address[1],
                          "version": 1, "captures_dir": str(self.captures)})
        elif route == "boot":
            h._send(200, self.boot())
        elif route == "clients":
            h._send(200, self.clients())
        elif route == "refs":
            h._send(200, {"sets": self.list_refs()})
        elif route == "library":
            items, total = self.library(q("q"), q("scope", "mine"), int(q("limit", "120") or 120))
            h._send(200, {"items": items, "total": total,
                          "folder": str(self.b.IMAGES_DIR)})
        elif route == "recordings":
            h._send(200, {"recordings": self.recordings(), "drive": self.b.DRIVE,
                          "folder": str(self.b.WATCH_DIR)})
        elif route == "titles/history":
            h._send(200, {"history": self.title_history()})
        elif route == "screens":
            h._send(200, self.list_screens())
        elif route.startswith("jobs/"):
            job = self.jobs.get(route[5:])
            if not job:
                h._send(404, {"error": "That job is gone. Start it again."})
            else:
                h._send(200, self.job_view(job))
        else:
            h._send(404, {"error": "not found"})
        return True

    def _body_json(self, h):
        length = int(h.headers.get("Content-Length") or 0)
        if length > self.b.MAX_BODY_BYTES:
            raise ValueError("Request too large.")
        raw = h.rfile.read(length) if length else b""
        try:
            return json.loads(raw or b"{}")
        except ValueError:
            raise ValueError("Bad request body.")

    def _body_bytes(self, h):
        length = int(h.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            raise ValueError("Pictures up to 40 MB are fine.")
        return h.rfile.read(length)

    def _post(self, h, method, path, q):
        if not path.startswith("/api/"):
            return False
        route = path[5:]
        if method == "DELETE":
            only = re.match(r"^refs/([^/]+)$", route)
            if only:
                self.delete_set(unquote(only.group(1)))
                h._send(200, {"ok": True})
                return True
            m = re.match(r"^refs/([^/]+)/([^/]+)$", route)
            if not m:
                h._send(404, {"error": "not found"})
                return True
            self.delete_ref(unquote(m.group(1)), unquote(m.group(2)))
            h._send(200, {"ok": True})
            return True
        m = re.match(r"^refs/([^/]+)$", route)
        if m:      # add a picture to a shelf set; the file name rides in a header
            name = unquote(h.headers.get("X-Filename") or "reference.png")
            saved = self.save_ref(unquote(m.group(1)), name, self._body_bytes(h))
            h._send(200, {"ok": True, "path": str(saved), "name": saved.name})
            return True
        if route == "upload":
            name = unquote(h.headers.get("X-Filename") or "drop.png")
            saved = self.save_upload(name, self._body_bytes(h))
            h._send(200, {"ok": True, "path": str(saved)})
            return True
        payload = self._body_json(h)
        if route == "refs-keep":
            saved = self.keep_ref(payload.get("path"), str(payload.get("set", "")))
            h._send(200, {"ok": True, "path": str(saved), "name": saved.name})
            return True
        if route == "refs-new":
            name = str(payload.get("name", "")).strip().lower().replace(" ", "-")
            if not SET_NAME.match(name):
                raise ValueError("Use lowercase letters, numbers and dashes for the name.")
            (self.refs_root / name).mkdir(parents=True, exist_ok=True)
            h._send(200, {"ok": True, "name": name})
        elif route == "image":
            h._send(200, {"ok": True, "job": self.job_view(self.start_image(payload))})
        elif re.match(r"^jobs/[0-9a-f]+/cancel$", route):
            h._send(200 if self.cancel_job(route.split("/")[1]) else 404, {"ok": True})
        elif route == "titles":
            h._send(200, {"ok": True, "job": self.job_view(self.start_titles(payload))})
        elif route == "screens/gather":
            h._send(200, {"ok": True, "moved": self.gather_screens()})
        elif route == "screens/read":
            h._send(200, {"ok": True, "job": self.job_view(self.start_screens(payload))})
        elif route == "copy-image":
            p = self.image_ok(payload.get("path"))
            if not p:
                raise ValueError("That image could not be read.")
            h._send(200, {"ok": self.copy_image(p)})
        elif route == "reveal":
            p = self.image_ok(payload.get("path")) or self.video_ok(payload.get("path"))
            if not p:
                raise ValueError("That file could not be found.")
            self.run(["/usr/bin/open", "-R", str(p)], 20)
            h._send(200, {"ok": True})
        else:
            h._send(404, {"error": "not found"})
        return True

    # ------------------------------------------------------------- files

    def index(self, h):
        """The whole first screen in ONE response: page, styles, script and the boot data.

        On a busy Mac every request waits its turn for the CPU; five requests meant five
        waits before anything appeared. One request means one wait."""
        page = (UI_DIR / "index.html").read_text()
        css = (UI_DIR / "studio.css").read_text()
        js = (UI_DIR / "studio.js").read_text().replace("</script", "<\\/script")
        try:
            boot = json.dumps(self.boot()).replace("</", "<\\/")
        except Exception as e:                      # the page still opens; it asks for boot itself
            self.b.log(f"index: boot data not inlined: {e}")
            boot = "null"
        page = page.replace('<link rel="stylesheet" href="/app/studio.css" />', "<style>" + css + "</style>")
        page = page.replace('<script src="/app/studio.js"></script>',
                            "<script>window.__BOOT__=" + boot + ";</script><script>" + js + "</script>")
        data = page.encode()
        h.send_response(200)
        h.send_header("Content-Type", "text/html; charset=utf-8")
        h.send_header("Content-Length", str(len(data)))
        h.send_header("Cache-Control", "no-cache")
        h.end_headers()
        h.wfile.write(data)
        return True

    def static(self, h, path):
        data = path.read_bytes()
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if path.suffix == ".js":
            ctype = "text/javascript"
        h.send_response(200)
        h.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") else ""))
        h.send_header("Content-Length", str(len(data)))
        h.send_header("Cache-Control", "no-cache")
        h.end_headers()
        h.wfile.write(data)
        return True

    def serve_file(self, h, path, immutable=False):
        """Stream a file with HTTP Range support, so videos can seek."""
        size = path.stat().st_size
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        start, end, status = 0, size - 1, 200
        rng = h.headers.get("Range")
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                else:
                    start = max(0, size - int(m.group(2)))
                end = min(end, size - 1)
                if start > end:
                    h.send_response(416)
                    h.send_header("Content-Range", f"bytes */{size}")
                    h.send_header("Content-Length", "0")
                    h.end_headers()
                    return True
                status = 206
        h.send_response(status)
        h.send_header("Content-Type", ctype)
        h.send_header("Accept-Ranges", "bytes")
        h.send_header("Content-Length", str(end - start + 1))
        # a versioned thumbnail never changes: the browser can keep it forever and skip the request
        h.send_header("Cache-Control", "public, max-age=31536000, immutable" if immutable else "no-cache")
        if status == 206:
            h.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        h.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(start)
                left = end - start + 1
                while left > 0:
                    chunk = f.read(min(1 << 20, left))
                    if not chunk:
                        break
                    h.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        return True
