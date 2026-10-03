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
        cls.studio.titler.enabled = False      # no vision calls from tests, except the ones that ask for it
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

    def test_painter_that_does_not_answer_hands_over_to_another(self):
        # a busy Mac makes the Nano Banana login check time out, so subpowers skips it
        sp = self.fake_subpowers('#!/bin/bash\nif [[ "$*" == *"--painter antigravity"* ]]; then\n'
                                 "  echo 'subpowers: antigravity is not connected (paused or logged out); skipping' >&2; exit 1\nfi\n"
                                 'python3 -c "import os; from PIL import Image; Image.frombytes(\'RGB\',(60,60),os.urandom(60*60*3)).save(\'$3\')"\n')
        with mock.patch.object(self.studio, "find_bin", side_effect=lambda n, extra=(): str(sp) if n == "subpowers" else None), \
             mock.patch.object(self.studio, "_register"):
            time.sleep(1.1)   # file names carry the second; do not share one with the previous test
            st, d = self.call("POST", "/api/image", {"prompt": "a red apple", "painter": "antigravity"})
            job = self.wait(d["job"]["id"])
        self.assertEqual(job["status"], "done", job)
        self.assertEqual(len(job["outputs"]), 1)
        self.assertIn("another painter took over", job.get("note", ""))

    def test_a_slow_job_shows_what_the_painters_say_and_can_be_stopped(self):
        sp = self.fake_subpowers("#!/bin/bash\necho 'subpowers: antigravity is not connected; skipping' >&2\nsleep 30\n")
        with mock.patch.object(self.studio, "find_bin", side_effect=lambda n, extra=(): str(sp) if n == "subpowers" else None), \
             mock.patch.object(self.studio, "_register"):
            time.sleep(1.1)
            st, d = self.call("POST", "/api/image", {"prompt": "a slow one", "painter": "council"})
            jid = d["job"]["id"]
            for _ in range(40):
                st, j = self.call("GET", f"/api/jobs/{jid}")
                if j.get("log"):
                    break
                time.sleep(0.2)
            self.assertIn("antigravity is not connected", " ".join(j["log"]))
            self.assertEqual(j["status"], "running")
            t0 = time.time()
            self.assertEqual(self.call("POST", f"/api/jobs/{jid}/cancel", {})[0], 200)
            done = self.wait(jid, 10)
        self.assertLess(time.time() - t0, 8)
        self.assertEqual(done["status"], "error")
        self.assertIn("Stopped", done["error"])

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


class TitlesSayWhatIsInIt(StudioCase):
    def test_a_plain_title_comes_from_the_prompt_until_the_vision_title_lands(self):
        import titler
        self.assertEqual(titler.title_from_prompt(
            "Photoreal portrait of me at a standing desk with a mic and a green screen behind, soft key light"),
            "Portrait of Me at a Standing Desk")
        self.assertEqual(titler.title_from_prompt("godzilla komodo dragon as pet in living room"),
                         "Godzilla Komodo Dragon as Pet in Living Room")
        self.assertEqual(titler.title_from_prompt(""), "")
        self.assertEqual(titler.slug("Portrait of Me at a Standing Desk"), "portrait-of-me-at-a-standing-desk")
        f = self.studio.titler.image_fields("/nowhere/x.png", "a red apple on a white table")
        self.assertEqual((f["title"], f["src"]), ("Red Apple on a White Table", "prompt"))
        self.assertEqual(self.studio.titler.image_fields("/nowhere/y.png", "")["title"], "Untitled picture")

    def test_vision_title_is_kept_in_three_places(self):
        import titler
        img = bridge.IMAGES_DIR / "2026" / "10" / "apple-shot-02-100000.png"
        img.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (80, 80), (200, 20, 20)).save(img)
        bridge.IMAGES_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
        bridge.IMAGES_REGISTRY_PATH.write_text(json.dumps([{"file": str(img), "name": img.name, "prompt": "a red apple"}]))
        said = '{"title": "Red Apple On A White Table", "summary": "A single red apple sits on a white table.", "tags": ["apple", "red", "fruit"]}'
        t = self.studio.titler
        t.enabled = True
        try:
            with mock.patch.object(bridge, "vision_text", create=True, return_value=("agy:test", said)):
                info = t.describe_image(str(img), "a red apple")
            self.assertEqual(info["title"], "Red Apple On A White Table")
            t.save("img", str(img), info)
        finally:
            t.enabled = False
        self.assertEqual(t.image_fields(str(img), "a red apple")["src"], "vision")
        self.assertEqual(json.loads(bridge.IMAGES_REGISTRY_PATH.read_text())[0]["title"], "Red Apple On A White Table")
        side = json.loads(img.with_name(img.stem + ".meta.json").read_text())
        self.assertEqual(side["tags"], ["apple", "red", "fruit"])
        st, lib = self.call("GET", "/api/library?q=fruit")
        self.assertEqual([i["title"] for i in lib["items"]], ["Red Apple On A White Table"])
        self.assertEqual(lib["items"][0]["title_src"], "vision")

    def test_a_title_that_names_the_medium_or_says_nothing_is_refused(self):
        import titler
        for bad in ("Image of a dog", "AI generated screenshot", "Dog", "x" * 120):
            self.assertFalse(titler.valid_title(bad), bad)
        self.assertTrue(titler.valid_title("Komodo Dragon Lounging In A Living Room"))
        self.assertEqual(titler.clean_title('"Big Idea \u2014 Small Desk."'), "Big Idea: Small Desk")

    def test_placeholder_prompts_are_replaced_by_the_receipt_beside_the_file(self):
        import titler
        img = bridge.IMAGES_DIR / "2026" / "10" / "receipt-shot-02-110000.png"
        img.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (40, 40), (10, 10, 10)).save(img)
        img.with_suffix(".prompt.txt").write_text("PROMPT (as given):\nA bald man talking into a mic\n\nprovenance:\n  door: x\n")
        self.assertEqual(titler.Titler.real_prompt(str(img), "Earlier generated image"), "A bald man talking into a mic")
        self.assertEqual(self.studio.titler.image_fields(str(img), "")["title"], "Bald Man Talking into a Mic")

    def test_recording_without_a_title_is_called_a_screen_recording_with_its_date(self):
        f = self.studio.titler.video_fields("x.mp4", "2026-09-28T23:24:00+00:00")
        self.assertTrue(f["title"].startswith("Screen Recording"))
        self.assertEqual(f["src"], "pending")


