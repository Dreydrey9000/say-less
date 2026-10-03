"""Private Studio runtime owned by the signed Say Less desktop app.

The frozen executable includes Python, the bridge, Studio and its UI. Nothing
is installed into Desktop, and no system Python or LaunchAgent is needed.
"""
import json
import os
import shutil
import sys
from pathlib import Path


def prepare_home(target, legacy):
    """Import existing settings/indexes once, without changing the old service."""
    target = Path(target)
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    marker = target / "imported.json"
    if marker.exists():
        return
    legacy = Path(legacy)
    for name in ("recordings.json", "images.json", "titles.json", "title-history.json",
                 "media-meta.json"):
        source, dest = legacy / "state" / name, target / "state" / name
        if source.is_file() and not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            shutil.copy2(source, dest)
    config = target / "config.json"
    if not config.exists():
        old = legacy / "config.json"
        settings = json.loads(old.read_text()) if old.is_file() else {}
        # Uploading requires an explicit choice in the integrated app. This
        # also avoids double uploads while an older LaunchAgent still runs.
        settings.update(watch_enabled=False, auto_titles_enabled=False, ideas_port=0)
        if not old.is_file():
            settings.update(drive_enabled=False, b2_bucket="")
        config.write_text(json.dumps(settings, indent=2))
        config.chmod(0o600)
    marker.write_text(json.dumps({"source_found": legacy.is_dir()}))


def main():
    options = json.loads(sys.stdin.readline())
    token = options["token"]
    if len(token) != 64 or any(c not in "0123456789abcdef" for c in token):
        raise ValueError("Invalid desktop session")
    prepare_home(options["home"], options["legacy"])
    os.environ["SAYLESS_BRIDGE_HOME"] = options["home"]
    import bridge
    bridge.DESKTOP_TOKEN = token
    bridge.DESKTOP_VERSION = options["version"]
    bridge.main()


if __name__ == "__main__":
    main()
