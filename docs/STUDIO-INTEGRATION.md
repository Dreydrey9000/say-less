# Studio inside Say Less

Studio is a section in the existing Say Less window on Mac: Create, Titles,
Videos, Screens, and Library. The app starts its own private helper when Studio
is opened. It includes Python and the Studio page; customers do not install
Python, a LaunchAgent, or four launcher apps. Closing and reopening the section
keeps background jobs alive. Quitting the app stops its private helper.

[Editable workflow diagram](diagrams/studio-integrated.mmd)

## Data and connections

The runtime stores settings and indexes in the app's data directory under
`creative-studio`. On first use it copies existing bridge indexes and settings
from the legacy runtime, without deleting or replacing the originals. Media
stays in its existing folders. An earlier standalone bridge remains independent;
do not enable two upload watchers for the same recording folder.

Open **Studio → Studio connections** to review installed tools and set the B2
bucket, local credentials file, automatic uploads, and optional Drive mirror.
Uploads start disabled. Local recording playback and libraries need no cloud
account. Generation still requires Subpowers and its signed-in painter tools;
Titles and Screens use the existing configured vision chain. B2 and Drive still
require their existing tools/accounts. This integration does not provision those
accounts, bundle those third-party CLIs, or claim every computer is connected.

The private runtime requires a random launch token for every page, media, and
API request. External origins are refused; the embedded page gets no Tauri
permissions. Native screenshot/copy/reveal requests are validated against the
frame's origin and identity. Screenshots require the user's macOS permission.
The updater waits for Studio jobs/uploads and blocks new Studio jobs during
installation. Failed installation resumes Studio requests.

Screens opens from its managed captures/uploads, without automatically walking
Desktop folders. Use **Add screenshots** or **Gather Desktop screenshots**;
gathering copies files and leaves the originals in place. Automatic AI media
descriptions are a separate opt-in under Studio connections.

## Building and testing

Build-only dependency: PyInstaller 6.22.3. In a Python virtual environment:

```sh
python -m pip install PyInstaller==6.22.3
python scripts/build-studio-runtime.py
bun run tauri build
```

The release workflow builds the helper for the selected Mac architecture and
passes the Developer ID identity to PyInstaller before Tauri signs/notarizes
the enclosing app. A Mac build fails if its helper was not staged. CI tests the
frozen helper with temporary data, without a system Python runtime dependency.

```sh
python -m unittest discover -s bridge/tests
STUDIO_EXECUTABLE="$PWD/src-tauri/resources/studio-runtime/say-less-studio" \
  python -m unittest discover -s bridge/tests -p test_desktop.py
bun run test:playwright -- tests/creative-studio.spec.ts tests/automatic-updates.spec.ts
```

Windows/Linux display an explicit availability message; the initial integrated
Studio runtime targets Mac because Luis's capture, clipboard, painter and
cloud tooling is Mac-specific. Native Windows/Linux parity is not implemented.
The signed release includes the helper's Python and dependency license notices.
First launch can take longer while macOS verifies and extracts the helper;
subsequent Studio view changes reuse the same running process. Signed installer
and installed-app verification are required for each release.
