# Changelog

## [0.14.13] - 2026-10-03

### Added

- Voice action type **Create (in Say Less)**: say "Say Less, make an image" (or title ideas, my recordings, read my screens, library) and the Studio opens on that page, no separate mini app needed.
- The floating dock shows your first four voice actions as one-click buttons on the large dock, and on the small dock's rail when you hover it (it showed three, and none on the small dock). Recordings uses a film icon.
- `scripts/setup-local-signing.sh` and `scripts/undo-local-signing.sh`: local test builds sign with a stable self-signed identity in their own keychain, so macOS keeps the Accessibility grant across rebuilds (`bun run build:local`).

### Changed

- Studio: the first tab is named Images (the page and its first tab were both called Create). Inside the Say Less window the Studio hides its own logo and the two status dots, and the "browsing settings" notice no longer sits on top of the Studio page.
- A returning user who has the microphone but is missing only Accessibility lands in the existing browse mode instead of the full-screen setup. Shortcuts stay off until Accessibility is granted.

## [0.14.12] - 2026-10-03

- Mac: Studio opens inside the existing Say Less window with Create, Titles, Videos, Screens, and Library. Python and the Studio UI are bundled with the app and update together.
- Existing companion settings and library indexes are imported once without removing the originals. Studio connections control optional B2 uploads and Drive mirroring.
- Restart-to-update waits for Studio generation, screenshot capture, metadata jobs, and uploads. New work pauses during installation; failed installs resume it.
- Windows/Linux explain that integrated Studio currently requires Mac. Painter, vision, and storage connections still require their existing tools/accounts.

## [0.14.11] - 2026-10-03

### Changed

- Dock look is a horizontal gallery of the actual dock previews. Scroll sideways and choose a card; arrow keys also work and your choice is remembered.

### Fixed

- Creating the floating dock on Mac no longer temporarily changes the whole application's activation policy. The hidden, non-focusable panel cannot become the main window.

## [0.14.10] - 2026-10-03

### Added

- Choose Circle or Square for your webcam overlay in Recording setup. The preview matches your saved choice, and changes apply to the next recording.

## [0.14.9] - 2026-10-03

### Added

- Signed updates download automatically in the background. Choose **Restart to update** when ready; active dictation or screen recording blocks that restart. Automatic updates can be turned off, and portable installs keep their manual installer flow.
- Say Less Studio in the bridge (`/app`): Create (prompt box with @shelves, references, painter picker), Titles (click a title to copy), Videos, Screens and Library, in one fast page that paints from its last snapshot. Four native launcher apps open one view each (`bridge/launcher`).
- Reference shelves shared with `subpowers --refs`, drag and drop anywhere, kept on this Mac.
- `bridge/install.sh`, `bridge/tests/`, `scripts/local-build.sh` (`bun run build:local`), `scripts/one-copy.sh`, `scripts/fix-permissions.sh`, `scripts/clear-dock-ghosts.sh`, `docs/LOCAL-BUILDS.md`.

### Fixed

- Bridge: the LaunchAgent ran as `ProcessType: Background`, which gave the bridge and every image painter it starts the lowest CPU and IO priority. The same Compare all took 348 s through the Studio and 77 s from a terminal; as `Interactive` it takes 66 s. Run `bridge/install.sh` again to pick it up.
- Bridge: only one copy can run (a lock file); a second launch exits quietly instead of moving to another port. LaunchAgent restarts it only after a crash.
- Bridge: failed uploads back off (30 s up to 1 h) instead of retrying every 10 seconds; a local recording is deleted only when B2 reports the exact same size.
- Bridge: B2 links are re-signed in their last day, so the Recordings app never shows an expired link.
- Bridge: an expired Google Drive login is named in the log and in `/health` with the fix command, and Drive is skipped for an hour instead of failing every upload.
- Bridge: title ideas read hooks by `client_roster.relationship`, not `is_competitor` (past clients are still our work).
- Bridge: a web page can no longer make the bridge upload or read files (Origin and content-type checks, folder allow-list).
- Home usage statistics show readable labels, durations, and the typing-speed estimate instead of missing translation keys. These new strings use English fallback text in all interface languages.

## [0.14.8] - 2026-10-02

### Added

- The small dock now grows into a status island for listening, processing, screen recording, a confirmed saved video, and errors. It returns to its small companion when idle. The drag, hide, and stop controls remain available; motion follows the app's animation preference and Reduce Motion.
- On Mac, dragging the dock near a screen edge snaps it to the nearest side or corner after release. Appearance also lets you choose any of the eight anchors.

### Changed

- Small-dock actions now share one attached rectangular rail, revealed on hover or keyboard focus. Stop and Show in Finder join the active status island. The rail opens inward at right-side anchors, and the emblem stays in place when controls appear.

### Fixed

