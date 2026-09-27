import { test, expect } from "@playwright/test";

// A first-time user has to find screen recording without scrolling or reading
// release notes. These cover the ways in added for 0.14.1.

test("Record your screen at the default window size brings the card into view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 680, height: 570 });
  await page.goto("/tests/fixtures/app.html");
  const jump = page.getByRole("button", { name: "Record your screen" });
  await expect(jump).toBeInViewport();
  await jump.click();
  await expect(page.locator("#home-record-title")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Record screen", exact: true }),
  ).toBeInViewport();
});

test("Record your screen hides while the whole card is on screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 680, height: 570 });
  await page.goto("/tests/fixtures/app.html");
  const jump = page.getByRole("button", { name: "Record your screen" });
  await expect(jump).toBeInViewport();
  // With the card fully in view the button would go nowhere.
  await page
    .getByTestId("screen-recording-card")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(jump).toHaveCount(0);
  // Scrolled back up, the card is below the fold again.
  await page
    .locator(".page-eyebrow")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(jump).toBeInViewport();
});

test("open-recording-home from another page lands on Home", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?events");
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(page.getByTestId("screen-recording-card")).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as { testEmit: (e: string, p?: unknown) => void }
    ).testEmit("open-recording-home"),
  );
  await expect(page.getByTestId("screen-recording-card")).toBeVisible();
});

test("What's New offers Try screen recording on a Mac that can record", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?whatsNew");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Got it" })).toBeVisible();
  await dialog.getByRole("button", { name: "Try screen recording" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("screen-recording-card")).toBeVisible();
});

test("What's New shows only Got it on Windows", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?whatsNew&os=windows");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Got it" })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Try screen recording" }),
  ).toHaveCount(0);
});

test("An older Mac explains how to check and update macOS", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?macos=old");
  const card = page.getByTestId("screen-recording-card");
  await expect(card).toContainText("macOS 15 (Sequoia) or newer");
  await expect(card).toContainText("About This Mac");
  const record = card.getByRole("button", {
    name: "Record screen",
    exact: true,
  });
  await expect(record).toBeDisabled();
  // Same notice as the denied state: a short bold lead, then the steps, and
  // a grey button instead of a dimmed lime one.
  await expect(card.locator(".home-record-notice strong")).toHaveText(
    "Screen recording needs macOS 15 (Sequoia) or newer.",
  );
  await expect(record).not.toHaveClass(/accent-action/);
  // One click to Software Update, opened once even on a double-click.
  const update = card.getByRole("button", { name: "Open Software Update" });
  await update.dblclick();
  const opened = () =>
    page.evaluate(
      () =>
        (window as unknown as { testCommands: string[] }).testCommands.filter(
          (c) => c === "open_software_update",
        ).length,
    );
  await expect.poll(opened).toBe(1);
  await page.waitForTimeout(300);
  expect(await opened()).toBe(1);
  // It opened, so there is nothing to explain.
  await expect(card.getByRole("alert")).toHaveCount(0);
  // The icon sits beside the first line, not the middle of the paragraph,
  // and the button starts under the text.
  const icon = (await card.locator(".home-record-notice > svg").boundingBox())!;
  const text = (await card.locator("#home-record-reason").boundingBox())!;
  expect(Math.abs(icon.y + icon.height / 2 - (text.y + 10))).toBeLessThan(2);
  expect((await update.boundingBox())!.x).toBeCloseTo(text.x, 0);
});

test("An older Mac says so when Software Update won't open", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?macos=old&update=fail");
  const card = page.getByTestId("screen-recording-card");
  const update = card.getByRole("button", { name: "Open Software Update" });
  // The ignored second click of a double-click doesn't clear the message.
  await update.dblclick();
  const error = card.getByRole("alert");
  await expect(error).toHaveText(
    "We couldn't open Software Update. Follow the steps above to open it yourself.",
  );
  await page.waitForTimeout(300);
  await expect(error).toBeVisible();
  // It lines up with the text above it.
  const text = (await card.locator("#home-record-reason").boundingBox())!;
  expect((await error.boundingBox())!.x).toBeCloseTo(text.x, 0);
});
