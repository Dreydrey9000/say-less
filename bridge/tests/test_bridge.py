"""Tests for the Say Less bridge. Run from the repo root:

    python3 -m unittest discover -s bridge/tests -v

Nothing here touches the network, B2, Google Drive or your real state folder.
"""
import http.client
import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

HOME_TMP = tempfile.mkdtemp(prefix="sayless-bridge-test-")
os.environ["SAYLESS_BRIDGE_HOME"] = HOME_TMP
os.environ["SAYLESS_VE_DB"] = str(Path(HOME_TMP) / "ve-social.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bridge  # noqa: E402  (must import after the env vars above)


class PathGuard(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="sl-root-"))
        self.outside = Path(tempfile.mkdtemp(prefix="sl-out-"))

    def test_accepts_video_inside_root(self):
        f = self.root / "a.mp4"
        f.write_bytes(b"x")
        self.assertEqual(bridge.safe_path(f, bridge.VIDEO_SUFFIXES, [self.root]), f.resolve())

    def test_rejects_wrong_suffix(self):
        f = self.root / "id_rsa"
        f.write_bytes(b"secret")
        self.assertIsNone(bridge.safe_path(f, bridge.VIDEO_SUFFIXES, [self.root]))

    def test_rejects_outside_root(self):
        f = self.outside / "a.mp4"
        f.write_bytes(b"x")
        self.assertIsNone(bridge.safe_path(f, bridge.VIDEO_SUFFIXES, [self.root]))

    def test_rejects_symlink_escape(self):
        target = self.outside / "real.mp4"
        target.write_bytes(b"x")
        link = self.root / "link.mp4"
        link.symlink_to(target)
        self.assertIsNone(bridge.safe_path(link, bridge.VIDEO_SUFFIXES, [self.root]))

    def test_rejects_missing_file(self):
        self.assertIsNone(bridge.safe_path(self.root / "nope.mp4", bridge.VIDEO_SUFFIXES, [self.root]))


class SingletonLock(unittest.TestCase):
    def test_second_instance_cannot_start(self):
        first = bridge.acquire_singleton_lock()
        self.assertIsNotNone(first)
        # flock is per open file description, so a second open in the same
        # process behaves like a second bridge process.
        second = bridge.acquire_singleton_lock()
        self.assertIsNone(second)
        first.close()
        third = bridge.acquire_singleton_lock()
        self.assertIsNotNone(third)
        third.close()


class Backoff(unittest.TestCase):
    def test_schedule(self):
        self.assertEqual([bridge.backoff_seconds(n) for n in (1, 2, 3, 4)], [30, 60, 120, 240])

    def test_cap(self):
        self.assertEqual(bridge.backoff_seconds(50), 3600)


class TitleParsing(unittest.TestCase):
    def test_parses_json_array_inside_prose(self):
        text = 'Sure! [{"style": "Question", "text": "Why Do Cuts Fail"}] hope it helps'
        self.assertEqual(bridge.parse_titles(text),
                         [{"style": "Question", "text": "Why Do Cuts Fail"}])

    def test_garbage_gives_empty(self):
        self.assertEqual(bridge.parse_titles("no json here"), [])
        self.assertEqual(bridge.parse_titles("[not json]"), [])


class OwnWorkHooks(unittest.TestCase):
    """Own work comes from client_roster.relationship, not posts.is_competitor."""

    def setUp(self):
        con = sqlite3.connect(bridge.VE_DB)
        con.executescript("""
            DROP TABLE IF EXISTS posts; DROP TABLE IF EXISTS client_roster;
            CREATE TABLE client_roster (slug TEXT, relationship TEXT);
            CREATE TABLE posts (client TEXT, is_competitor TEXT, views TEXT, verbatim_hook TEXT);
            INSERT INTO client_roster VALUES ('ryan-magin','current_client'),
              ('old-client','past_client'),('rival','studied');
            -- is_competitor is deliberately wrong in both directions here
            INSERT INTO posts VALUES ('ryan-magin','1','90000','current hook flagged competitor');
            INSERT INTO posts VALUES ('old-client','1','50000','past client hook');
            INSERT INTO posts VALUES ('rival','0','999999','studied creator hook flagged own');
            INSERT INTO posts VALUES ('ryan-magin','0','100','too few views');
        """)
        con.commit()
        con.close()

    def test_current_client_included_even_if_flagged_competitor(self):
        self.assertEqual(bridge.ve_hooks("ryan-magin"), ["current hook flagged competitor"])

    def test_past_client_is_still_our_work(self):
        self.assertEqual(bridge.ve_hooks("old-client"), ["past client hook"])

    def test_studied_creator_excluded_even_if_flagged_own(self):
        self.assertEqual(bridge.ve_hooks("rival"), [])


