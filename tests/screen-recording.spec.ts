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

test("Windows shows one plain line and no Record button", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?os=windows");
  const home = card(page);
  await expect(
    home.getByText("Screen recording is coming to Windows soon.", {
      exact: true,
    }),
  ).toBeVisible();
  // Plain info, not a warning: no amber box, no warning triangle, no dead
  // Record button, no Setup, and no promise that we record the screen.
  await expect(home.locator(".home-record-notice")).toHaveCount(0);
  await expect(home.locator("svg")).toHaveCount(0);
  await expect(home.getByRole("button")).toHaveCount(0);
  await expect(home).not.toContainText("We record your screen");
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
  await expect(
    home.getByText(
      "When you're done, click Stop, press Ctrl + Option + R, or say “Say less, stop recording.”",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(home.getByText("from any app")).toBeHidden();
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

test("denied permission shows the notice under the buttons, focuses the fix, and Reopen runs once", async ({
  page,
}) => {
  for (const width of [680, 1100]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/tests/fixtures/app.html?screen=denied");
    const home = card(page);
    const record = home.getByRole("button", { name: "Record screen" });
    await expect(record).toBeEnabled();
    const before = await topInCard(record);
    await record.click();
    const alert = home.getByRole("alert");
    await expect(alert).toBeVisible();
    // Record stays under the pointer and the notice opens below it, with
    // focus on its first fix.
    expect(await topInCard(record)).toBeCloseTo(before, 1);
    const notice = (await alert.boundingBox())!;
    const button = (await record.boundingBox())!;
    expect(notice.y).toBeGreaterThanOrEqual(button.y + button.height);
    const settings = alert.getByRole("button", {
      name: "Open System Settings",
    });
    await expect(settings).toBeFocused();
    // The icon sits beside the first line; the buttons start under the text.
    const icon = (await alert.locator("svg").first().boundingBox())!;
    const text = (await alert.locator("p").first().boundingBox())!;
    expect(Math.abs(icon.y + icon.height / 2 - (text.y + 10))).toBeLessThan(2);
    expect((await settings.boundingBox())!.x).toBeCloseTo(text.x, 0);
  }
  const home = card(page);
  const alert = home.getByRole("alert");
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

test("a blocked camera warns on the card and opens the fix once", async ({
  page,
}) => {
  // Show your face is on, but ?camera=denied refuses Camera permission.
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  await expect(
    home.getByText(
      "Your camera is blocked, so recording won't start with Show your face on.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(home.getByText("We won't show your face")).toHaveCount(0);
  // A double-click opens System Settings once.
  await home.getByRole("button", { name: "Open System Settings" }).dblclick();
  await expect.poll(() => count(page, "open_camera_settings")).toBe(1);
  await page.waitForTimeout(300);
  expect(await count(page, "open_camera_settings")).toBe(1);
});

test("the camera warning keeps its space when the camera notice shows", async ({
  page,
}) => {
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  const warning = home.getByText("Your camera is blocked");
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

test("the camera warning stays next to Record while Setup is open", async ({
  page,
}) => {
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  const warning = home.getByText("Your camera is blocked");
  await expect(warning).toBeVisible();
  const record = home.getByRole("button", { name: "Record screen" });
  const before = await topInCard(record);
  await home.getByRole("button", { name: "Recording setup" }).click();
  const panel = page.getByRole("region", { name: "Recording setup" });
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(warning).toBeVisible();
  expect(await topInCard(record)).toBeCloseTo(before, 1);
});

test("turning on Show your face during the macOS prompt doesn't say blocked", async ({
  page,
}) => {
  // ?camera=ask: macOS hasn't asked yet, so turning the face on raises its
  // prompt, which waits for an answer.
  await page.goto("/tests/fixtures/app.html?camera=ask");
  const home = card(page);
  await home.getByRole("button", { name: "Recording setup" }).click();
  const panel = page.getByRole("region", { name: "Recording setup" });
  await panel.getByRole("switch", { name: "Show your face" }).check();
  await expect(panel.getByRole("alert")).toContainText(
    "Allow the camera in the macOS prompt.",
  );
  const warning = home.getByText("Your camera is blocked");
  await expect(warning).toBeHidden();
  // Nor where the face goes: macOS hasn't given us the camera yet.
  await expect(home.getByText("Your face will show")).toBeHidden();
  // Still waiting after the next camera check, with no focus event.
  await page.waitForTimeout(1700);
  await expect(warning).toBeHidden();
  // Saying no in the prompt: now it is blocked, and the card says so even
  // with Setup open.
  await page.evaluate(() =>
    (
      window as unknown as { testCameraAnswer: (allow: boolean) => void }
    ).testCameraAnswer(false),
  );
  await expect(warning).toBeVisible();
  await expect(panel.getByRole("alert")).toContainText(
    "We need Camera permission to show your face.",
  );
});

test("saying yes in the macOS prompt shows where the face goes", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?camera=ask");
  const home = card(page);
  await home.getByRole("button", { name: "Show my face" }).click();
  const panel = page.getByRole("region", { name: "Recording setup" });
  await expect(panel.getByRole("alert")).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { testCameraAnswer: (allow: boolean) => void }
    ).testCameraAnswer(true),
  );
  await expect(
    home.getByText("Your face will show in the bottom right corner.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(home.getByText("Your camera is blocked")).toHaveCount(0);
});

test("a camera refused before warns on the card right after Show my face", async ({
  page,
}) => {
  // ?camera=denied: the person said no before, so macOS shows no prompt and
  // nothing is left to wait for.
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  await home.getByRole("button", { name: "Show my face" }).click();
  const panel = page.getByRole("region", { name: "Recording setup" });
  await expect(
    panel.getByRole("switch", { name: "Show your face" }),
  ).toBeChecked();
  const warning = home.getByText(
    "Your camera is blocked, so recording won't start with Show your face on.",
    { exact: true },
  );
  await expect(warning).toBeVisible({ timeout: 2000 });
  // Setup names the fix, not a prompt that isn't there.
  await expect(panel.getByRole("alert")).toContainText(
    "We need Camera permission to show your face.",
  );
  await expect(panel.getByText("macOS prompt")).toHaveCount(0);
  expect(
    await count(page, "plugin:macos-permissions|request_camera_permission"),
  ).toBe(0);
  // It stays after Setup closes.
  await home.getByRole("button", { name: "Recording setup" }).click();
  await expect(panel).toHaveCount(0);
  await expect(warning).toBeVisible();
});

test("with the face on and no answer from macOS yet, the fix raises the prompt", async ({
  page,
}) => {
  // Show your face was already on, but macOS never asked (say, Say Less quit
  // while its prompt was up). No prompt of ours is waiting, so offer the fix.
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html?camera=ask");
  const home = card(page);
  await expect(
    home.getByText(
      "Your camera is blocked, so recording won't start with Show your face on.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await home.getByRole("button", { name: "Open System Settings" }).click();
  await expect.poll(() => count(page, "open_camera_settings")).toBe(1);
  expect(
    await count(page, "plugin:macos-permissions|request_camera_permission"),
  ).toBe(1);
});

test("Show my face turns the face on and opens Setup on where it goes", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  const home = card(page);
  await expect(home.getByText("We won't show your face")).toBeVisible();
  await home.getByRole("button", { name: "Show my face" }).click();
  const panel = page.getByRole("region", { name: "Recording setup" });
  await expect(
    panel.getByRole("switch", { name: "Show your face" }),
  ).toBeChecked();
  // Focus lands on the saved corner, with the size choices next to it.
  const corner = panel.getByRole("radio", { name: "Bottom right" });
  await expect(corner).toBeFocused();
  await expect(corner).toBeInViewport();
  await expect(panel.getByRole("radio", { name: "Medium" })).toBeInViewport();
  // Same path as the switch: it checked the camera permission.
  expect(await count(page, "camera_permission_status")).toBeGreaterThan(0);
  await expect(
    home.getByText("Your face will show in the bottom right corner.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("saying no to the camera after Show my face warns on the card", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?camera=ask");
  const home = card(page);
  await home.getByRole("button", { name: "Show my face" }).click();
  await expect(
    page
      .getByRole("region", { name: "Recording setup" })
      .getByRole("switch", { name: "Show your face" }),
  ).toBeChecked();
  // It raised the macOS prompt, like the switch does.
  await expect
    .poll(() =>
      count(page, "plugin:macos-permissions|request_camera_permission"),
    )
    .toBe(1);
  const warning = home.getByText(
    "Your camera is blocked, so recording won't start with Show your face on.",
    { exact: true },
  );
  await expect(warning).toBeHidden();
  await page.evaluate(() =>
    (
      window as unknown as { testCameraAnswer: (allow: boolean) => void }
    ).testCameraAnswer(false),
  );
  await expect(warning).toBeVisible();
});

test("open Setup drops Show my face but keeps the line, since its switch is right there", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  const home = card(page);
  const hint = home.getByText("We won't show your face in the video.", {
    exact: true,
  });
  const showMyFace = home.getByRole("button", { name: "Show my face" });
  await expect(hint).toBeVisible();
  await expect(showMyFace).toBeVisible();
  const record = home.getByRole("button", { name: "Record screen" });
  const before = await topInCard(record);
  await home.getByRole("button", { name: "Recording setup" }).click();
  await expect(
    page.getByRole("switch", { name: "Show your face" }),
  ).toBeVisible();
  // One control for the face while Setup is open, and no blank row.
  await expect(showMyFace).toHaveCount(0);
  await expect(hint).toBeVisible();
  // The line keeps the button's height, so Record doesn't move.
  expect(await topInCard(record)).toBeCloseTo(before, 1);
  await home.getByRole("button", { name: "Recording setup" }).click();
  await expect(showMyFace).toBeVisible();
});

test("with the face on, the card says which corner it shows in", async ({
  page,
}) => {
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html");
  const home = card(page);
  await expect(
    home.getByText("Your face will show in the bottom right corner.", {
      exact: true,
    }),
  ).toBeVisible();
  await home.getByRole("button", { name: "Recording setup" }).click();
  await page
    .getByRole("region", { name: "Recording setup" })
    .getByRole("radio", { name: "Top left" })
    .check();
  await expect(
    home.getByText("Your face will show in the top left corner.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("with Setup open, the saved video shows right under Stop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 680, height: 570 });
  await page.goto("/tests/fixtures/app.html");
  const home = card(page);
  await home.getByRole("button", { name: "Recording setup" }).click();
  const panel = page.getByRole("region", { name: "Recording setup" });
  await expect(panel).toBeVisible();
  await home.getByRole("button", { name: "Record screen" }).click();
  await home.getByRole("button", { name: "Stop screen recording" }).click();
  const saved = home.getByRole("status");
  await expect(saved).toContainText("Saved in the Say Less folder in Movies.");
  await expect(saved).toBeInViewport({ ratio: 1 });
  await expect(
    home.getByRole("button", { name: "Show in Finder" }),
  ).toBeInViewport({ ratio: 1 });
  // Above Setup, not under it. Show in Finder is the one path to the new
  // video, so the folder link steps aside until the next recording.
  const savedBox = (await saved.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(savedBox.y + savedBox.height).toBeLessThanOrEqual(panelBox.y);
  await expect(
    home.getByRole("button", { name: "Open recordings folder" }),
  ).toHaveCount(0);
});

test("a camera problem at Record shows under the button with focus on the fix, even with Setup open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 680, height: 570 });
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  await home.getByRole("button", { name: "Recording setup" }).click();
  const panel = page.getByRole("region", { name: "Recording setup" });
  await expect(
    panel.getByRole("switch", { name: "Show your face" }),
  ).toBeChecked();
  await home.getByRole("button", { name: "Record screen" }).click();
  // Setup has its own camera alert, so find the card's notice by its slot.
  const notice = home.locator(".home-record-result").getByRole("alert");
  await expect(notice).toContainText(
    "We need Camera permission to show your face.",
  );
  await expect(notice).toBeInViewport({ ratio: 1 });
  await expect(
    notice.getByRole("button", { name: "Open System Settings" }),
  ).toBeFocused();
  const noticeBox = (await notice.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(panelBox.y);
  // Nothing started.
  await expect(home.getByRole("timer")).toHaveCount(0);
});

test("a blocked camera offers Record without my face, which starts the recording", async ({
  page,
}) => {
  await withFaceOn(page);
  await page.goto("/tests/fixtures/app.html?camera=denied");
  const home = card(page);
  await home.getByRole("button", { name: "Record screen" }).click();
  const notice = home.locator(".home-record-result").getByRole("alert");
  await notice.getByRole("button", { name: "Record without my face" }).click();
  await expect(
    home.getByRole("button", { name: "Stop screen recording" }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("test-recording") || "{}"),
  );
  expect(saved.webcam).toBe(false);
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

test("compact dock offers recording from its attached action rail", async ({
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
  await page.setViewportSize({ width: 220, height: 104 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  await page.getByRole("button", { name: "Expand dock" }).hover();
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

test("the card shows the Ctrl + Option + R record shortcut", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await expect(
    card(page).getByText(
      "Or press Ctrl + Option + R from any app, or say “Say less, start recording.”",
      { exact: true },
    ),
  ).toBeVisible();
});

test("Shortcuts & mic lists the Record screen shortcut on a Mac", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page
    .getByRole("button", { name: "Shortcuts & mic", exact: true })
    .click();
  await expect(page.getByText("Record screen", { exact: true })).toBeVisible();
  await expect(page.getByText("Ctrl + Option + R").first()).toBeVisible();
});

test("the Record shortcut can be changed from the Home card", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  const row = page.locator(".home-record-shortcut");
  await expect(row.getByText("Record shortcut", { exact: true })).toBeVisible();
  await expect(
    row.getByRole("button", { name: /Ctrl \+ Option \+ R/ }),
  ).toBeVisible();
});

test("the Home orb grows with your voice while you dictate", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?events");
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { testEmit?: unknown }).testEmit ===
      "function",
  );
  const orb = page.locator(".home-companion .companion");
  await expect(orb).toBeVisible();
  const scale = () =>
    orb.evaluate((el) =>
      Number(getComputedStyle(el).getPropertyValue("--voice-scale") || "1"),
    );
  const emit = (event: string, payload: unknown) =>
    page.evaluate(
      ([e, p]) =>
        (
          window as unknown as {
            testEmit: (e: string, p?: unknown) => Promise<void>;
          }
        ).testEmit(e as string, p),
      [event, payload] as const,
    );
  await emit("dock-state", "recording");
  for (let i = 0; i < 6; i++) {
    await emit("mic-level", Array(16).fill(0.9));
  }
  await expect.poll(scale).toBeGreaterThan(1.1);
});

test("the Home orb moves with your voice during a screen recording, then settles", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?events");
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { testEmit?: unknown }).testEmit ===
      "function",
  );
  const orb = page.locator(".home-companion .companion");
  await expect(orb).toBeVisible();
  const scale = () =>
    orb.evaluate((el) =>
      Number(getComputedStyle(el).getPropertyValue("--voice-scale") || "1"),
    );
  const emit = (level: number) =>
    page.evaluate(
      (l) =>
        (
          window as unknown as {
            testEmit: (e: string, p?: unknown) => Promise<void>;
          }
        ).testEmit("screen-mic-level", l),
      level,
    );
  for (let i = 0; i < 6; i++) await emit(0.9);
  await expect.poll(scale).toBeGreaterThan(1.1);
  // No more levels: the recording ended, so the orb calms down on its own.
  await expect.poll(scale, { timeout: 3000 }).toBeLessThan(1.02);
});

test("the wave line stretches hard with your voice, not just a few percent", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?events");
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { testEmit?: unknown }).testEmit ===
      "function",
  );
  const orb = page.locator(".home-companion .companion");
  await expect(orb).toBeVisible();
  const gain = () =>
    orb.evaluate((el) =>
      Number(getComputedStyle(el).getPropertyValue("--wave-gain") || "1"),
    );
  const emit = (event: string, payload: unknown) =>
    page.evaluate(
      ([e, p]) =>
        (
          window as unknown as {
            testEmit: (e: string, p?: unknown) => Promise<void>;
          }
        ).testEmit(e as string, p),
      [event, payload] as const,
    );
  expect(await gain()).toBe(1);
  await emit("dock-state", "recording");
  for (let i = 0; i < 6; i++) await emit("mic-level", Array(16).fill(0.9));
  await expect.poll(gain).toBeGreaterThan(2);
});
