import { test, expect } from "@playwright/test";

// The 0.14.1 note has Mac-only and Windows-only parts, picked before the
// Markdown is rendered.

test("What's New on a Mac opens with the card picture and three steps", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?whatsNew");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("img", {
      name: "The recording card on Home, with the Record screen and Setup buttons",
    }),
  ).toBeVisible();
  const steps = dialog.locator("ol > li");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText("Start");
  await expect(steps.nth(1)).toContainText("Show your face");
  await expect(steps.nth(2)).toContainText("Open recordings folder");
  await expect(dialog.getByText("Reopen Say Less")).toBeVisible();
  await expect(dialog.getByText("coming to Windows soon")).toHaveCount(0);
  await expect(dialog).not.toContainText("<!--");
});

test("What's New on Windows leads with what works there", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?whatsNew&os=windows");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Screen recording is coming to Windows soon."),
  ).toBeVisible();
  await expect(dialog.getByText("Talk", { exact: true })).toBeVisible();
  // None of the Mac recording steps.
  await expect(
    dialog.getByRole("heading", { name: "Record your screen" }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("img")).toHaveCount(0);
  await expect(dialog.locator("ol")).toHaveCount(0);
  await expect(dialog.getByText("Show your face")).toHaveCount(0);
  await expect(dialog.getByText("Reopen Say Less")).toHaveCount(0);
  await expect(dialog).not.toContainText("<!--");
});