class FirstScreenIsOneRequest(StudioCase):
    def test_app_page_carries_styles_script_and_boot_data(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request("GET", "/app")
        r = conn.getresponse()
        body = r.read().decode()
        conn.close()
        self.assertEqual(r.status, 200)
        self.assertNotIn('href="/app/studio.css"', body)
        self.assertNotIn('src="/app/studio.js"', body)
        self.assertIn("<style>", body)
        self.assertIn("window.__BOOT__=", body)
        raw = body.split("window.__BOOT__=", 1)[1].split(";</script>", 1)[0]
        boot = json.loads(raw.replace("<\\/", "</"))
        for key in ("refs", "recent", "recordings", "drive"):
            self.assertIn(key, boot)
        # the embed switch, the boot data and the page script: three, and the page script must not close its own tag
        self.assertEqual(body.count("</script>"), 3, "the script text must not close its own tag")
        self.assertIn('classList.add("embed")', body)

    def test_the_app_can_learn_where_captures_are_kept(self):
        st, state = self.call("GET", "/api/state")
        self.assertEqual(st, 200)
        self.assertTrue(state["captures_dir"].endswith("/state/captures"), state["captures_dir"])
        st, boot = self.call("GET", "/api/boot")
        self.assertEqual(boot["captures_dir"], state["captures_dir"])


class SlowDiskNeverBlocksTheFirstScreen(StudioCase):
    def test_boot_answers_at_once_from_the_last_snapshot_while_a_slow_rebuild_runs(self):
        st = self.studio
        gate = threading.Event()
        calls = []

        def build():
            calls.append(1)
            if len(calls) > 1:
                gate.wait(5)          # the second build is the slow disk
            return {"n": len(calls)}

        self.assertEqual(st.cached(("t-swr",), 0.0, build, swr=True), {"n": 1})
        t0 = time.time()
        for _ in range(20):           # a burst of page loads while the rebuild is stuck
            self.assertEqual(st.cached(("t-swr",), 0.0, build, swr=True), {"n": 1})
        self.assertLess(time.time() - t0, 0.5)
        time.sleep(0.1)
        self.assertEqual(len(calls), 2, "only one background rebuild may run at a time")
        gate.set()
        for _ in range(50):
            if st.cached(("t-swr",), 0.0, build, swr=True) == {"n": 2}:
                break
            time.sleep(0.05)
        self.assertEqual(st.cached(("t-swr",), 0.0, build, swr=True)["n"], 2)

    def test_concurrent_cold_requests_build_once(self):
        st = self.studio
        calls = []

        def build():
            calls.append(1)
            time.sleep(0.3)
            return "ok"

        threads = [threading.Thread(target=lambda: st.cached(("t-cold",), 5.0, build)) for _ in range(8)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