- The small floating dock can be dragged directly by its emblem and has a hide button. Showing or resizing the dock keeps it inside the current screen, and a quick off/on uses the latest saved visibility setting.
- Dock and app startup load English first and fetch another interface language only when selected, instead of parsing every translation at launch.

## [2026-09-29]

### Release

- Version 0.14.6: a real update button, the Bot's listening bars, no stuck label on the recording pop-up, and two from Luis: dock buttons for your voice actions, and a fix that waits for long screen recordings to finish saving.

### Added

- Dock: your first 3 voice actions show as one-click buttons next to the screen button, so you can run them without speaking (Luis). Hidden when voice actions are off. The dock asks the app to run the saved action by its cue, so it can only open apps and sites you set up.

## [2026-09-28]

### Changed

- Bot listening: the eyes become resting voice bars (short, tall, short) with a slow ripple as soon as listening starts, because a quiet mic used to look exactly like idle. The ripple stops when you talk and is off with Reduce Motion.
- Bot happy ^^ eyes are thicker so they still show at 20px.
- The footer update control is a real button: a bordered pill with an icon, and a filled lime Update now when a version is waiting. It was 12px gray text that nobody recognized as clickable. The update toast's Later and Update now are real buttons too, and toasts sit above the footer instead of covering it.

### Fixed

- The happy ^^ face and cheeks no longer get stuck on after dictating with Reduce Motion on. The class was only cleared when the animation ended, and with no animation that never happened.
- The recording pop-up showed a stuck "Cancel recording" label over the voice bars or line. The pop-up window never takes focus, so macOS stops telling it where the mouse is, and the hover label stayed on after the pointer left. The x has no hover label now; screen readers still hear "Cancel recording".

## [2026-09-27]

### Release

- Version 0.14.5: the wave line moves with your voice.

### Fixed

- The Wave pattern barely reacted to your voice. Its lines keep one shape and only stretched up to 28% taller, about 5% for normal speech. It now stretches up to 2.8x, around 1.5x for normal speech, and the lines keep their thickness.
- The Appearance previews now move during a screen recording too, not only while dictating.

## [2026-09-27]

### Release

- Version 0.14.4: the orb and dock move with your voice during a screen recording too.

### Added

- While a screen recording runs with the mic on, the Home orb and the floating dock companion follow your voice. ScreenCaptureKit's mic stream feeds a small level meter that the app reads about 15 times a second, so recording never waits on the UI. The visuals settle back down within half a second after the recording stops.

## [2026-09-27]

### Release

- Version 0.14.3: the voice visuals on Home and the dock move with your voice, and the Record shortcut can be changed from the Home card.

### Fixed

- The Home orb, the floating dock companion, the talking avatar and the Appearance preview now react to your voice while you dictate. Voice levels were only sent to the recording bubble, so every other visual played a canned loop. The main window and the dock now get the levels about 15 times a second, only while they are on screen, from a separate task so the audio thread never waits on the UI.
- Voice level changes are eased so the orb and avatar move smoothly between updates.

### Added

- A Record shortcut row on the recording card shows Control + Option + R and lets you change or reset it without opening Settings.

## [2026-09-27]

### Release

- Version 0.14.2: a Control+Option+R shortcut starts and stops a screen recording from any app, because recording a presentation shouldn't need a trip back to the Say Less window.

### Added

- Record screen shortcut (Control+Option+R on Mac, changeable in Shortcuts & mic). Each press starts or stops a recording through the same path as the voice command, and a permission or camera problem brings Home forward to explain it. The recording card's hints name the shortcut. Existing installs get it automatically because missing default shortcuts are merged in on load.
- The 0.14.2 What's New note repeats the recording intro, because a fresh install only shows the newest note, and adds the shortcut to its list.

## [2026-09-27]

### Release

- Version 0.14.1: a first-run clarity pass on screen recording, because a new user could not easily find or understand it. The What's New note for 0.14.1 repeats the full screen recording intro, because a fresh install only shows the newest note.

### Changed

- The dock's dictation button says Talk instead of Record, and the screen button has a visible Screen label, because "Record" meant two different things on the same screen. While recording, the red pill says Stop and the caption says the screen is recording.
- The 0.14.1 What's New note opens with a picture of the recording card's buttons, three short steps and the permission line, all in the first view at the smallest window, because the old note was a wall of text. Mac-only and Windows-only parts are picked before the note shows in What's New and About, so Windows users no longer read Mac steps.
- Every switch fills with the accent color when on, because on and off looked almost the same.
- Tooltips hide after the click that used their control, and Escape hides a tooltip that is only hovered, because the tip covered what the click had just opened. Keyboard focus brings a hidden tip back, so keyboard users still see the name.
- On a Mac older than macOS 15 the recording card explains how to check the version and update, instead of a short grey reason with no next step.
- The site says screen recording needs macOS 15 or newer and explains how to tell an Apple Silicon Mac from an Intel one before picking a download.

