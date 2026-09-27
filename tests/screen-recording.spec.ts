import { test, expect } from "@playwright/test";

const card = (page: import("@playwright/test").Page) =>
  page.getByTestId("screen-recording-card");
/** Turn on Show your face in the saved recording setup before the page loads. */
const withFaceOn = (page: import("@playwright/test").Page) =>
  page.addInitScript(() =>
    localStorage.setItem(
      "test-recording",
      JSON.stringify({
        source: "display",
        display_id: null,
        window_id: null,
        window_label: null,
        microphone: true,
        microphone_name: null,
        system_audio: true,
        webcam: true,
        camera_id: null,
        webcam_corner: "bottom_right",
        webcam_size: "medium",
        quality: "p1080",
        fps: 30,
      }),
    ),
  );
/** A button's distance from the top of the card. */
const topInCard = (button: import("@playwright/test").Locator) =>
  button.evaluate(
    (el) =>
      el.getBoundingClientRect().top -
      el.closest("section")!.getBoundingClientRect().top,
  );
/** How many times the page has called a backend command. */
const count = (page: import("@playwright/test").Page, cmd: string) =>
  page.evaluate(
    (name) =>
      (window as unknown as { testCommands: string[] }).testCommands.filter(
        (c) => c === name,
      ).length,
    cmd,
  );

test("Home records, shows a ticking timer, stops and offers the file", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/tests/fixtures/app.html");
  const home = card(page);
  await expect(
    home.getByRole("heading", { name: "Record your screen" }),
  ).toBeVisible();
  const start = home.getByRole("button", { name: "Record screen" });
  await expect(start).toBeEnabled();
  // Double-click guard: two fast clicks start one recording.
  await start.dblclick();
  const stop = home.getByRole("button", { name: "Stop screen recording" });
  await expect(stop).toBeVisible();
  await expect(stop).toContainText("Stop");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { testCommands: string[] }).testCommands.filter(
          (c) => c === "start_screen_recording",
        ).length,
    ),
  ).toBe(1);
  const timer = home.getByRole("timer");
  await expect(timer).toHaveText("00:00");
  await page.clock.fastForward(65_000);
  await expect(timer).toHaveText("01:05");
  await stop.click();
  await expect(home.getByRole("status")).toContainText(
    "Saved in the Say Less folder in Movies.",
  );
  await expect(home.getByRole("status")).toContainText(
    "Say Less 2026-09-25 at 14.03.07.mp4",
  );
  await home.getByRole("button", { name: "Show in Finder" }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCommands: string[] }).testCommands.includes(
        "show_screen_recording_in_folder",
      ),
    ),
  ).toBe(true);
  await expect(
    home.getByRole("button", { name: "Record screen" }),
  ).toBeVisible();
});

test("a recording already running shows its elapsed time", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?screen=recording");
  await expect(card(page).getByRole("timer")).toHaveText("01:05");
  await expect(
    card(page).getByRole("button", { name: "Stop screen recording" }),
  ).toBeVisible();
});

test("denied Screen Recording permission explains the fix", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?screen=denied");
  const home = card(page);
  await home.getByRole("button", { name: "Record screen" }).click();
  const alert = home.getByRole("alert");
  await expect(alert).toContainText(
    "We need Screen Recording permission to record your screen.",
  );
  await alert.getByRole("button", { name: "Open System Settings" }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCommands: string[] }).testCommands.includes(
        "open_screen_recording_settings",
      ),
    ),
  ).toBe(true);
  // Nothing started.
  await expect(home.getByRole("timer")).toHaveCount(0);
});

test("Windows shows a disabled button with a plain reason", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?os=windows");
  const home = card(page);
  const button = home.getByRole("button", { name: "Record screen" });
  await expect(button).toBeDisabled();
  await expect(home).toContainText(
    "Screen recording is coming to Windows soon.",
  );
  await expect(button).toHaveAccessibleDescription(
    "Screen recording is coming to Windows soon.",
  );
  // One bold line in the same notice as the other can't-record states, a
  // grey button that doesn't look clickable, and no Setup for a feature
  // Windows doesn't have yet.
  await expect(home.locator(".home-record-notice strong")).toHaveText(
    "Screen recording is coming to Windows soon.",
  );
  await expect(button).not.toHaveClass(/accent-action/);
  await expect(button).toHaveCSS("opacity", "1");
  await expect(
    home.getByRole("button", { name: "Recording setup" }),
  ).toHaveCount(0);
});

