import { test, expect } from "@playwright/test";

test("dock loads a saved language before showing its controls", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?dock=1&language=es");
  await expect(page.getByRole("button", { name: "Hablar" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});
test.use({ deviceScaleFactor: 2 });

test("dock collapses to a small companion and expands without recording", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  await expect(
    page.getByRole("button", { name: "Talk", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/dock-expanded-0.12.0.png" });
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.setViewportSize({ width: 104, height: 104 });
  const emblem = page.getByRole("button", {
    name: "Expand dock",
  });
  await expect(emblem).toBeVisible();
  await expect(page.locator(".compact-grip")).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(page.locator(".compact-rail")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dock-compact-0.12.0.png",
    omitBackground: true,
  });
  await page.keyboard.press("Tab");
  await expect(emblem).toBeFocused();
  await page.setViewportSize({ width: 220, height: 104 });
  await expect(page.locator(".compact-rail")).toBeVisible();
  await page.keyboard.press("Enter");
  await page.setViewportSize({ width: 460, height: 112 });
  await expect(
    page.getByRole("button", { name: "Talk", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCommands: string[] }).testCommands.includes(
        "dock_toggle_recording",
      ),
    ),
  ).toBe(false);
});

test("dragging the emblem moves the compact dock without expanding it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&snap=bottom_right");
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.setViewportSize({ width: 220, height: 104 });
  const emblem = page.getByRole("button", {
    name: "Expand dock",
  });
  const box = await emblem.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 18, y + 8, { steps: 3 });
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("test-studio") ?? "{}").dock_edge,
      ),
    )
    .toBe("bottom_right");
  await expect(page.locator(".compact-dock")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Talk", exact: true }),
  ).toHaveCount(0);
  await emblem.click();
  await expect(
    page.getByRole("button", { name: "Talk", exact: true }),
  ).toBeVisible();
});

test("small dock can be hidden without expanding it", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("switch", { name: "Show floating dock" }).check();
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.setViewportSize({ width: 104, height: 104 });
  await page.getByRole("button", { name: "Expand dock" }).hover();
  await page.setViewportSize({ width: 220, height: 104 });
  await page.getByRole("button", { name: "Hide floating dock" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("test-studio") ?? "{}").floating,
      ),
    )
    .toBe(false);
});

test("small dock becomes a status island for real dictation states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&events=1");
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.setViewportSize({ width: 220, height: 104 });
  const emit = (state: string) =>
    page.evaluate(
      (value) =>
        (
          window as unknown as {
            testEmit: (event: string, value: string) => Promise<void>;
          }
        ).testEmit("dock-state", value),
      state,
    );
  await expect(page.locator(".compact-dock")).toHaveAttribute(
    "data-phase",
    "idle",
  );
  await emit("recording");
  await expect(page.locator(".compact-dock")).toHaveAttribute(
    "data-phase",
    "listening",
  );
  await expect(page.locator(".compact-phase-label")).toContainText("Starting");
  await page.evaluate(() =>
    (
      window as unknown as {
        testEmit: (event: string, value: null) => Promise<void>;
      }
    ).testEmit("recording-ready", null),
  );
  await expect(page.locator(".compact-phase-label")).toHaveText("Listening");
  await expect
    .poll(() =>
      page
        .locator(".compact-companion")
        .evaluate((button) => Math.round(button.getBoundingClientRect().width)),
    )
    .toBe(128);
  await page.screenshot({
    path: "test-results/dock-island-listening.png",
    omitBackground: true,
  });
  await emit("transcribing");
  await expect(page.locator(".compact-phase-label")).toHaveText("Working");
  await page.screenshot({
    path: "test-results/dock-island-working.png",
    omitBackground: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".compact-phase-icon")
      .evaluate((icon) => getComputedStyle(icon).animationName),
  ).toBe("none");
  await expect(page.getByRole("button", { name: "Expand dock" })).toBeVisible();
  await emit("idle");
  await expect(page.locator(".compact-dock")).toHaveAttribute(
    "data-phase",
    "idle",
  );
  await expect(page.getByRole("button", { name: "Expand dock" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("small dock shows a saved action only after screen recording finishes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&screen=recording");
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.setViewportSize({ width: 220, height: 104 });
  await expect(page.locator(".compact-dock")).toHaveAttribute(
    "data-phase",
    "screen",
  );
  await page.getByRole("button", { name: "Stop screen recording" }).click();
  await expect(page.locator(".compact-dock")).toHaveAttribute(
    "data-phase",
    "saved",
  );
  await expect(page.locator(".compact-phase-label")).toHaveText("Saved.");
  await page.screenshot({
    path: "test-results/dock-island-saved.png",
    omitBackground: true,
  });
});

test("character choice persists and is visible in the compact dock", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("radio", { name: "Buddy with particles" }).check();
  await page.getByRole("switch", { name: "Small dock" }).check();
  await page.goto("/tests/fixtures/app.html?dock=1");
  await page.setViewportSize({ width: 104, height: 104 });
  await expect(page.locator(".companion-buddy")).toBeVisible();
  await page.screenshot({
    path: "test-results/dock-character-0.12.0.png",
    omitBackground: true,
  });
});

test("compact actions form one inward rail and close after the pointer leaves", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Dock placement" })
    .selectOption("bottom_right");
  await page.getByRole("switch", { name: "Small dock" }).check();
  await page.setViewportSize({ width: 104, height: 104 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  const emblem = page.getByRole("button", { name: "Expand dock" });
  await expect(page.locator(".compact-rail")).toHaveCount(0);
  await emblem.hover();
  await page.setViewportSize({ width: 220, height: 104 });
  const rail = page.locator(".compact-rail");
  await expect(rail).toBeVisible();
  const railBox = await rail.boundingBox();
  const emblemBox = await emblem.boundingBox();
  expect(railBox!.x).toBeLessThan(emblemBox!.x);
  const buttons = await rail.locator("button").evaluateAll((nodes) =>
    nodes.map((node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      radius: getComputedStyle(node).borderRadius,
    })),
  );
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.radius).toBe("0px");
  }
  await page.getByRole("button", { name: "Hide floating dock" }).hover();
  const tip = page
    .getByRole("tooltip")
    .filter({ hasText: "Hide floating dock" });
  await expect(tip).toBeVisible();
  const tipBox = await tip.boundingBox();
  expect(tipBox!.x).toBeGreaterThanOrEqual(0);
  expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(220);
  expect(tipBox!.y + tipBox!.height).toBeLessThanOrEqual(104);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/dock-attached-rail.png",
    omitBackground: true,
  });
  await page.mouse.move(0, 0);
  await expect(rail).toHaveCount(0);
  await page.setViewportSize({ width: 104, height: 104 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("keyboard focus reveals and reaches the compact action rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Expand dock" })).toBeFocused();
  await page.setViewportSize({ width: 220, height: 104 });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Record screen", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Hide floating dock" }),
  ).toBeFocused();
});

test("observed corrections can be kept and removed", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?learned=1");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page
    .getByRole("button", { name: "Enable local correction learning" })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop watching corrections" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Observed once", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Keep now" }).click();
  await expect(page.getByText("Applied to future dictation")).toBeVisible();
  await page
    .getByRole("button", { name: "Remove learned correction for Louise" })
    .click();
  await expect(
    page.getByText("No corrections observed yet.", { exact: false }),
  ).toBeVisible();
});

test("failed learning save remains visible and retains the observation", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?learned=1&failLearning=1");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page.getByRole("button", { name: "Keep now" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not load or save learned corrections",
  );
  await expect(page.getByText("Observed once", { exact: false })).toBeVisible();
});
