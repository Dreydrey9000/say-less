import { test, expect } from "@playwright/test";
test("appearance persists custom color, contrast and floating preference", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Candy pink", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Candy pink", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("textbox", { name: "Custom hex color", exact: true })
    .fill("#000000");
  await page.getByRole("button", { name: "Apply color" }).click();
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--studio-on-accent"),
    ),
  ).toBe("#ffffff");
  const dock = page.getByRole("switch", { name: "Show floating dock" });
  await dock.check();
  await expect(dock).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Custom hex color", exact: true }),
  ).toHaveValue("#000000");
  await expect(
    page.getByRole("switch", { name: "Show floating dock" }),
  ).toBeChecked();
});
test("failed appearance save keeps the saved color", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?failStudio=1");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Candy pink", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not load or save");
  await expect(
    page.getByRole("button", { name: "Acid lime", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("actions save a specific app and surface launch failures", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?failAction=1");
  await page
    .getByRole("button", { name: "Voice actions", exact: true })
    .click();
  await page.getByLabel("After “Say Less”, say").fill("open notes");
  await page
    .getByLabel("Destination", { exact: true })
    .selectOption("/System/Applications/Notes.app");
  await page.getByRole("button", { name: "Save action", exact: true }).click();
  await expect(
    page.getByText("“Say Less, open notes”", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enable voice actions" }).click();
  await page.getByRole("button", { name: "Open now", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Could not open");
});
test("import previews before writing and history is opt-in", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Find Wispr on this Mac" }).click();
  await expect(
    page.getByText("1 word · 1 snippet or correction · 1 skipped"),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCommands: string[] }).testCommands.includes(
        "apply_wispr_import",
      ),
    ),
  ).toBe(false);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Import reviewed items" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Imported 1 word, 1 snippet or correction, and 2 history records.",
  );
  await page.getByRole("button", { name: "Browse imported history" }).click();
  await expect(page.getByText("Imported example only")).toBeVisible();
});
test("source read failure cannot import", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?failImport=1");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Find Wispr on this Mac" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not read");
  await expect(
    page.getByRole("button", { name: "Import reviewed items" }),
  ).toHaveCount(0);
});
test("writing styles persist app-specific rules", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page
    .getByLabel("Default writing style", { exact: true })
    .selectOption("formal");
  await page.getByLabel("App name", { exact: true }).fill("Slack");
  await page.getByLabel("Style", { exact: true }).selectOption("casual");
  await page.getByRole("button", { name: "Save app style" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await expect(page.getByText("Slack · Less punctuation")).toBeVisible();
});
for (const width of [390, 1200])
  test(`new controls fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/fixtures/app.html");
    for (const name of ["Appearance", "Voice actions", "Import"]) {
      await page.getByRole("button", { name, exact: true }).click();
      expect(
        await page
          .locator(".settings-content")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      if (name === "Appearance")
        await page.screenshot({ path: `test-results/studio-${width}.png` });
    }
  });

test("floating dock renders controls without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 96 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  await expect(
    page.getByRole("button", { name: "Talk", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= 460),
  ).toBe(true);
  // The Talk and Screen labels fit inside their pills, not over each other.
  await expect(
    page.getByRole("button", { name: "Record screen" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".floating-bar .dock-record, .floating-bar .dock-screen")
      .evaluateAll((els) =>
        els.every((el) => el.scrollWidth <= el.clientWidth + 1),
      ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/floating-dock.png" });
});

test("double-clicking Stop in the dock saves once and starts nothing new", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording");
  await page.getByRole("button", { name: "Stop screen recording" }).dblclick();
  const start = page.getByRole("button", { name: "Record screen" });
  await expect(start).toHaveAttribute("aria-disabled", "true");
  // The pause looks like a normal button, not a broken one.
  expect(
    await start.evaluate((el) => {
      const style = getComputedStyle(el);
      return [el.getAttribute("aria-disabled"), style.opacity, style.cursor];
    }),
  ).toEqual(["true", "1", "pointer"]);
  await expect(page.getByRole("status")).toContainText("Saved.");
  await expect(
    page.getByRole("button", { name: "Show in Finder" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCommands: string[] }).testCommands.includes(
        "start_screen_recording",
      ),
    ),
  ).toBe(false);
  // The pause is short. After it, one click records again.
  await expect(start).not.toHaveAttribute("aria-disabled", "true");
  await start.click();
  await expect(
    page.getByRole("button", { name: "Stop screen recording" }),
  ).toBeVisible();
});

test("after Stop, the dock keeps the Screen tooltip off the Saved line", async ({
  page,
}) => {
  // No fade, so a tooltip that would show is there right away.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording");
  const stop = page.getByRole("button", { name: "Stop screen recording" });
  await stop.hover();
  await expect(
    page.getByRole("tooltip", { name: "Stop screen recording" }),
  ).toBeVisible();
  await stop.click();
  const tip = page.getByRole("tooltip", { name: "Record screen" });
  await expect(tip).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Show in Finder" }),
  ).toBeVisible();
  // Once the pointer leaves, the tooltip works again.
  await page.mouse.move(0, 0);
  await page.getByRole("button", { name: "Record screen" }).hover();
  await expect(tip).toBeVisible();
});

test("the Screen tooltip comes back when the pointer left while saving", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording&holdStop");
  // WebKit sends no pointer events to a disabled button, so the pointer
  // leaving while the video saves goes unseen. Hide those leaves here too.
  await page.evaluate(() =>
    window.addEventListener("pointerout", (e) => e.stopPropagation(), true),
  );
  const stop = page.getByRole("button", { name: "Stop screen recording" });
  await stop.click();
  await expect(stop).toBeDisabled();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => "testFinishStop" in window);
  await page.evaluate(() =>
    (window as unknown as { testFinishStop: () => void }).testFinishStop(),
  );
  await expect(page.getByRole("status")).toContainText("Saved.");
  await page.getByRole("button", { name: "Record screen" }).hover();
  await expect(
    page.getByRole("tooltip", { name: "Record screen" }),
  ).toBeVisible();
});

test("while the screen records, the dock's Talk mic still says Talk", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 460, height: 112 });
  // Idle: the pill shows its word, so no tooltip repeats it.
  await page.goto("/tests/fixtures/app.html?dock=1");
  const idleTalk = page.getByRole("button", { name: "Talk", exact: true });
  await idleTalk.hover();
  await expect(page.locator(".dock-record-anchor .sl-tip")).toBeHidden();
  await page.mouse.move(0, 0);

  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording");
  const talk = page.getByRole("button", {
    name: "Talk: type with your voice",
    exact: true,
  });
  const tip = page.getByRole("tooltip", { name: "Talk: type with your voice" });
  await talk.focus();
  await expect(tip).toBeVisible();
  await talk.blur();
  await expect(tip).toBeHidden();
  await talk.hover();
  await expect(tip).toBeVisible();
  // Stop is a filled square, so it doesn't read as a checkbox.
  await expect(page.locator(".dock-screen.is-live svg")).toHaveAttribute(
    "fill",
    "currentColor",
  );
});

test("while the screen records, the dock keeps the Talk word when it fits", async ({
  page,
}) => {
  const talk = page.getByRole("button", {
    name: "Talk: type with your voice",
    exact: true,
  });
  // Whether the word sits whole inside the pill, and whether the pill
  // itself stays inside its own width.
  const look = () =>
    talk.evaluate((pill) => {
      const word = pill.querySelector("span")!;
      const box = pill.getBoundingClientRect();
      const text = word.getBoundingClientRect();
      return {
        wordShown:
          text.top >= box.top &&
          text.bottom <= box.bottom + 0.5 &&
          word.scrollWidth <= word.clientWidth,
        pillFits: pill.scrollWidth <= pill.clientWidth + 1,
      };
    });
  // With room to spare, the word stays.
  await page.setViewportSize({ width: 640, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording");
  await expect(talk).toHaveText("Talk");
  await expect.poll(look).toEqual({ wordShown: true, pillFits: true });
  // Squeezed, the word drops out whole instead of showing "Ta...".
  await page.setViewportSize({ width: 430, height: 112 });
  await expect.poll(look).toEqual({ wordShown: false, pillFits: true });
});

test("the dock keeps Saved and Show in Finder until you close it", async ({
  page,
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording");
  await page.getByRole("button", { name: "Stop screen recording" }).click();
  const status = page.getByRole("status");
  const finder = page.getByRole("button", { name: "Show in Finder" });
  await expect(status).toContainText("Saved.");
  await expect(finder).toBeVisible();
  // Well past the old 12 second limit, the way to the video is still there.
  await page.clock.fastForward(15_000);
  await expect(status).toContainText("Saved.");
  await expect(finder).toBeVisible();
  const close = page.getByRole("button", {
    name: "Close this message",
    exact: true,
  });
  // Both buttons are at least 24px square to hit, and the line stays 18px.
  for (const button of [finder, close]) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
  expect(Math.round((await status.boundingBox())!.height)).toBe(18);
  // The small X closes it, and the usual hint comes back.
  await close.click();
  await expect(finder).toHaveCount(0);
  await expect(status).toHaveText(
    "Click Talk to type with your voice, or Screen to record a video",
  );
});

test("starting to talk clears the dock's Saved line for good", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording&events");
  await page.waitForFunction(() => "testEmit" in window);
  const sendDockState = (state: string) =>
    page.evaluate(
      (payload) =>
        (
          window as unknown as {
            testEmit: (event: string, payload?: unknown) => Promise<void>;
          }
        ).testEmit("dock-state", payload),
      state,
    );
  await page.getByRole("button", { name: "Stop screen recording" }).click();
  const finder = page.getByRole("button", { name: "Show in Finder" });
  await expect(finder).toBeVisible();
  // The dock is listening for dictation before we send it.
  await page.waitForFunction(
    () =>
      ((window as unknown as { testListeners: Record<string, number> })
        .testListeners["dock-state"] ?? 0) > 0,
  );
  await sendDockState("recording");
  await expect(finder).toHaveCount(0);
  // When dictation ends, the usual hint shows, not the old Saved line.
  await sendDockState("idle");
  await expect(page.getByRole("status")).toHaveText(
    "Click Talk to type with your voice, or Screen to record a video",
  );
  await expect(finder).toHaveCount(0);
});

test("while the screen records, the dock's X waits for Stop", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording");
  const saves = () =>
    page.evaluate(
      () =>
        (window as unknown as { testCommands: string[] }).testCommands.filter(
          (c) => c === "save_studio_settings",
        ).length,
    );
  const why = "To hide the dock, stop the recording first.";
  const hide = page.getByRole("button", { name: why, exact: true });
  await expect(hide).toHaveAttribute("aria-disabled", "true");
  expect(await hide.evaluate((el) => getComputedStyle(el).cursor)).toBe(
    "not-allowed",
  );
  // Playwright won't click an aria-disabled button, so use the keyboard: it
  // stays focusable, says why, and does nothing.
  const before = await saves();
  await hide.focus();
  await expect(page.getByRole("tooltip", { name: why })).toBeVisible();
  await page.keyboard.press("Enter");
  expect(await saves()).toBe(before);
  // Once the video is saved, the X hides the dock again.
  await page.getByRole("button", { name: "Stop screen recording" }).click();
  const idleHide = page.getByRole("button", {
    name: "Hide floating dock",
    exact: true,
  });
  await expect(idleHide).not.toHaveAttribute("aria-disabled", "true");
  await idleHide.click();
  await expect.poll(saves).toBe(before + 1);
});

test("while the screen records, the dock's Stop leads in the card's red", async ({
  page,
}) => {
  // Transitions finish first, so we read the color at rest.
  const fill = (locator: import("@playwright/test").Locator) =>
    locator.evaluate((el) => {
      el.getAnimations().forEach((animation) => animation.finish());
      return getComputedStyle(el).backgroundColor;
    });
  await page.goto("/tests/fixtures/app.html?screen=recording");
  const cardRed = await fill(
    page
      .getByTestId("screen-recording-card")
      .getByRole("button", { name: "Stop screen recording" }),
  );
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  const talk = page.locator(".floating-bar .dock-record");
  // Idle: Talk is the filled pill in your color.
  await expect(
    page.getByRole("button", { name: "Talk", exact: true }),
  ).toBeVisible();
  expect(await fill(talk)).toBe("rgb(184, 255, 101)");
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording");
  const stop = page.getByRole("button", { name: "Stop screen recording" });
  await expect(stop).toBeVisible();
  // Recording: Talk steps back to an outline, and Stop is the card's red.
  expect(await fill(talk)).toBe("rgba(0, 0, 0, 0)");
  expect(await fill(stop)).toBe(cardRed);
});

test("the dock's camera button shows whether your face is on", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  const off = page.getByRole("button", {
    name: "Recording setup: camera and sound, your face is off",
    exact: true,
  });
  await expect(off).toHaveAttribute("data-face", "off");
  expect(await off.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    "rgba(0, 0, 0, 0)",
  );
  // Turn on Show your face in the saved setup, as the main window does.
  await page.evaluate(() =>
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
  await page.reload();
  const faceOn = "Recording setup: camera and sound, your face is on";
  const on = page.getByRole("button", { name: faceOn, exact: true });
  await expect(on).toHaveAttribute("data-face", "on");
  const look = () =>
    on.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        fill: style.backgroundColor,
        ring: style.borderTopColor,
        shadow: style.boxShadow,
      };
    });
  // A 2px ring in your color, not a fill.
  const lit = await look();
  expect(lit.fill).toBe("rgba(0, 0, 0, 0)");
  expect(lit.ring).toBe("rgb(184, 255, 101)");
  expect(lit.shadow).toContain("rgb(184, 255, 101)");
  expect(lit.shadow).toContain("inset");
  await on.focus();
  await expect(page.getByRole("tooltip", { name: faceOn })).toBeVisible();
  // While the screen records, Stop stays the only filled pill.
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording");
  await expect(
    page.getByRole("button", { name: "Stop screen recording" }),
  ).toBeVisible();
  await expect(on).toHaveAttribute("data-face", "on");
  expect((await look()).fill).toBe("rgba(0, 0, 0, 0)");
  // On the light theme the ring uses your color's darker twin, so it still
  // shows against the light dock.
  await page.goto("/tests/fixtures/app.html?dock=1&theme=light");
  await expect(on).toHaveAttribute("data-face", "on");
  const light = await look();
  expect(light.ring).not.toBe("rgb(184, 255, 101)");
  expect(light.ring).not.toBe("rgba(0, 0, 0, 0)");
});

test("update archive includes the real feature image", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "About", exact: true }).click();
  await page.getByText("Version 0.10.0", { exact: true }).click();
  const image = page.getByAltText(
    "Say Less Appearance with color presets and floating dock control",
  );
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
});