test("double-clicking Stop saves once and doesn't start a new recording", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?screen=recording");
  const home = card(page);
  await home.getByRole("button", { name: "Stop screen recording" }).dblclick();
  await expect(home.getByRole("status")).toContainText(
    "Saved in the Say Less folder in Movies.",
  );
  // Record ignores clicks for a moment after Stop. Once that passes, the
  // second click must not have started anything.
  await expect(
    home.getByRole("button", { name: "Record screen" }),
  ).not.toHaveAttribute("aria-disabled", "true");
  expect(await count(page, "stop_screen_recording")).toBe(1);
  expect(await count(page, "start_screen_recording")).toBe(0);
  await expect(home.getByRole("status")).toBeVisible();
});

test("Enter on Record keeps focus on the button and announces the start", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  const home = card(page);
  const start = home.getByRole("button", { name: "Record screen" });
  await expect(start).toBeEnabled();
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(
    home.getByRole("button", { name: "Stop screen recording" }),
  ).toBeFocused();
  await expect(home.locator('[aria-live="polite"]')).toHaveText(
    "Recording started.",
  );
});

test("Record and Stop sit in the same spot", async ({ page }) => {
  for (const size of [
    { width: 680, height: 570 },
    { width: 1100, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/tests/fixtures/app.html");
    const home = card(page);
    const start = home.getByRole("button", { name: "Record screen" });
    await expect(start).toBeEnabled();
    const before = await topInCard(start);
    await start.click();
    const stop = home.getByRole("button", { name: "Stop screen recording" });
    await expect(stop).toBeVisible();
    expect(await topInCard(stop)).toBeCloseTo(before, 1);
  }
});

test("while recording, the card says how to stop", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?screen=recording");
  const home = card(page);
  await expect(home.getByText("Click Stop or say")).toBeVisible();
  await expect(home.getByText("Or press your shortcut")).toBeHidden();
  await expect(home.getByRole("button", { name: "Show my face" })).toBeHidden();
});

test("Open recordings folder has its own row at the card's left edge", async ({
  page,
}) => {
  for (const width of [680, 1100]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/tests/fixtures/app.html");
    const home = card(page);
    const start = home.getByRole("button", { name: "Record screen" });
    await expect(start).toBeEnabled();
    const record = (await start.boundingBox())!;
    const title = (await home
      .getByRole("heading", { name: "Record your screen" })
      .boundingBox())!;
    const folder = (await home
      .getByRole("button", { name: "Open recordings folder" })
      .boundingBox())!;
    expect(folder.y).toBeGreaterThanOrEqual(record.y + record.height);
    expect(folder.x).toBeLessThanOrEqual(title.x);
  }
});

test("denied permission shows the notice above the buttons and Reopen runs once", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?screen=denied");
  const home = card(page);
  const record = home.getByRole("button", { name: "Record screen" });
  await record.click();
  const alert = home.getByRole("alert");
  await expect(alert).toBeVisible();
  const notice = (await alert.boundingBox())!;
  const button = (await record.boundingBox())!;
  expect(notice.y + notice.height).toBeLessThanOrEqual(button.y);
  await alert.getByRole("button", { name: "Reopen Say Less" }).dblclick();
  await expect(
    alert.getByRole("button", { name: "Reopening…" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(await count(page, "reopen_app")).toBe(1);
});

test("a failed Reopen says what to do and can be tried again", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?screen=denied&reopen=fail");
  const home = card(page);
  await home.getByRole("button", { name: "Record screen" }).click();
  const alert = home.getByRole("alert");
  await alert.getByRole("button", { name: "Reopen Say Less" }).click();
  await expect(alert).toContainText(
    "We couldn't reopen Say Less. Quit it from the menu bar, then open it again.",
  );
  await expect(
    alert.getByRole("button", { name: "Reopen Say Less" }),
  ).toBeEnabled();
});

test("a blocked camera warns on the card and opens the fix", async ({
  page,
}) => {
  // Show your face is on, but ?camera=denied refuses Camera permission.
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  await expect(
    home.getByText(
      "We can't use your camera. Allow it in System Settings, or turn off Show your face to record.",
    ),
  ).toBeVisible();
  await expect(home.getByText("We won't show your face")).toHaveCount(0);
  await home.getByRole("button", { name: "Open System Settings" }).click();
  await expect.poll(() => count(page, "open_camera_settings")).toBe(1);
});

test("the camera warning keeps its space when the camera notice shows", async ({
  page,
}) => {
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  const warning = home.getByText("We can't use your camera.");
  await expect(warning).toBeVisible();
  const record = home.getByRole("button", { name: "Record screen" });
  const before = await topInCard(record);
  // The backend won't start with Show your face on and no camera.
  await record.click();
  await expect(home.getByRole("alert")).toContainText(
    "We need Camera permission to show your face",
  );
  await expect(warning).toBeHidden();
  expect(await topInCard(record)).toBeCloseTo(before, 1);
});

test("open Setup shows the camera problem, not the card", async ({ page }) => {
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  const warning = home.getByText("We can't use your camera.");
  await expect(warning).toBeVisible();
  const record = home.getByRole("button", { name: "Record screen" });
  const before = await topInCard(record);
  await home.getByRole("button", { name: "Recording setup" }).click();
  const panel = page.getByRole("region", { name: "Recording setup" });
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(warning).toBeHidden();
  expect(await topInCard(record)).toBeCloseTo(before, 1);
});

test("turning on Show your face during the macOS prompt doesn't say blocked", async ({
  page,
}) => {
  // Before macOS has asked, the camera check says no, same as ?camera=denied.
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  await home.getByRole("button", { name: "Recording setup" }).click();
  const panel = page.getByRole("region", { name: "Recording setup" });
  await panel.getByRole("switch", { name: "Show your face" }).check();
  await expect(panel.getByRole("alert")).toBeVisible();
  // The card's warning is there, keeping its space, but not shown.
  const warning = home.getByText("We can't use your camera.");
  await expect(warning).toHaveCount(1);
  await expect(warning).toBeHidden();
});

test("Show my face opens Setup on the Show your face switch", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  const home = card(page);
  await expect(home.getByText("We won't show your face")).toBeVisible();
  await home.getByRole("button", { name: "Show my face" }).click();
  await expect(
    page.getByRole("region", { name: "Recording setup" }),
  ).toBeVisible();
  // RecordingSetup gives this switch the id "rec-setup-webcam".
  await expect(
    page.getByRole("switch", { name: "Show your face" }),
  ).toBeFocused();
});

test("closing Setup forgets Show my face, so a plain open stays put", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-27T10:00:00") });
  await page.goto("/tests/fixtures/app.html");
  const home = card(page);
  const setup = home.getByRole("button", { name: "Recording setup" });
  await expect(home.getByText("We won't show your face")).toBeVisible();
  // Freeze animation frames, so Setup closes before the search for the
  // Show your face switch gets a chance to run.
  await page.clock.pauseAt(new Date("2026-09-27T10:05:00"));
  await home.getByRole("button", { name: "Show my face" }).click();
  await setup.click();
  await expect(setup).toHaveAttribute("aria-expanded", "false");
  await setup.click();
  await expect(setup).toHaveAttribute("aria-expanded", "true");
  await page.clock.runFor(1000);
  await expect(
    page.getByRole("switch", { name: "Show your face" }),
  ).toBeVisible();
  await expect(setup).toBeFocused();
});

