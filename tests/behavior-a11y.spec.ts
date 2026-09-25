import { test, expect, type Page } from "@playwright/test";

type TestWindow = {
  testCommands: string[];
  testListeners: Record<string, number>;
  testEmit: (event: string, payload?: unknown) => Promise<void>;
};

const calls = (page: Page, cmd: string) =>
  page.evaluate(
    (name) =>
      (window as unknown as TestWindow).testCommands.filter((c) => c === name)
        .length,
    cmd,
  );

async function openSection(page: Page, name: string, query = "") {
  await page.goto(`/tests/fixtures/app.html${query}`);
  await page.getByRole("button", { name, exact: true }).click();
}

test("the shortcut chip is a keyboard button that announces capture and Escape cancels", async ({
  page,
}) => {
  await openSection(page, "Shortcuts & mic");
  const row = page.getByRole("group", {
    name: "Talk shortcut",
    exact: true,
  });
  // The chip's name changes while recording, so find it by its row.
  const chip = row.locator("[data-shortcut-chip]");
  await expect(chip).toHaveAccessibleName(
    /^Change Talk shortcut\. Now set to .*Option/,
  );
  await chip.focus();
  await expect(chip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Press the new keys, Escape to cancel." }),
  ).toHaveCount(1);
  await expect(chip).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("status").filter({ hasText: "Shortcut change cancelled." }),
  ).toHaveCount(1);
  expect(await calls(page, "change_binding")).toBe(0);
  await expect(chip).toContainText("Option");

  // Capture a real combination from the keyboard alone.
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Press the new keys, Escape to cancel." }),
  ).toHaveCount(1);
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.keyboard.down("K");
  await page.keyboard.up("K");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
  await expect.poll(() => calls(page, "change_binding")).toBe(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Shortcut saved" }),
  ).toHaveCount(1);
});

test("mutating buttons ignore a second click while the first is saving", async ({
  page,
}) => {
  await openSection(page, "Import");
  await page.getByRole("button", { name: "Find Wispr on this Mac" }).click();
  const importButton = page.getByRole("button", {
    name: "Import reviewed items",
  });
  await expect(importButton).toBeEnabled();
  await importButton.evaluate((el: HTMLElement) => {
    el.click();
    el.click();
  });
  await expect(page.getByRole("status")).toContainText("Imported");
  expect(await calls(page, "apply_wispr_import")).toBe(1);

  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page.getByLabel("When I say", { exact: true }).fill("double tap");
  await page.getByLabel("Insert this text", { exact: true }).fill("Once only");
  await page
    .getByRole("button", { name: "Save snippet", exact: true })
    .evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
  await expect(
    page.getByRole("status").filter({ hasText: "Snippets saved" }),
  ).toBeVisible();
  expect(await calls(page, "save_voice_snippets")).toBe(1);

  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await page
    .getByRole("button", { name: "Export now" })
    .evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
  await expect(page.getByText("4 notes written")).toBeVisible();
  expect(await calls(page, "export_notes_now")).toBe(1);
});

test("a duplicate snippet cue marks the field and moves focus to it", async ({
  page,
}) => {
  await openSection(page, "Writing");
  const cue = page.getByLabel("When I say", { exact: true });
  const text = page.getByLabel("Insert this text", { exact: true });
  const save = page.getByRole("button", { name: "Save snippet", exact: true });
  await cue.fill("sig dup");
  await text.fill("First");
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Snippets saved" }),
  ).toBeVisible();
  await cue.fill("SIG DUP");
  await text.fill("Second");
  await save.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(cue).toHaveAttribute("aria-invalid", "true");
  await expect(cue).toBeFocused();
  await expect(cue).toHaveValue("SIG DUP");
});

test("a history load failure says so and retries, instead of showing empty", async ({
  page,
}) => {
  await openSection(page, "History", "?failHistory=1");
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Couldn't load your history." });
  await expect(alert).toBeVisible();
  await expect(page.getByText("No transcriptions yet.")).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem("historyRecovered", "yes"));
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(alert).toHaveCount(0);
  await expect(page.getByText("No transcriptions yet.")).toBeVisible();
});

