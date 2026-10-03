"""Titles that say what is IN a picture or a video.

Every saved image and recording gets a title, a one-line description and a few tags
that come from looking at it, never from its file name or the time it was made.
They are kept in three places so any person or skill can read them:

  1. state/titles.json                      (the Studio's own index)
  2. the entry in images.json / recordings.json
  3. a sidecar next to the file:  <name>.meta.json

Until the vision model has answered, a plain title is made from the prompt that
produced the image (marked src="prompt"). A recording with nothing to go on is
"Screen Recording" with its date (src="pending"). The worker upgrades both to
src="vision" in the background, one item at a time, so it never competes with
the screen you are looking at.
"""

import hashlib
import json
import os
import queue
import re
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

LEAD_STYLE = {"photoreal", "photorealistic", "realistic", "hyperrealistic", "cinematic", "a", "an", "the"}
SMALL = {"of", "a", "an", "the", "at", "with", "in", "on", "and", "for", "to", "by", "from", "as", "or", "into", "over", "under"}
BANNED = re.compile(r"\b(image|picture|photo|screenshot|ai[- ]generated|generated)\b", re.I)

JSON_RULES = """Reply with ONLY one JSON object, no other text:
{"title": "...", "summary": "...", "tags": ["...", "..."]}
Rules for title: 3 to 8 words, Title Case, no quotes, no trailing period, no dashes. It must say what is IN it: the subject and the setting or what is happening. Example: Komodo Dragon Lounging In A Living Room. For a screen capture, name the app or site and what it shows. Example: CapCut Timeline With Two Caption Tracks. Never use the words image, picture, photo, screenshot, AI or generated.
Rules for summary: one plain sentence that someone who cannot see it would understand.
Rules for tags: 3 to 6 lowercase words a person would search for."""


def title_from_prompt(prompt):
    """A plain, honest title from the words that made the picture."""
    first = re.split(r"[,.;:\n]", (prompt or "").strip(), maxsplit=1)[0]
    words = [w for w in first.split() if w]
    while words and words[0].lower() in LEAD_STYLE:
        words.pop(0)
    words = words[:8]
    while words and words[-1].lower() in SMALL:
        words.pop()
    if not words:
        return ""
    return " ".join(w if i and w.lower() in SMALL else w[:1].upper() + w[1:] for i, w in enumerate(words))


def slug(text, limit=40):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:limit].rstrip("-") or "image"


def clean_title(text):
    text = re.sub(r"\s+", " ", str(text or "")).strip().strip("\"'").rstrip(".")
    text = text.replace(" — ", ": ").replace("—", "-").replace("–", "-")
    return text


def valid_title(text):
    n = len(text.split())
    return 2 <= n <= 12 and len(text) <= 90 and not BANNED.search(text)