test("light theme gives the lime Record button a darker edge", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?theme=light");
  const record = card(page).getByRole("button", { name: "Record screen" });
  await expect(record).toBeEnabled();
  const [edge, fill] = await record.evaluate((el) => {
    const style = getComputedStyle(el);
    return [style.borderTopColor, style.backgroundColor];
  });
  expect(edge).not.toBe(fill);
});

test("dock records the screen and shows Saved with Show in Finder", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/tests/fixtures/app.html?dock=1");
  const start = page.getByRole("button", { name: "Record screen" });
  await start.focus();
  // The tooltip names the icon button and opens on keyboard focus.
  await expect(
    page.getByRole("tooltip", { name: "Record screen" }),
  ).toBeVisible();
  await start.click();
  const stop = page.getByRole("button", { name: "Stop screen recording" });
  await expect(stop).toBeVisible();
  await page.clock.fastForward(3_000);
  await expect(stop.getByRole("timer")).toHaveText("00:03");
  await stop.click();
  await expect(page.getByRole("status")).toContainText("Saved.");
  await page.getByRole("button", { name: "Show in Finder" }).click();
});

test("dock labels Talk and Screen, and says Stop while the screen records", async ({
  page,
}) => {
  // The expanded dock window is 460px wide (src-tauri/src/floating.rs).
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  const pillsFit = () =>
    page
      .locator(".floating-bar .dock-record, .floating-bar .dock-screen")
      .evaluateAll((els) =>
        els.every((el) => el.scrollWidth <= el.clientWidth + 1),
      );
  const noPageOverflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await expect(
    page.getByRole("button", { name: "Talk", exact: true }),
  ).toHaveText("Talk");
  const start = page.getByRole("button", { name: "Record screen" });
  await expect(start).toHaveText("Screen");
  await expect(page.locator(".floating-shell > p")).toHaveText(
    "Click Talk to type with your voice, or Screen to record a video",
  );
  expect(await pillsFit()).toBe(true);
  expect(await noPageOverflow()).toBe(true);
  await start.click();
  const stop = page.getByRole("button", { name: "Stop screen recording" });
  await expect(stop).toContainText("Stop");
  await expect(page.locator(".floating-shell > p")).toHaveText(
    "Recording your screen. Click the red Stop button when you're done.",
  );
  expect(await pillsFit()).toBe(true);
  expect(await noPageOverflow()).toBe(true);
});