### Fixed

- Home has a "Record your screen" link next to Share (Mac only) that scrolls to the recording card, because at the default 680x570 window the card starts below the fold.
- The Record your screen link on Home is now a real button, first in the row, because a small underlined link was easy to miss. While a recording runs it shows a red dot and the time and takes you to Stop, so a running recording is never hidden below the fold.
- The sidebar list scrolls on its own, with a fade while more items sit below, because at the 680x570 window About was cut off and tabbing to it moved the whole window.
- The recording card stacks its text above its buttons at the same 580px content-width breakpoint as the rest of Home, because the old 640px window breakpoint never fired on a window that can't be narrower than 680px, leaving the text in a thin column.
- What's New has "Got it" and "Try screen recording", which closes the dialog and brings Home forward with the recording card in view, because a first-time user had no button to reach the feature the note describes. The second button shows only on the 0.14 notes and only when this computer can record (macOS 15 or newer), so it never leads to a faded Record button or sits under an unrelated note.
- The main window listens for "open-recording-home" and shows Home with the recording card in view, so the dock and recording problems can send people straight to it. The name is shared as OPEN_RECORDING_HOME_EVENT in src/lib/recordingOptions.ts, so a typo on either side can't make it fail silently.
- The 0.14.0 note says up front that screen recording needs macOS 15 or newer, and explains how to turn on the floating dock it mentions, because both were missing or buried at the end. It also names the save folder in words instead of an arrow, to match the rest of the note.
- The recording card's permission buttons ask macOS first when access was never requested, so Say Less appears in the System Settings list, and the screen, camera and microphone buttons open the matching privacy page instead of doing nothing after one "Don't Allow".
- A Reopen Say Less button sits next to Open System Settings in the permission notice, because macOS only applies Screen Recording access after a restart and closing the window only hides the app.
- When the window comes forward for a recording problem (from the dock, the menu bar or the voice command), it opens on Home where the explanation is, instead of whichever page was last open.
- No camera found (lid closed, no webcam) shows its own message with a fix, instead of the generic camera error.
- The card says when your face is off and where to turn it on, names the save folder in the Saved line, and keeps an Open recordings folder button, because there was no lasting way to find videos.
- In "one window" mode the setup panel explains that the window and the face circle should stay put, because the video does not follow a moved window.
- Saying "Say less, start recording" on a Mac that cannot record opens the explanation on Home instead of a misleading permissions error.
- The app checks for updates every few hours while open and shows an Update now toast, because a copy left open never learned about 0.14.0. A failed update now says so and links to the download.
- Double-clicking Stop, on Home or the dock, saves once and no longer starts a new recording, because the second click landed on the Record button that replaced Stop. Record ignores clicks for about 0.7 seconds after a stop.
- Pressing Enter on Record screen keeps keyboard focus on the button and announces "Recording started" and "Recording saved", because focus fell to the page and nothing said the recording began.
- With Show your face on and the camera blocked, the card says so and offers the fix, because the switch looked on while the recording could not start with the camera.
- The face hint has a Show my face button that opens Setup right on the Show your face switch, and Setup now lists the camera before sound, because the switch sat below the fold at the default window.
- The Record button stays in place when it turns into Stop, the permission notice sits above the buttons, Open recordings folder has its own row, and while recording the card says how to stop.
- On an older Mac or Windows the Record button looks clearly unavailable and the reason uses the same notice style as a permission problem. Windows no longer shows a Setup panel for a feature it does not have yet.
- Reopen Say Less says "Reopening" and ignores a second click, and says what to do if it fails.
- In light mode the lime Record button has a darker edge so it does not melt into the white card.
- The dock's Talk button keeps a tooltip while a recording runs, the Stop glyph is a filled square, the camera button is named "Recording setup: camera and sound", and its tooltip no longer covers Show in Finder after you stop.
- Clicking a setting's title in Recording setup toggles its switch, and the sound switches read "Record your voice" and "Which microphone".
- The Saved line, Show in Finder and every start problem (permission, blocked camera, missing camera, closed window) now show right under the Record button, above the Setup panel, and focus moves to the fix, because with Setup open they appeared far below the fold and a failed start looked like nothing happened.
- Say Less asks macOS for the real camera permission status, so a camera you refused earlier shows the blocked warning right away, and the warning stays visible while Setup is open.
- Show my face turns the camera on through the same steps as the Setup switch, then opens Setup at the corner and size controls. With your face on, the card says which corner it will appear in, instead of leaving a blank space.
- The Recording button at the top of Home takes you straight to Stop while a recording runs, and the Record your screen button hides when the card is already on screen.
- On an older Mac the notice has an Open Software Update button, with the right pane for older and newer macOS. On Windows the card is one plain line with no dead button.
- The dock keeps Saved and Show in Finder until the next recording or dictation (or until you close it), shows a lime ring on the camera button when your face is on, turns Talk secondary while the screen records so Stop leads, uses the same red for Stop as Home, and cannot be hidden in the middle of a recording.
- What's New moves focus to Got it when it opens, shows the picture as a framed screenshot with a caption so it does not look like a button, and gives Windows its own picture of the Talk button.
- With the camera blocked, the warning now says recording won't start with Show your face on, and the notice under Record has a Record without my face button that turns the face off and starts, because the old wording made it sound like the recording would go ahead without the face.
- The Saved line starts with a check mark, the file name gets its own line that never breaks inside the date, and Open recordings folder steps aside while Show in Finder is showing, so there is one clear path to the new video.
- The What's New picture is muted so the dialog's real buttons stay the loudest thing, and step 2 points at the one-click Show my face button.