class LinkRefresh(unittest.TestCase):
    def setUp(self):
        bridge.REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)

    def _write(self, uploaded_days_ago, url="old"):
        t = datetime.now(timezone.utc) - timedelta(days=uploaded_days_ago)
        bridge.REGISTRY_PATH.write_text(json.dumps([{
            "file": "/x/a.mp4", "name": "a.mp4", "url": url,
            "uploaded_at": t.isoformat(timespec="seconds"),
            "b2": {"key": "say-less-recordings/a.mp4"},
        }]))

    def test_fresh_link_is_left_alone(self):
        self._write(1)
        with mock.patch.object(bridge, "b2_presign", return_value="new") as m:
            self.assertEqual(bridge.refresh_expiring_urls(), 0)
            m.assert_not_called()
        self.assertEqual(json.loads(bridge.REGISTRY_PATH.read_text())[0]["url"], "old")

    def test_link_in_its_last_day_is_resigned(self):
        self._write(6.5)
        with mock.patch.object(bridge, "b2_presign", return_value="new"):
            self.assertEqual(bridge.refresh_expiring_urls(), 1)
        entry = json.loads(bridge.REGISTRY_PATH.read_text())[0]
        self.assertEqual(entry["url"], "new")
        self.assertIn("url_refreshed_at", entry)

    def test_presign_failure_keeps_old_link(self):
        self._write(6.5)
        with mock.patch.object(bridge, "b2_presign", side_effect=RuntimeError("b2 down")):
            self.assertEqual(bridge.refresh_expiring_urls(), 0)
        self.assertEqual(json.loads(bridge.REGISTRY_PATH.read_text())[0]["url"], "old")


class DriveLogin(unittest.TestCase):
    def setUp(self):
        bridge.DRIVE.update(ok=None, error=None, paused_until=0.0)

    def _fake_run(self, stderr, code=1):
        return mock.Mock(returncode=code, stderr=stderr, stdout="")

    def test_expired_login_is_named_and_pauses_drive(self):
        with mock.patch.object(bridge.subprocess, "run",
                               return_value=self._fake_run("invalid_grant: maybe token expired?")) as run:
            with self.assertRaises(RuntimeError) as ctx:
                bridge.drive_upload("/x/a.png", "a.png")
            self.assertIn("rclone config reconnect", str(ctx.exception))
            self.assertFalse(bridge.DRIVE["ok"])
            calls = run.call_count
            with self.assertRaises(RuntimeError):
                bridge.drive_upload("/x/a.png", "a.png")
            self.assertEqual(run.call_count, calls)   # paused: no second rclone call

    def test_other_errors_do_not_pause(self):
        with mock.patch.object(bridge.subprocess, "run",
                               return_value=self._fake_run("network unreachable")):
            with self.assertRaises(RuntimeError):
                bridge.drive_upload("/x/a.png", "a.png")
        self.assertEqual(bridge.DRIVE["paused_until"], 0.0)


class HttpHardening(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), bridge.Handler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def _post(self, path, body, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Content-Type": "application/json"}
        h.update(headers or {})
        conn.request("POST", path, body=body, headers=h)
        r = conn.getresponse()
        data = r.read()
        conn.close()
        return r.status, data

    def test_health_works_and_reports_pid(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", "/health")
        r = conn.getresponse()
        body = json.loads(r.read())
        self.assertEqual(r.status, 200)
        self.assertEqual(body["pid"], os.getpid())

    def test_foreign_host_header_is_refused(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", "/health", headers={"Host": "evil.example.com"})
        self.assertEqual(conn.getresponse().status, 403)

    def test_browser_style_post_with_origin_is_refused(self):
        status, _ = self._post("/upload", '{"path": "/x"}', {"Origin": "https://evil.example.com"})
        self.assertEqual(status, 403)

    def test_text_plain_post_is_refused(self):
        status, _ = self._post("/upload", '{"path": "/x"}', {"Content-Type": "text/plain"})
        self.assertEqual(status, 415)

    def test_upload_outside_movies_is_refused(self):
        status, _ = self._post("/upload", json.dumps({"path": "/etc/hosts"}))
        self.assertEqual(status, 403)

    def test_image_register_rejects_non_image(self):
        status, _ = self._post("/image-register", json.dumps({"path": "/etc/hosts"}))
        self.assertEqual(status, 403)

    def test_ideas_rejects_arbitrary_file(self):
        status, _ = self._post("/ideas", json.dumps({"image_path": "/etc/hosts"}))
        self.assertEqual(status, 403)

    def test_missing_path_is_400(self):
        status, _ = self._post("/upload", "{}")
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