class Titler:
    def __init__(self, studio):
        self.s = studio
        self.b = studio.b
        self.path = studio.state / "titles.json"
        self.lock = threading.Lock()
        self.data = {}
        self.loaded = 0
        self.reload()
        self.q = queue.Queue()
        self.queued = set()
        self.tries = {}
        self.worker = None
        self.enabled = True

    # ----------------------------------------------------------- lookup

    def reload(self):
        """Titles may be written by another process (an agent, a script). Pick them up when the file changes."""
        try:
            m = self.path.stat().st_mtime_ns
            if m != self.loaded:
                data = json.loads(self.path.read_text())
                with self.lock:
                    self.data = data
                self.loaded = m
        except (OSError, ValueError):
            pass

    @staticmethod
    def key(kind, ident):
        return f"{kind}:{ident}"

    def info(self, kind, ident):
        self.reload()
        with self.lock:
            return self.data.get(self.key(kind, ident))

    @staticmethod
    def real_prompt(path, prompt):
        """The words that made the picture. A placeholder is not a prompt; the receipt beside the file is."""
        prompt = (prompt or "").strip()
        if prompt.lower() in ("", "earlier generated image", "untitled"):
            prompt = ""
            receipt = Path(path).with_suffix(".prompt.txt")
            try:
                m = re.search(r"PROMPT \(as given\):\s*\n(.+?)\n\s*\n", receipt.read_text(errors="ignore"), re.S)
                prompt = m.group(1).strip() if m else ""
            except OSError:
                pass
        return prompt

    def image_fields(self, path, prompt="", ts=""):
        """Title fields for one image, from the best source we have right now."""
        path = str(path)
        prompt = self.real_prompt(path, prompt)
        hit = self.info("img", path)
        if hit and hit.get("src") == "vision":
            return hit
        self.want("img", path, {"prompt": prompt})
        t = title_from_prompt(prompt)
        if t:
            return {"title": t, "summary": "", "tags": [], "src": "prompt"}
        return {"title": "Untitled picture", "summary": "", "tags": [], "src": "pending"}

    def video_fields(self, name, when=""):
        hit = self.info("vid", name)
        if hit and hit.get("src") == "vision":
            return hit
        self.want("vid", name, {})
        label = ""
        try:
            label = datetime.fromisoformat(when).astimezone().strftime("%b %-d, %-I:%M %p") if when else ""
        except ValueError:
            pass
        return {"title": ("Screen Recording " + label).strip(), "summary": "", "tags": [], "src": "pending"}

    # ----------------------------------------------------------- queue

    def want(self, kind, ident, payload):
        if not self.enabled:
            return
        k = self.key(kind, ident)
        with self.lock:
            if k in self.queued or self.tries.get(k, (0, 0))[0] >= 3:
                return
            n, last = self.tries.get(k, (0, 0))
            if n and time.time() - last < 600:
                return
            self.queued.add(k)
        self.q.put((kind, ident, payload))
        self.start()

    def start(self):
        with self.lock:
            if self.worker and self.worker.is_alive():
                return
            self.worker = threading.Thread(target=self.run, daemon=True, name="titler")
            self.worker.start()

    def run(self):
        while True:
            try:
                kind, ident, payload = self.q.get(timeout=300)
            except queue.Empty:
                return
            k = self.key(kind, ident)
            try:
                info = self.describe_image(ident, payload.get("prompt", "")) if kind == "img" \
                    else self.describe_video(ident)
                if info:
                    self.save(kind, ident, info)
                else:
                    raise RuntimeError("no usable title")
            except Exception as e:
                n = self.tries.get(k, (0, 0))[0] + 1
                self.tries[k] = (n, time.time())
                self.b.log(f"titler: {kind} {Path(ident).name} attempt {n} failed: {str(e)[:160]}")
            finally:
                with self.lock:
                    self.queued.discard(k)
            time.sleep(2)          # one at a time, never in a hurry

    # ----------------------------------------------------------- vision

    def ask(self, image_path, prompt):
        provider, text = self.b.vision_text(image_path, prompt)
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise RuntimeError(f"{provider}: no JSON object in the answer")
        obj = json.loads(m.group(0))
        title = clean_title(obj.get("title"))
        if not valid_title(title):
            raise RuntimeError(f"{provider}: title not usable: {title[:60]!r}")
        tags = [re.sub(r"[^a-z0-9 -]", "", str(t).lower()).strip() for t in (obj.get("tags") or [])][:6]
        return {"title": title, "summary": clean_title(obj.get("summary"))[:300],
                "tags": [t for t in tags if t], "src": "vision", "by": provider,
                "at": datetime.now().astimezone().isoformat(timespec="seconds")}

    def small_copy(self, path):
        """A 1024 px JPEG so the vision call moves little data."""
        made = self.s.thumb(path, 900)
        return made or Path(path)

    def describe_image(self, path, prompt):
        p = Path(path)
        if not p.is_file():
            return None
        ctx = ""
        if prompt:
            ctx = (f"\nIt was made from this prompt: {prompt.strip()[:400]}\n"
                   "Title what the picture actually shows, not just the prompt.")
        return self.ask(str(self.small_copy(p)), f"Look at this picture.{ctx}\n{JSON_RULES}")

    def frames_sheet(self, name):
        """Four frames from a recording, side by side in one picture."""
        from PIL import Image
        entry = next((e for e in self.b.registry_read() if e.get("name") == name), None)
        if not entry:
            return None, None
        local = Path(entry.get("file", ""))
        src = str(local) if local.is_file() else entry.get("url")
        ff = self.s.find_bin("ffmpeg")
        if not src or not ff:
            return None, None
        dur = (self.s.media_meta(local).get("duration") if local.is_file() else None) or 0
        if not dur:
            fp = self.s.find_bin("ffprobe")
            if fp:
                try:
                    r = self.s.run([fp, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src], 240)
                    dur = float(r.stdout.strip())
                except (subprocess.TimeoutExpired, ValueError):
                    dur = 0             # a long file read over the network: sample at fixed marks instead
        marks = [dur * f for f in (0.1, 0.35, 0.6, 0.85)] if dur else [2, 20, 60, 120]
        tiles = []
        for i, t in enumerate(marks):
            out = self.s.thumbs / f"titler-{hashlib.sha1(name.encode()).hexdigest()[:12]}-{i}.jpg"
            try:
                self.s.run([ff, "-y", "-loglevel", "error", "-ss", f"{t:.1f}", "-i", src, "-frames:v", "1",
                            "-vf", "scale=640:-2", str(out)], 240)
            except subprocess.TimeoutExpired:
                out.unlink(missing_ok=True)
                continue
            if out.is_file() and out.stat().st_size > 0:
                tiles.append(out)
        if not tiles:
            return None, dur
        ims = [Image.open(t).convert("RGB") for t in tiles]
        w, h = ims[0].size
        sheet = Image.new("RGB", (w * 2, h * 2 if len(ims) > 2 else h), (0, 0, 0))
        for i, im in enumerate(ims[:4]):
            sheet.paste(im.resize((w, h)), ((i % 2) * w, (i // 2) * h))
        out = self.s.thumbs / f"titler-sheet-{hashlib.sha1(name.encode()).hexdigest()[:12]}.jpg"
        sheet.save(out, quality=85)
        for t in tiles:
            t.unlink(missing_ok=True)
        return out, dur

    def describe_video(self, name):
        sheet, dur = self.frames_sheet(name)
        if not sheet:
            return None
        mins = f"{int(dur // 60)} min {int(dur % 60)} s" if dur else "unknown length"
        return self.ask(str(sheet), (
            f"These frames, in order, come from one screen recording ({mins}). "
            "Say what the recording is about: the app or site and the task being shown.\n" + JSON_RULES))

    # ----------------------------------------------------------- keep

    def save(self, kind, ident, info):
        with self.lock:
            self.data[self.key(kind, ident)] = info
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, indent=1))
            os.replace(tmp, self.path)
        fields = {"title": info["title"], "summary": info["summary"], "tags": info["tags"]}
        try:
            if kind == "img":
                self.b.registry_annotate("img", ident, fields)
            else:
                self.b.registry_annotate("vid", ident, fields)
        except Exception as e:
            self.b.log(f"titler: registry note failed for {Path(ident).name}: {e}")
        self.sidecar(kind, ident, info)
        self.s.invalidate()
        self.b.log(f"titled {Path(ident).name}: {info['title']}")

    def sidecar(self, kind, ident, info):
        """<name>.meta.json beside the file, so a skill that only sees the folder still knows what it is."""
        if kind == "img":
            target = Path(ident)
        else:
            entry = next((e for e in self.b.registry_read() if e.get("name") == ident), None)
            target = Path(entry["file"]) if entry and entry.get("file") else None
        if not target or not target.parent.is_dir():
            return
        meta = {"title": info["title"], "summary": info["summary"], "tags": info["tags"],
                "file": target.name, "described_by": info.get("by"), "described_at": info.get("at")}
        try:
            target.with_name(target.stem + ".meta.json").write_text(json.dumps(meta, indent=2))
        except OSError:
            pass