## [2026-09-26]

### Release

- Version 0.14.0: screen recording with setup (window or screen, mic, computer sound, webcam bubble, quality), the painted avatar pack, the bot avatar, Home usage stats, and voice commands on selected text ship together.

### Added

- Voice commands on selected text: select text in any app, hold the new "Rewrite selected text" shortcut (Ctrl+Option+Space on Mac, Ctrl+Alt+Space elsewhere) and say what to do with it, like "make this shorter". A small preview shows the rewrite first: Enter replaces the selection, Esc keeps the original. The rewrite runs through the AI provider you already set up for cleanup (your own key, Apple Intelligence or Ollama), sending the text and never audio.
- The shortcut sits under the AI cleanup shortcut on the AI cleanup page and is listed under "Other recording shortcuts" on Home. Each command is saved to History with the instruction and the result.
- Home shows your numbers once you have dictated at least once: words dictated, time saved and a day streak, all computed from the history stored on this computer. Time saved is labelled as an estimate (your words divided by 40 words a minute, a typical typing speed) because we do not measure your typing, and a wrong number would cost trust.
- The streak counts days in a row with at least one dictation and does not break while today is still in progress; the Rust streak math has its own tests.
- Painted avatar pack: 16 characters (people, animals, a robot, an alien, two silver-chrome characters) in a "Pick a character" gallery beside "Make your own", because the flat SVG faces read as clip-art next to the chrome brand.
- The paintings ship as static WebP files in public/avatars (256px and 128px, 144 KB in total), painted once for this project with the subpowers image skill, so the app stays offline and needs no image subscription; prompts and provenance live in docs/avatars.
- Painted avatars keep talking: each painting has bead eyes and no mouth, and the live SVG mouth and blinking lids draw on top at per-character anchors (src/lib/avatarPresets.ts), because a painted open/closed crossfade gave only two mouth states and was unreadable at 40px.
- scripts/build-avatar-pack.sh rebuilds the pack from the 512px masters with cwebp, so nobody has to repaint to change sizes.
- Recording setup on Mac, opened from the Setup button next to Record on Home or the new setup button on the dock: record the whole screen (pick the display) or one window, turn the microphone on or off and pick which mic, turn computer sound on or off, and pick 720p, 1080p or full size at 30 or 60 fps, because people asked to customize what goes into the video.
- Webcam bubble: a round, draggable camera window in the corner and size you pick (small, medium, large), burned into the video by the same ScreenCaptureKit recording, so your face is in the file with no editing step. The recording still leaves out every other Say Less window.
- Live camera thumbnail in the setup panel, so you see what the bubble will show before you record.
- Camera permission: NSCameraUsageDescription, the camera entitlement, a request only when you turn the webcam on, and a plain message with Open System Settings if it's off.
- Recording options saved in their own recording.json with safe defaults (whole screen, mic and computer sound, 1080p30 for 8GB laptops); a broken or old value falls back to its default without resetting the rest.
- swift/record_check.swift, a hand-run check of the real recorder with the webcam bubble (cargo test can't host a window).

### Changed

- AvatarSettings has a `preset` field; old saves load unchanged, and an unknown preset falls back to the custom avatar on load and save instead of failing.
- Painted avatars take a ring color in place of the SVG colors and hats; the 40px pill loads the 128px image and the dock and preview load 256px.
- Start only asks for the permissions the saved setup uses: no microphone permission needed with the mic off, no camera permission with the webcam off.
- The one-click Record button, the tray item and "Say less, start recording" all use the saved setup.
- Windows and Linux show the same setup, disabled, with the same plain reason as the Record button.

## [2026-09-25]

### Added

- Screen recording on Mac (macOS 15+): a Home card, a dock button, a tray item and the spoken cues "say less start recording" / "say less stop recording" save one MP4 (screen, microphone and system audio) to Movies/Say Less, because it is the feature Wispr Flow does not have.
- Swift ScreenCaptureKit bridge (swift/screen_recorder.swift, SCRecordingOutput) built by build.rs like the Apple Intelligence bridge, with a stub for older SDKs, so no new crates were needed.
- "Control recording with your voice" switch in Voice actions (on by default); "start recording" and "stop recording" are reserved so a custom action can't take them.
- Release note 0.14.0 and the screen recording diagram (docs/diagrams/screen-recording.mmd and .svg).

### Changed

- The expanded floating dock is 400px wide (was 360px) to fit the screen record button.

## [2026-09-25]

### Release

- Version 0.13.1: the voice visuals, clarity, accessibility and final polish passes ship together.

### Fixed

- A single letter or space can no longer be saved as a global shortcut, because it would fire every time you typed it.
- The focus ring on light primary buttons (Apply color, Start using Say Less) is visible in dark mode again.

### Changed

- Removed the last em-dashes from the English app text (inherited from Handy), so every string follows our no-em-dash copy rule.

### Changed

- Recording pill is 264x56 with a real layout (dot 10, label, a flexible voice-visual slot, cancel 32); the squiggle, bars or avatar center in that slot, which clips and fades its ends over 8px, because the squiggle was centered on the whole pill and drew about 7px over "Listening".
- Overlay avatar is 40px in the 56px pill (8px clearance above and below) instead of 44px in 48px (about 1px), the same height for all three voice visuals.
- The pill sits 18px (--ov-lift) above the window's screen-edge side with a soft outer shadow; the native window grew to 300x84 (Live 420x160) and its offsets shrank by the same 18px so the pill lands where it did, and the Rust geometry test now includes the lift.
- The overlay dot is red (#ff5a5a) while Listening and silver while starting, because a silver dot did not read as "recording".
- Compact dock status dot is an 8px light inside the disc rim (silver idle or working, red recording, amber error) instead of a 12px gray disc on the edge that looked like a stray button; the expanded dock's chevron is labeled "Shrink to small dock" (tooltip and aria-label).
- Onboarding has one main action: an engine already on this computer gets a lime "Use this engine" button (no download), otherwise "Our pick" gets a lime "Download (size)" button; accuracy and speed bars hide when every engine on screen scores the same, and each setup screen says "Step N of M" with the real count (the permission screen only counts when we had to ask).
- One select look: every dropdown is a styled native select, 40px tall like the text inputs, one chevron, width fits the longest option up to 280px; the form selects and the searchable Language picker use the same look, because native selects rendered about 21px tall next to 40px inputs.
- Insights: the privacy note is a quiet 13px gray line with a lock icon and a neutral border, and the most-mentioned topic leads with its count as a 32px number with "mentions" under it.
- One page frame: every screen sits 48px from the sidebar with content up to 880px, and the Home eyebrow uses the same uppercase style and position as the other pages.
- Home tiles use an in-app arrow instead of the external-link glyph and each has a one-line description; "View history" hides until there is history; a 24px fade sits where pages scroll under the footer.
- Shortcuts & mic rows show their caption directly instead of repeating "Details", use sentence case (Cancel shortcut, Shortcut behavior, Input channel, Audio feedback, Output device, Mute while recording), the engine group is "Speech engine settings", and reset buttons say "Reset" next to the icon; setting rows are at least 56px tall.
- Accent swatches get the same check badge as the particle cards.
- Light mode draws thin accent marks (the active nav bar, quote rules) with a darker twin of the accent, derived for any accent by mixing toward black until it reaches 3:1 against the light background, because lime vanished on near-white.
- Footer says "Updates off · v{version}" instead of "Update Checking Disabled • v{version}".

- One home per setting: the recording indicator style and position moved from Advanced to Appearance, filler words and the personal dictionary live only in Writing, Theme only in Appearance, the AI cleanup on/off switch lives on the AI cleanup page, and Pause animations is one switch in Appearance (the Home and dock copies are gone); where a duplicate used to be, a short "Open Writing / Open Appearance" note points to the real one, because two controls for one setting left people unsure which one won.
- The companion picker no longer shows two "selected" controls at once: "Dock look" (orb, emblem, buddy, avatar) is one dropdown, and the particle-pattern cards only appear for looks that actually have particles.
- Renames in plain words: General is Shortcuts & mic, Models is Speech engine, Post Process is AI cleanup, "Import from…" is Import, "Test the voice" is Preview animation, Squiggle is Voice line, and the overlay is the Recording indicator; every locale file was updated (existing translations kept where the meaning did not change, English as the fallback where it did).
- Appearance restructured into Color and theme, Floating dock, Recording indicator, (Your avatar) and Motion, with a 28px title, one row pattern (label and description left, control right), switches for on/off modes, 40px controls and 18px section headings; the "Less typing. More you." banner and its five-bar glyph were removed because they outranked the page title.
- Shared type scale (28 / 18 / 15 / 14 / 13) with a solid muted text color instead of opacity fades, and setting rows use a fixed 220-300px control column instead of a 50/50 split.
- Home leads with the operating instruction ("Speak. We'll type."), shows only the instruction for your saved shortcut mode, keeps Fn visible on Mac, tucks the AI cleanup and cancel shortcuts under "Other recording shortcuts", never shows an empty key cap, and adds a small "Share Say Less" link; the brand line and companion are now secondary.
- The footer shows the speech engine as a short name plus a word ("Nemotron · Ready") instead of a truncated name and an unexplained dot.
- First-run setup shows one recommended speech engine with the rest behind "See other engines", plain-language permission copy, and a new "Try it once" step with a practice box and the Fn / emoji-picker fix.
- Privacy copy says what runs where: Insights no longer claims "Nothing is uploaded" next to its AI and Claude features, AI cleanup states that it sends transcript text (never audio) to your provider, and Auto Submit and Learn from my corrections state their consequences inline.
- Insights calls its top topic "Most-mentioned topic" (it counts mentions, it does not give advice) and the Claude setup commands sit behind "For developers".
- About says Support Handy instead of "Help us continue building Handy", with a "Built on Handy (MIT license)" credit line.
- Recording overlay is one stable 240x48 pill for starting, listening and working, with the state written out ("Starting...", "Listening", "Transcribing...") beside the dot, so it reads even with every animation frozen; the native overlay window grew to 280x58 (Live 400x128) to match, and a Rust test now reads the CSS sizes so the two can't drift apart.
- Overlay avatar is 44px (it was about 30px, so an open mouth was about 2px), the cancel button is 32px and named "Cancel recording", silent bars keep a low resting shape instead of lying flat, live text is upright, entry is a 180ms slide and the 140ms exit now actually plays.
- Pausing animations freezes the companion where it is instead of snapping it back to its start pose; only Reduce Motion draws the still pose.
- Dock icon buttons are at least 32px wide, the drag handle 24px, and the Details toggles and footer model button have a 24px hit area.
- Errors people see are plain sentences with a next step; the technical detail goes to the log instead of the toast (shortcut changes, recording, transcription, model loading, notes export, data folder).
- Squiggle rebuilt as three phase-offset strands (the front one in the accent with a silver core and soft glow) over a fading baseline, 84x24 in the overlay, because the single thin line read as cheap and an idle pill looked empty.
- Squiggle loudness now drives a spring with a small overshoot and a slow swell along its length, so talking reads as smooth motion instead of jumps; still one animation-frame loop writing paths directly, stopped when motion is off or the window is hidden.
- Squiggle follows the chosen accent color in the overlay and in Appearance (it used the logo pink), and Reduce Motion or Pause draws a fixed, full resting shape.
- Talking avatar: one persistent mouth path with a tongue that morphs by opening (no more pop between a line and an oval), eyelid blinks on a random 2.2 to 5.4 second timer, slight pupil drift, breathing while listening, a glance up while thinking, squash-and-bounce on start and a happy squint on stop, and faint voice rings (one in the small pill); all spring-eased and all still under Reduce Motion or Pause.
- Companion picker: Orbit, Helix, Wave and Chrome S are now four distinct silver silhouettes on a charcoal lens (tilted orbit with beads passing behind and in front, a turning double helix, flowing sine ribbons, and the real S emblem with a bezel glint), with the accent only as glow or rim light; the flat radial ball became a layered chrome orb (dark core, accent inner glow, specular highlight, thin bright rim, brushed grain).
- Picker cards: the chosen card gets a check badge next to its ring, and only the chosen, hovered or focused card animates, to keep the settings page light.
- Compact dock disc has depth (inner shadow, specular top rim) and its status dot now means state: neutral gray when idle, bright while transcribing, amber on error, instead of copying the accent.
- Recording overlay is a recessed charcoal pill in both themes (hairline ring, top highlight, inner shadow, no outer shadow so nothing clips at the window edge), with its text and hairlines pinned to the dark palette.
- Voice visual samples in Appearance sit in the same charcoal pill, so they preview the real overlay.

### Added

- Playwright checks for the single dock-look control, Home showing only the saved mode's instruction, onboarding recommending one engine plus the Try it step, About saying Say Less, and duplicates pointing to their one home; the fixture now loads the model store and supports `?newUser` and `?mode=`.
- Keyboard and screen reader support: the shortcut chip is a real button that announces "Press the new keys, Escape to cancel."; a Skip to content link; each section change starts at the top and moves focus to the new screen's heading; Escape closes the model popover and returns focus; expanding or collapsing the dock keeps focus on the matching control; a polite live region in the overlay says Listening or Transcribing.
- One small Tooltip component (hover and keyboard focus, Escape to hide, no new dependency) on every icon-only button: dock icons, overlay cancel, Home and History icon buttons, and reset buttons.
- The footer model popover has a Manage models link, so it is never a dead end.
- Undo after removing a voice action, like snippets already had.
- Playwright checks for the keyboard shortcut chip, double-submit guards, the History error state, copy feedback, focus on section change, the skip link, the model popover, overlay listener cleanup, a hide racing a slow show, overlay status text and sizes, the 44px overlay avatar, reduced-motion bars, and dock tooltips and sizes.
- Playwright checks that the pill's voice visual never overlaps the label (bounding boxes, all three visuals), the 56px pill and its lift, the red listening dot, the dock center showing the S emblem compact and expanded, onboarding having exactly one main button and the step count, and 40px selects.
- Playwright checks for the three squiggle strands, the still squiggle under Reduce Motion, a single morphing avatar mouth, the single ring in the small pill, distinct companion cards with only the chosen one animating, and the neutral idle dot in the compact dock.
- In-app release note 0.13.1 describing the polish; it shows once the app version reaches 0.13.1.

### Fixed

- "1 words" and "1 snippets" in the Wispr import summary, and "1 dictations" in Insights, now pluralize correctly.
- Hints that said "set up a provider under Post Process" pointed to a hidden screen; AI cleanup is now always in the sidebar.
- A shortcut a build does not define no longer shows a dead "Shortcut not found" row.
- Overlay event listeners leaked because the effect never returned its cleanup (React Strict Mode doubled them), and a slow "show" could bring back an overlay the user had already cancelled; listeners are now released as they register and a stale show is dropped.
- "Import reviewed items", "Save snippet", "Save correction", "Save action" and "Export now" ignore a second click while the first is saving (duplicate Wispr imports were possible) and mark themselves busy.
- A History load failure said "No transcriptions yet"; it now says "Couldn't load your history." with Try again. Models loading shows words, a "taking longer than usual" retry after 10 seconds, and an error state.
- "Copy link" in About copies on the first press and shows "Copied!"; it no longer opens the website when the browser clipboard is unavailable. Insights "Copy" and History copy say when they worked or failed.
- A late voice-visual save could overwrite a newer edit; edits and store saves are now latest-wins.
- Invalid custom colors explain why Apply is off, website voice actions are checked ("calendly dot com" is refused, "calendly.com/you" becomes https://calendly.com/you), and duplicate snippet or correction cues mark the field and move focus to it.
- The Volume slider has a name, and "Preview animation" and other secondary buttons show a focus ring again.
- Insights, history search, notes export and `--mcp` now read imported Wispr Flow history (`wispr-history.sqlite`) alongside `history.db`, because a new user who imported months of Wispr dictations saw "Not enough history yet"; a missing, damaged or locked import file is skipped and logged instead of breaking Insights.

## [2026-09-24]

### Added

- Hold Fn (Globe) to talk on Mac, like Wispr Flow, alongside Option+Space; it is a second default shortcut, so existing installs get it on update and either key works.
- Share Say Less button in About that copies saylessvoice.com, so members can pass the app on in one tap.
- Voice visuals: choose Bars, Squiggle, or Avatar for the recording overlay in Appearance, so the overlay can match your style; Bars stays the default so nothing changes until you pick.
- Talking avatar (stick figure, person, cat, dog; three colors; cap, beanie, crown, headphones, sunglasses) whose mouth follows voice volume, usable as the dock companion and the overlay; volume-driven because real lip-sync needs a second live model.
- Avatar builder with a live preview and a Test button that plays a short speaking rhythm, so you can check the look without recording.
- `overlay_visual` and `avatar` settings in `studio.json`, validated in Rust (known styles/accessories, hex colors only) so a bad value can't reach the SVG.
- Playwright coverage for the builder, reduced motion, overlay squiggle/avatar, and the 104px compact dock; the test fixture can now render the recording overlay with mocked events.
- Voice visuals diagram (`docs/diagrams/voice-visuals.mmd` + `.svg`) and a Voice visuals section in `docs/personalization.md`.
- Insights ("Say less, stress less"): recurring problems, recurring ideas, and "Fix this first," with dated quotes, computed locally from dictation history with no model, so people see what keeps coming up without anything leaving their computer.
- Search across all dictations from the Insights screen, because finding "what did I say about X" should not mean scrolling history.
- Opt-in "Summarize with AI" digest that reuses the Post Process provider and sends only topic labels, counts and up to two short quotes per topic; nothing runs automatically.
- "Read digest aloud" using the system's built-in voices (no download, works offline).
- Opt-in Obsidian-friendly notes export (daily notes + Insights.md with wikilinks), nightly or on demand; it only writes files it created and never deletes, so a notes vault stays safe.
- `--mcp` flag: a local, read-only MCP server (search_transcripts, recent_transcripts, recurring_topics) so Claude and other MCP apps can answer questions about your own history; it never starts the app, tray, or microphone.
- docs/stress-less.md and a data-flow diagram showing exactly what stays local and what is opt-in.
- Download site in `site/` (live at say-less-dhi.pages.dev), with "coming soon" buttons until the first signed release exists.
- Our own auto-update signing key. Private key lives in GitHub secrets; the old Handy public key could never verify our updates.

### Fixed

- Regenerated the updater signing key with a real password; the first key was created without one, which let anyone holding the file sign updates and made CI fail with a password mismatch.
- macOS CI builds no longer fail when no Apple Developer ID certificate is uploaded; they build unsigned (ad-hoc) instead.
- Tauri treated a blank APPLE_CERTIFICATE as a real one; macOS now builds through a separate unsigned step with no Apple variables until a cert is uploaded.

### Security

- PR Test Build and Build Test no longer receive signing secrets; only main and release builds sign.
- `.gitignore` now blocks `.env*`, certificates/keys, and wrangler state.
- Added `SECURITY.md` with a private reporting link.
- Removed a local home-folder path and personal dictionary/library details from docs before the repo went public.

### Changed

- Release builds are Mac + Windows only; Linux packages still carried Handy's install path and maintainer.
- Installers now include the MIT license file (required by Handy's license) and list Drey Thomas as publisher.
- Issue/PR templates and CONTRIBUTING point at Say Less instead of Handy; removed Handy's donation links (FUNDING.yml).
- Site: live on saylessvoice.com; replaced unverified claims (8GB auto-model picking, Windows availability) with accurate copy; FAQ says models download once from Handy's model server.
- Release asset prefix renamed from `handy` to `say-less`.
- `scripts/setup-apple-signing.sh` walks through uploading the Developer ID certificate and notarization login to GitHub secrets.
- Companion motion checks (Pause, Reduce Motion, hidden window) moved into a shared `useMotionAllowed` hook so the dock, overlay, and Appearance preview all stop decorative motion the same way.

## 0.10.1

- Recover from stalled macOS permission setup with bounded waiting, focus rechecks, and explicit retry instructions.

## 0.10.0

- Custom accent palettes and a nonactivating floating dock.
- Exact, opt-in voice cues for installed Mac apps and http/https links.
- Local per-app casing/punctuation styles.
- Read-only Wispr library preview/import, CSV/JSON support, optional text history archive, deduplication and pre-import backup.
- Recheck existing permissions when returning from System Settings.

## Unreleased

- Added local voice snippets with durable save, edit/remove, duplicate validation, whole-cue and in-sentence matching, and a preview using the same Rust matcher. Matching snippets bypass optional AI cleanup to preserve their saved text.
- Added Writing for vocabulary, filler cleanup, and snippets; replaced custom dropdown menus with native selectors, named switches, keyboard focus, responsive settings rows, and shared silver actions.
- Fixed rejected settings appearing saved; rollback now preserves concurrent changes to other settings. Failed dictionary saves retain the draft.
- Added permission-free settings browsing without starting input simulation or shortcuts, plus a persistent setup notice. First-time users now receive the latest useful in-app introduction.
- Added real renderer workflow tests with simulated desktop IPC and a sourced Wispr Flow gap analysis. This is not a full parity or distribution claim.
- Added Say Less's silver speech emblem, native app icons, monochrome tray states, and a reusable coaching-portal brand asset.
- Replaced inherited product names in the native window, tray tooltip, HTML title, and translated screens. Preserved upstream project attribution and compatibility identifiers.
- Added the 0.9.8 in-app introduction, neutral theme, accessible sidebar buttons, and silver permission controls.
- Fixed Finder launch of packaged debug builds: TypeScript bindings are exported only during development, to the source directory rather than the current working directory.
- Fixed recognition of Hugging Face models downloaded by commit SHA without a `refs` entry, including Nemotron downloaded with the official HF CLI. Existing `main` cache fallback remains available.
- Added a reproducible Nemotron acceptance check using the existing pinned runtime and model catalog, covering integrity, partial transcripts, finalization, repeat sessions, automatic language selection, and cancellation recovery.
- Documented the existing optional Nemotron setup and local dictation architecture.
- Corrected distribution status and clarified that optional cloud post-processing sends transcript text to a configured provider.

## [2026-09-18]

### Added

- Forked Handy v0.9.7 as Say Less, a free offline dictation app for the coaching group.

### Changed

- App name, bundle ID (`com.dreythomas.sayless`), and English UI text renamed to Say Less so it installs separately from Handy.
- Auto-update feed now points at this repo's releases, not Handy's. Otherwise installs would "update" into Handy.

### Removed

- Handy's Windows code-signing command, which uses CJ's Azure account and would break our builds.
