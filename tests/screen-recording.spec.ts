import { test, expect } from "@playwright/test";

const card = (page: import("@playwright/test").Page) =>
  page.getByTestId("screen-recording-card");

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
  await expect(home.getByRole("status")).toContainText("Saved.");
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
  await button.click();
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
