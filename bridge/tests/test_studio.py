"""Tests for the Say Less Studio API (bridge/studio.py).

No network, no painters, no B2. Image jobs run against a fake `subpowers`.
Run from the repo root:  python3 -m unittest discover -s bridge/tests -v
"""
import http.client
import json
import urllib.parse
import os
import stat
import sys
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(tempfile.mkdtemp(prefix="sl-studio-test-"))
os.environ["SAYLESS_BRIDGE_HOME"] = str(ROOT / "bridge-home")
os.environ["SAYLESS_VE_DB"] = str(ROOT / "ve-social.db")
os.environ["SUBPOWERS_REFS"] = str(ROOT / "refs")
os.environ["HOME"] = str(ROOT / "home")            # keeps the allow-lists inside the sandbox
(ROOT / "home" / "Pictures" / "Say Less Images").mkdir(parents=True)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bridge  # noqa: E402
import studio  # noqa: E402

# Pillow makes real PNGs/JPEGs for the thumbnail and upload tests
from PIL import Image  # noqa: E402


def png_bytes(color=(200, 30, 60), size=(64, 48)):
    import io
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


class StudioCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        bridge.HOME = ROOT / "home"
        bridge.IMAGES_DIR = bridge.HOME / "Pictures" / "Say Less Images"
        bridge.WATCH_DIR = bridge.HOME / "Movies" / "Say Less"
        bridge.WATCH_DIR.mkdir(parents=True, exist_ok=True)
        cls.studio = studio.Studio(bridge)
        cls.studio.sp_library = ROOT / "library.jsonl"
        bridge._STUDIO = cls.studio
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), bridge.Handler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def call(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Content-Type": "application/json"}
        h.update(headers or {})
        data = body if isinstance(body, (bytes, bytearray)) else (json.dumps(body).encode() if body is not None else None)
        conn.request(method, path, body=data, headers=h)
        r = conn.getresponse()
        raw = r.read()
        conn.close()
        try:
            return r.status, json.loads(raw)
        except ValueError:
            return r.status, raw


class Pages(StudioCase):
    def test_app_page_is_served(self):
        st, raw = self.call("GET", "/app")
        self.assertEqual(st, 200)
        self.assertIn(b"Say Less Studio", raw)

    def test_static_files_and_traversal(self):
        self.assertEqual(self.call("GET", "/app/studio.css")[0], 200)
        self.assertEqual(self.call("GET", "/app/../bridge.py")[0], 404)
        self.assertEqual(self.call("GET", "/app/%2e%2e/bridge.py")[0], 404)

    def test_state_reports_drive(self):
        st, data = self.call("GET", "/api/state")
        self.assertEqual(st, 200)
        self.assertIn("drive", data)


class References(StudioCase):
    def test_add_list_remove_and_delete_shelf(self):
        st, d = self.call("POST", "/api/refs-new", {"name": "Cards"})
        self.assertEqual(st, 200)
        self.assertEqual(d["name"], "cards")
        st, d = self.call("POST", "/api/refs/cards", png_bytes(),
                          {"Content-Type": "image/png", "X-Filename": "my%20card.png"})
        self.assertEqual(st, 200)
        saved = Path(d["path"])
        self.assertTrue(saved.is_file())
        self.assertEqual(saved.parent.name, "cards")
        st, d = self.call("GET", "/api/refs")
        names = {s["name"]: len(s["items"]) for s in d["sets"]}
        self.assertEqual(names["cards"], 1)
        self.assertEqual(self.call("DELETE", "/api/refs/cards")[0], 400)       # not empty yet
        self.assertEqual(self.call("DELETE", f"/api/refs/cards/{urllib.parse.quote(saved.name)}")[0], 200)
        self.assertEqual(self.call("DELETE", "/api/refs/cards")[0], 200)

    def test_rejects_bad_names_and_non_images(self):
        self.assertEqual(self.call("POST", "/api/refs-new", {"name": "../evil"})[0], 400)
        st, _ = self.call("POST", "/api/refs/cards", b"hello", {"Content-Type": "text/plain", "X-Filename": "x.txt"})
        self.assertEqual(st, 400)

    def test_cannot_delete_outside_the_shelf(self):
        self.call("POST", "/api/refs-new", {"name": "keepme"})
        self.assertEqual(self.call("DELETE", "/api/refs/keepme/..%2F..%2Fescape.png")[0], 400)

    def test_keep_an_upload_on_a_shelf(self):
        st, up = self.call("POST", "/api/upload", png_bytes((1, 2, 3)), {"Content-Type": "image/png", "X-Filename": "drop.png"})
        self.assertEqual(st, 200)
        st, kept = self.call("POST", "/api/refs-keep", {"path": up["path"], "set": "me"})
        self.assertEqual(st, 200)
        self.assertTrue(Path(kept["path"]).is_file())


class ImageJobs(StudioCase):
    def fake_subpowers(self, script):
        bin_dir = ROOT / "fakebin"
        bin_dir.mkdir(exist_ok=True)
        sp = bin_dir / "subpowers"
        sp.write_text(script)
        sp.chmod(sp.stat().st_mode | stat.S_IEXEC)
        return sp

    def wait(self, job_id, timeout=15):
        end = time.time() + timeout
        while time.time() < end:
            st, d = self.call("GET", f"/api/jobs/{job_id}")
            if d["status"] != "running":
                return d
            time.sleep(0.1)
        self.fail("job did not finish")

    def test_image_job_builds_the_right_command_and_returns_outputs(self):
        sp = self.fake_subpowers('#!/bin/bash\necho "$@" > "$(dirname "$3")/args.txt"\n'
                                 'python3 -c "import os; from PIL import Image; Image.frombytes(\'RGB\',(60,60),os.urandom(60*60*3)).save(\'$3\')"\n')
        with mock.patch.object(self.studio, "find_bin", side_effect=lambda n, extra=(): str(sp) if n == "subpowers" else None), \
             mock.patch.object(self.studio, "_register"):
            st, d = self.call("POST", "/api/image", {"prompt": "a green monkey", "painter": "antigravity",
                                                      "size": "wide", "ref_sets": ["luis", "../bad"]})
            self.assertEqual(st, 200)
            job = self.wait(d["job"]["id"])
        self.assertEqual(job["status"], "done", job)
        self.assertEqual(len(job["outputs"]), 1)
        out = Path(job["outputs"][0]["path"])
        self.assertTrue(out.is_file())
        args = (out.parent / "args.txt").read_text()
        self.assertIn("--painter antigravity", args)
        self.assertIn("--refs luis", args)
        self.assertNotIn("../bad", args)
        self.assertIn("--size 1536x1024", args)

    def test_failed_painter_gives_a_plain_error(self):
        sp = self.fake_subpowers("#!/bin/bash\necho 'no painter is connected' >&2\nexit 1\n")
        with mock.patch.object(self.studio, "find_bin", side_effect=lambda n, extra=(): str(sp) if n == "subpowers" else None):
            st, d = self.call("POST", "/api/image", {"prompt": "x"})
            job = self.wait(d["job"]["id"])
        self.assertEqual(job["status"], "error")
        self.assertIn("subpowers doctor", job["error"])

    def test_needs_a_prompt_and_known_painter(self):
        self.assertEqual(self.call("POST", "/api/image", {"prompt": "  "})[0], 400)
        self.assertEqual(self.call("POST", "/api/image", {"prompt": "x", "painter": "midjourney"})[0], 400)

    def test_reference_outside_home_is_refused(self):
        self.assertEqual(self.call("POST", "/api/image", {"prompt": "x", "ref_paths": ["/etc/hosts"]})[0], 400)


class FilesAndLibrary(StudioCase):
    def test_media_serves_images_with_range_for_video(self):
        img = bridge.IMAGES_DIR / "2026" / "10" / "a.png"
        img.parent.mkdir(parents=True, exist_ok=True)
        img.write_bytes(png_bytes())
        st, raw = self.call("GET", "/media?path=" + urllib.parse.quote(str(img)))
        self.assertEqual(st, 200)
        vid = bridge.WATCH_DIR / "clip.mp4"
        vid.write_bytes(bytes(range(256)) * 40)
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request("GET", "/media?path=" + urllib.parse.quote(str(vid)), headers={"Range": "bytes=10-19"})
        r = conn.getresponse()
        body = r.read()
        self.assertEqual(r.status, 206)
        self.assertEqual(body, bytes(range(10, 20)))
        self.assertEqual(r.getheader("Content-Range"), f"bytes 10-19/{10240}")

    def test_media_refuses_other_files(self):
        self.assertEqual(self.call("GET", "/media?path=/etc/hosts")[0], 403)

    def test_thumbnail_is_a_small_jpeg(self):
        img = bridge.IMAGES_DIR / "big.png"
        Image.new("RGB", (1600, 900), (10, 80, 160)).save(img)
        st, raw = self.call("GET", f"/thumb?w=200&path={urllib.parse.quote(str(img))}")
        self.assertEqual(st, 200)
        self.assertTrue(raw[:3] == b"\xff\xd8\xff")

    def test_library_search_and_scope(self):
        mine = bridge.IMAGES_DIR / "2026" / "10" / "monkey.png"
        mine.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (8, 8)).save(mine)
        other = ROOT / "home" / "Pictures" / "elsewhere.png"
        Image.new("RGB", (8, 8)).save(other)
        self.studio.sp_library.write_text(
            json.dumps({"path": str(mine), "prompt": "a green monkey at a cafe", "ts": "2026-10-02T10:00:00"}) + "\n" +
            json.dumps({"path": str(other), "prompt": "a red car", "ts": "2026-10-01T10:00:00"}) + "\n")
        st, d = self.call("GET", "/api/library?scope=mine&q=monkey")
        self.assertEqual([i["name"] for i in d["items"]], ["monkey.png"])
        self.assertEqual(d["items"][0]["prompt"], "a green monkey at a cafe")
        st, d = self.call("GET", "/api/library?scope=mine&q=red")
        self.assertEqual(d["items"], [])
        st, d = self.call("GET", "/api/library?scope=all&q=red")
        self.assertEqual([i["name"] for i in d["items"]], ["elsewhere.png"])


