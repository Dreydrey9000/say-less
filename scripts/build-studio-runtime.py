"""Freeze the Studio helper for the current Mac build; Python is build-only."""
import hashlib
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    if sys.platform != "darwin":
        return
    target = os.environ.get("STUDIO_TARGET_ARCH") or (
        "arm64" if platform.machine() == "arm64" else "x86_64")
    output = ROOT / "src-tauri/resources/studio-runtime"
    sources = sorted((ROOT / "bridge").glob("*.py")) + sorted((ROOT / "bridge/ui").glob("*"))
    identity = os.environ.get("APPLE_SIGNING_IDENTITY")
    digest = hashlib.sha256((target + "|" + (identity or "adhoc")).encode())
    for path in sources + [Path(__file__)]:
        digest.update(path.read_bytes())
    stamp = digest.hexdigest()
    marker = output / "source.json"
    if marker.exists() and (output / "say-less-studio").exists():
        if json.loads(marker.read_text()).get("sha256") == stamp:
            return
    work = ROOT / ".studio-build"
    args = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
            "--onefile", "--name", "say-less-studio", "--target-arch", target,
            "--distpath", str(output), "--workpath", str(work / "work"),
            "--specpath", str(work), "--paths", str(ROOT / "bridge"),
            "--hidden-import", "bridge", "--hidden-import", "studio",
            "--hidden-import", "titler", "--add-data", str(ROOT / "bridge/ui") + ":ui"]
    if identity:
        args += ["--codesign-identity", identity]
    args += [str(ROOT / "bridge/desktop.py")]
    subprocess.run(args, check=True)
    marker.write_text(json.dumps({"sha256": stamp, "architecture": target}))


if __name__ == "__main__":
    main()
