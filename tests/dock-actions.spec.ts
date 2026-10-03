import { test, expect } from "@playwright/test";
test.use({ deviceScaleFactor: 2 });

test("the small dock's open rail shows the first four voice actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1&dockActions=1");
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.setViewportSize({ width: 104, height: 104 });
  await expect(page.locator(".compact-rail")).toHaveCount(0);

  // Keyboard focus opens the rail, the same as hovering over it does.
  await page.keyboard.press("Tab");
  await page.setViewportSize({ width: 396, height: 104 });
  const actions = page.locator(".compact-voice-action");
  await expect(actions).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "make an image" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "title ideas" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "my recordings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "read my screens" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "my library" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dock-small-actions.png",
    omitBackground: true,
  });

  await page.getByRole("button", { name: "title ideas" }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCommands: string[] }).testCommands.includes(
        "test_voice_action",
      ),
    ),
  ).toBe(true);
});

test("the small dock's rail has no action buttons when voice actions are off", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.setViewportSize({ width: 104, height: 104 });
  await page.keyboard.press("Tab");
  await page.setViewportSize({ width: 220, height: 104 });
  await expect(page.locator(".compact-rail")).toBeVisible();
  await expect(page.locator(".compact-voice-action")).toHaveCount(0);
});