test("copy buttons confirm on the first press and never open the website", async ({
  page,
}) => {
  await openSection(page, "About");
  const share = page.getByRole("button", { name: "Copy link" });
  await share.click();
  await expect(
    page.getByRole("button", { name: "Copied!", exact: true }),
  ).toBeVisible();
  expect(await calls(page, "plugin:clipboard-manager|write_text")).toBe(1);
  expect(await calls(page, "plugin:opener|open_url")).toBe(0);
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible({
    timeout: 4000,
  });

  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await page.getByText("For developers: setup commands").click();
  await page
    .getByRole("button", { name: /^Copy / })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Copied" }),
  ).toHaveCount(1);
});

test("a section change starts at the top and focuses the new screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await openSection(page, "Insights");
  const scroller = page.locator(".settings-content > div").first();
  await scroller.evaluate((el) => (el.scrollTop = 700));
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await page
    .getByRole("button", { name: "Shortcuts & mic", exact: true })
    .click();
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("#main-content"),
    ),
  ).toBe(true);

  // Home tiles land focus on the new screen's heading too.
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page
    .getByRole("button", { name: "Change your look", exact: true })
    .click();
  expect(
    await page.evaluate(() => document.activeElement?.tagName ?? ""),
  ).toMatch(/^H[12]$/);
});

test("a skip link jumps past the sidebar", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  // Wait for the app to render before the first Tab.
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("#main-content"),
    ),
  ).toBe(true);
});

test("Escape closes the model popover and returns focus", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  const pill = page.getByRole("button", { name: /^Speech model:/ });
  await pill.click();
  await expect(pill).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Manage models" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pill).toHaveAttribute("aria-expanded", "false");
  await expect(pill).toBeFocused();
});

test("voice action websites are validated and removal can be undone", async ({
  page,
}) => {
  await openSection(page, "Voice actions");
  await page.getByLabel("After “Say Less”, say").fill("book");
  await page.getByLabel("Action type").selectOption("website");
  const target = page.getByLabel("Destination", { exact: true });
  await target.fill("calendly dot com");
  await page.getByRole("button", { name: "Save action", exact: true }).click();
  await expect(target).toHaveAttribute("aria-invalid", "true");
  await expect(target).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("website address");
  expect(await calls(page, "save_studio_settings")).toBe(0);

  await target.fill("calendly.com/you");
  await page.getByRole("button", { name: "Save action", exact: true }).click();
  await expect(page.getByText("https://calendly.com/you")).toBeVisible();
  await page.getByRole("button", { name: /^Remove / }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Action removed." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo removal" }).click();
  await expect(page.getByText("https://calendly.com/you")).toBeVisible();
});

test("an invalid custom color explains why Apply is off", async ({ page }) => {
  await openSection(page, "Appearance");
  const input = page.getByRole("textbox", {
    name: "Custom hex color",
    exact: true,
  });
  await input.fill("banana");
  await expect(
    page.getByRole("button", { name: "Apply color" }),
  ).toBeDisabled();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Use # and six letters or numbers"),
  ).toBeVisible();
});

test("the volume slider has a name", async ({ page }) => {
  await openSection(page, "Shortcuts & mic");
  await expect(page.getByRole("slider", { name: "Volume" })).toBeVisible();
});

test("dock icon buttons are named, big enough and show a tooltip on focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  const settings = page.getByRole("button", { name: "Open settings" });
  await expect(settings).toBeVisible();
  // Reach it with the keyboard, so :focus-visible applies.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    if (await settings.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(settings).toBeFocused();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Open settings" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Open settings" }),
  ).toBeHidden();
  const sizes = await page
    .locator(".floating-bar button:not(.dock-grip)")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  for (const width of sizes) expect(width).toBeGreaterThanOrEqual(32);

  // Expanding from the compact dock keeps keyboard focus in the dock.
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.setViewportSize({ width: 104, height: 104 });
  const expand = page.getByRole("button", { name: "Expand dock" });
  await expect(expand).toBeFocused();
  await page.keyboard.press("Enter");
  await page.setViewportSize({ width: 360, height: 112 });
  await expect(
    page.getByRole("button", { name: "Shrink to small dock" }),
  ).toBeFocused();
});