test("compact dock offers recording from a small corner button", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "test-studio",
      JSON.stringify({
        accent: "#b8ff65",
        floating: true,
        actions_enabled: false,
        actions: [],
        default_style: "original",
        app_styles: [],
        cleanup_on_dictation: false,
        dock_animation: "orbit",
        dock_motion: true,
        dock_cycle: false,
        dock_edge: "free",
        dock_compact: true,
        dock_character: "emblem",
        learn_corrections: false,
        corrections: [],
        overlay_visual: "bars",
        voice_recording: true,
        avatar: {
          kind: "person",
          body: "#e2b48f",
          accent: "#8796ab",
          background: "#22262e",
          accessory: "none",
        },
      }),
    ),
  );
  await page.goto("/tests/fixtures/app.html?dock=1");
  await page.getByRole("button", { name: "Record screen" }).click();
  await expect(
    page.getByRole("button", { name: "Stop screen recording" }),
  ).toBeVisible();
});

test("dock on Windows keeps the button focusable and says why", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?dock=1&os=windows");
  const button = page.getByRole("button", {
    name: "Screen recording is coming to Windows soon.",
  });
  await expect(button).toHaveAttribute("aria-disabled", "true");
  // There is no Screen label here, so the hint must not point at one.
  await expect(page.locator(".floating-shell > p")).toHaveText(
    "Click Talk to type with your voice, or use your dictation shortcut",
  );
  // Playwright won't click an aria-disabled button, so use the keyboard:
  // it must stay focusable and do nothing.
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCommands: string[] }).testCommands.includes(
        "start_screen_recording",
      ),
    ),
  ).toBe(false);
});

test("voice recording commands have their own switch and reserved words", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page
    .getByRole("button", { name: "Voice actions", exact: true })
    .click();
  const toggle = page.getByRole("switch", {
    name: "Control recording with your voice",
  });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await page.getByLabel("After “Say Less”, say").fill("Start recording");
  await page
    .getByLabel("Destination", { exact: true })
    .selectOption("/System/Applications/Notes.app");
  await page.getByRole("button", { name: "Save action", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "That phrase is saved for screen recording.",
  );
});
