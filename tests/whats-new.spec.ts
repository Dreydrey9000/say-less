import { test, expect } from "@playwright/test";

// The 0.14.1 note has Mac-only and Windows-only parts, picked before the
// Markdown is rendered.

test("What's New on a Mac opens with the card picture and three steps", async ({
  page,
}) => {
  // The smallest window, so everything below must fit in the first view.
  await page.setViewportSize({ width: 680, height: 570 });
  await page.goto("/tests/fixtures/app.html?whatsNew");
  const dialog = page.getByRole("dialog");
  const picture = dialog.getByRole("img", {
    name: "The recording card on Home, with the Record screen and Setup buttons",
  });
  await expect(picture).toBeVisible();
  // Measure with the picture loaded, so it has its real height.
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const steps = dialog.locator("ol > li");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText("Start");
  await expect(steps.nth(1)).toContainText("Show your face");
  await expect(steps.nth(2)).toContainText("Open recordings folder");
  // The permission line is last, so if it is in view, so is all of the above.
  const permission = dialog.getByText("Reopen Say Less");
  await expect(permission).toBeInViewport({ ratio: 1 });
  // It also clears the 20px fade at the bottom of the dialog's scroll area.
  const [lineBottom, fadeTop] = await permission.evaluate((el) => {
    let area = el.parentElement;
    while (area && getComputedStyle(area).overflowY !== "auto") {
      area = area.parentElement;
    }
    const bottom = area ? area.getBoundingClientRect().bottom : 0;
    return [el.getBoundingClientRect().bottom, bottom - 20];
  });
  expect(lineBottom).toBeLessThanOrEqual(fadeTop);
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