async function openOverlay(page: Page, query = "") {
  await page.setViewportSize({ width: 420, height: 160 });
  await page.goto(`/tests/fixtures/app.html?overlay=1${query}`);
  await page.waitForFunction(() => "testEmit" in window);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as TestWindow).testListeners["hide-overlay"],
      ),
    )
    .toBe(1);
  // Strict Mode registers, releases and re-registers; let that settle.
  await page.waitForTimeout(250);
}

test("overlay listeners are released after Strict Mode's double mount", async ({
  page,
}) => {
  await openOverlay(page);
  // Let every async registration settle, then each event has one listener.
  await page.waitForTimeout(300);
  const live = await page.evaluate(
    () => (window as unknown as TestWindow).testListeners,
  );
  for (const event of [
    "show-overlay",
    "hide-overlay",
    "recording-ready",
    "mic-level",
  ])
    expect(live[event], event).toBe(1);
});

test("a hide during a slow show keeps the overlay closed", async ({ page }) => {
  await openOverlay(page, "&slowSettings=1");
  await page.evaluate(async () => {
    const emit = (window as unknown as TestWindow).testEmit;
    await emit("show-overlay", "recording");
    await emit("hide-overlay");
  });
  // Both settings reads take 300ms; give the stale show time to finish.
  await page.waitForTimeout(1100);
  await expect(page.locator(".scard")).toHaveCount(0);
});

test("overlay says what it is doing, and its controls are big enough", async ({
  page,
}) => {
  await openOverlay(page);
  await page.evaluate(async () => {
    const emit = (window as unknown as TestWindow).testEmit;
    await emit("show-overlay", "recording");
  });
  const live = page.locator(".ov-sr[role=status]");
  await expect(live).toHaveText("Starting…");
  await page.evaluate(() =>
    (window as unknown as TestWindow).testEmit("recording-ready"),
  );
  await expect(live).toHaveText("Listening");
  await expect(page.locator(".sstatus")).toHaveText("Listening");
  const cancel = page.getByRole("button", { name: "Cancel recording" });
  const box = await cancel.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
  // Silent bars keep a low resting shape instead of lying flat.
  const barHeights = () =>
    page
      .locator(".swave i")
      .evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().height)),
      );
  await expect
    .poll(async () => new Set(await barHeights()).size)
    .toBeGreaterThan(1);
  await page.evaluate(() =>
    (window as unknown as TestWindow).testEmit("show-overlay", "transcribing"),
  );
  await expect(live).toHaveText("Transcribing...");
});

test("the overlay avatar is 40px with 8px clearance in the pill", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("test-studio") || "{}");
    localStorage.setItem(
      "test-studio",
      JSON.stringify({ ...saved, overlay_visual: "avatar" }),
    );
  });
  await openOverlay(page);
  await page.evaluate(async () => {
    const emit = (window as unknown as TestWindow).testEmit;
    await emit("show-overlay", "recording");
    await emit("recording-ready");
  });
  const box = await page.locator(".savatar").boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(40);
  expect(Math.round(box?.height ?? 0)).toBe(40);
  // Room above and below inside the 56px control row.
  const row = await page.locator(".sbase").boundingBox();
  expect(box!.y - row!.y).toBeGreaterThanOrEqual(7.5);
  expect(row!.y + row!.height - (box!.y + box!.height)).toBeGreaterThanOrEqual(
    7.5,
  );
});

test("reduced motion holds the overlay bars still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openOverlay(page);
  await page.evaluate(async () => {
    const emit = (window as unknown as TestWindow).testEmit;
    await emit("show-overlay", "recording");
    await emit("recording-ready");
  });
  await expect(page.locator(".swave.ready")).toBeVisible();
  const bars = page.locator(".swave i");
  const heights = () =>
    bars.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().height),
    );
  const still = await heights();
  await page.evaluate(async () => {
    const emit = (window as unknown as TestWindow).testEmit;
    for (let i = 0; i < 6; i++) await emit("mic-level", Array(16).fill(0.9));
  });
  await page.waitForTimeout(200);
  expect(await heights()).toEqual(still);
  expect(
    await bars
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});
