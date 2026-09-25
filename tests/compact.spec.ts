import { test, expect } from "@playwright/test";
test.use({ deviceScaleFactor: 2 });

test("dock collapses to a small companion and expands without recording", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 112 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  await expect(
    page.getByRole("button", { name: "Record", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/dock-expanded-0.12.0.png" });
  await page.getByRole("button", { name: "Shrink to small dock" }).click();
  await page.setViewportSize({ width: 104, height: 104 });
  await expect(page.getByRole("button", { name: "Expand dock" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dock-compact-0.12.0.png",
    omitBackground: true,
  });
  await page.getByRole("button", { name: "Expand dock" }).focus();
  await page.keyboard.press("Enter");
  await page.setViewportSize({ width: 360, height: 112 });
  await expect(
    page.getByRole("button", { name: "Record", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCommands: string[] }).testCommands.includes(
        "dock_toggle_recording",
      ),
    ),
  ).toBe(false);
});

test("character choice persists and is visible in the compact dock", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("combobox", { name: "Dock look" }).selectOption("both");
  await page.getByRole("switch", { name: "Small dock" }).check();
  await page.goto("/tests/fixtures/app.html?dock=1");
  await page.setViewportSize({ width: 104, height: 104 });
  await expect(page.locator(".companion-buddy")).toBeVisible();
  await page.screenshot({
    path: "test-results/dock-character-0.12.0.png",
    omitBackground: true,
  });
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
