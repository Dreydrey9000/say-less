import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from desktop import prepare_home


class ImportTests(unittest.TestCase):
    def test_import_is_once_and_never_overwrites_or_deletes_old_files(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            old, new = root / "old", root / "new"
            (old / "state").mkdir(parents=True)
            (old / "state/images.json").write_text('[{"name":"kept"}]')
            (old / "config.json").write_text('{"watch_enabled":true,"b2_bucket":"existing"}')
            prepare_home(new, old)
            self.assertEqual(json.loads((new / "state/images.json").read_text())[0]["name"], "kept")
            self.assertFalse(json.loads((new / "config.json").read_text())["watch_enabled"])
            (new / "state/images.json").write_text("[]")
            prepare_home(new, old)
            self.assertEqual((new / "state/images.json").read_text(), "[]")
            self.assertTrue((old / "state/images.json").is_file())


class RuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        cls.home = root / "runtime"
        token = "ab" * 32
        command = [os.environ["STUDIO_EXECUTABLE"]] if os.environ.get("STUDIO_EXECUTABLE") else [sys.executable, str(Path(__file__).resolve().parents[1] / "desktop.py")]
        env = {**os.environ, "SAYLESS_MEDIA_HOME": str(root / "media")}
        (root / "media").mkdir()
        cls.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.PIPE, text=True, start_new_session=True, env=env)
        cls.process.stdin.write(json.dumps({"home": str(cls.home), "legacy": str(root / "absent"),
                                           "token": token, "version": "0.14.11"}) + "\n")
        cls.process.stdin.close()
        port_file = cls.home / "state/port.txt"
        deadline = time.time() + 45
        while not port_file.exists():
            if cls.process.poll() is not None:
                raise RuntimeError(cls.process.stderr.read())
            if time.time() > deadline:
                os.killpg(cls.process.pid, signal.SIGTERM)
                cls.process.wait(timeout=10)
                cls.process.stderr.close()
                cls.temp.cleanup()
                raise RuntimeError("Studio did not start")
            time.sleep(0.1)
        cls.origin = "http://127.0.0.1:" + port_file.read_text()
        cls.base = cls.origin + "/s/" + token

    @classmethod
    def tearDownClass(cls):
        os.killpg(cls.process.pid, signal.SIGTERM)
        cls.process.wait(timeout=10)
        cls.process.stderr.close()
        cls.temp.cleanup()

    def request(self, path, body=None, headers=None, base=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request((base or self.base) + path, data=data,
                                     headers={"Content-Type": "application/json", **(headers or {})})
        return urllib.request.urlopen(req, timeout=4)

    def test_private_session_and_all_five_views_are_bundled(self):
        with self.request("/app") as reply:
            html = reply.read().decode()
        self.assertIn("window.__STUDIO_BASE__", html)
        for name in ("Create", "Titles", "Videos", "Screens", "Library"):
            self.assertIn(name, html)
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request("/app", base=self.origin)
        self.assertEqual(error.exception.code, 403)
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request("/app", headers={"Origin": "https://other.example"})
        self.assertEqual(error.exception.code, 403)

    def test_update_pauses_new_jobs_and_resume_restores_requests(self):
        with self.request("/desktop-prepare-update", {}) as reply:
            self.assertFalse(json.load(reply)["busy"])
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request("/api/refs-new", {"name": "paused"})
        self.assertEqual(error.exception.code, 409)
        with self.request("/desktop-resume", {}) as reply:
            self.assertTrue(json.load(reply)["ok"])
        with self.request("/api/refs-new", {"name": "resumed"}) as reply:
            self.assertTrue(json.load(reply)["ok"])

    def test_connections_default_to_local_and_reject_outside_credentials(self):
        with self.request("/desktop-connections") as reply:
            self.assertFalse(json.load(reply)["watch_enabled"])
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request("/desktop-connections", {"b2_secrets_file": "/tmp/outside.env"})
        self.assertEqual(error.exception.code, 400)
        with self.request("/desktop-status") as reply:
            self.assertEqual(json.load(reply)["version"], "0.14.11")

    def test_screens_respond_without_scanning_the_desktop(self):
        started = time.monotonic()
        with self.request("/api/screens") as reply:
            self.assertEqual(json.load(reply)["screens"], [])
        self.assertLess(time.monotonic() - started, 2)


if __name__ == "__main__":
    unittest.main()