class RecordingsAndTitles(StudioCase):
    def test_recordings_list_registered_and_waiting(self):
        done = bridge.WATCH_DIR / "Say Less 2026-09-28 at 19.20.09.mp4"
        done.write_bytes(b"x" * 1000)
        waiting = bridge.WATCH_DIR / "Say Less 2026-10-02 at 10.00.00.mp4"
        waiting.write_bytes(b"y" * 500)
        bridge.registry_write([{"file": str(done), "name": done.name, "size_bytes": 1000, "uploaded_at": "2026-09-29T00:00:00+00:00",
                                "url": "https://example.test/x", "b2": {"key": "k"}}])
        st, d = self.call("GET", "/api/recordings")
        by = {r["name"]: r for r in d["recordings"]}
        self.assertEqual(by[done.name]["status"], "uploaded")
        self.assertEqual(by[done.name]["url"], "https://example.test/x")
        self.assertEqual(by[waiting.name]["status"], "waiting")

    def test_titles_job_stores_history(self):
        shot = ROOT / "home" / "shot.png"
        Image.new("RGB", (10, 10)).save(shot)
        fake = {"titles": [{"style": "Question", "text": "Why Do Cuts Fail"}], "provider": "agy:test"}
        with mock.patch.object(bridge, "generate_ideas", return_value=fake):
            st, d = self.call("POST", "/api/titles", {"image_path": str(shot), "client": "ryan-magin", "count": 5})
            self.assertEqual(st, 200)
            for _ in range(60):
                st, job = self.call("GET", f"/api/jobs/{d['job']['id']}")
                if job["status"] != "running":
                    break
                time.sleep(0.1)
        self.assertEqual(job["status"], "done")
        self.assertEqual(job["titles"][0]["text"], "Why Do Cuts Fail")
        st, h = self.call("GET", "/api/titles/history")
        self.assertEqual(h["history"][0]["titles"][0]["text"], "Why Do Cuts Fail")

    def test_titles_needs_a_readable_image(self):
        self.assertEqual(self.call("POST", "/api/titles", {})[0], 400)
        self.assertEqual(self.call("POST", "/api/titles", {"image_path": "/etc/hosts"})[0], 400)


class Origin(StudioCase):
    def test_same_origin_posts_pass_and_other_sites_do_not(self):
        ok = self.call("POST", "/api/refs-new", {"name": "origin-ok"}, {"Origin": f"http://127.0.0.1:{self.port}"})
        self.assertEqual(ok[0], 200)
        bad = self.call("POST", "/api/refs-new", {"name": "origin-bad"}, {"Origin": "https://evil.example"})
        self.assertEqual(bad[0], 403)
        self.assertEqual(self.call("GET", "/api/refs", None, {"Origin": "https://evil.example"})[0], 403)


if __name__ == "__main__":
    unittest.main()
