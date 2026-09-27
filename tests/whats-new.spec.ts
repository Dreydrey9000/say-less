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
  // It reads as a picture, not live buttons: framed, narrower than the text,
  // deaf to clicks, and captioned right under it.
  const look = await picture.evaluate((img) => {
    const frame = img.parentElement!;
    const text = frame.parentElement!;
    return {
      pointerEvents: getComputedStyle(img).pointerEvents,
      frameWidth: frame.getBoundingClientRect().width,
      textWidth: text.getBoundingClientRect().width,
      frameBorder: getComputedStyle(frame).borderTopWidth,
    };
  });
  expect(look.pointerEvents).toBe("none");
  expect(look.frameBorder).toBe("1px");
  expect(look.frameWidth).toBeLessThanOrEqual(look.textWidth * 0.8 + 1);
  const caption = dialog.getByText("This is on Home.", { exact: true });
  await expect(caption).toBeVisible();
  const [pictureBottom, captionTop] = await Promise.all([
    picture.evaluate((el) => el.getBoundingClientRect().bottom),
    caption.evaluate((el) => el.getBoundingClientRect().top),
  ]);
  expect(captionTop).toBeGreaterThanOrEqual(pictureBottom);
  expect(captionTop - pictureBottom).toBeLessThan(12);
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
  // One picture: the dock's Talk button, not the Mac recording card.
  await expect(dialog.getByRole("img")).toHaveCount(1);
  const dock = dialog.getByRole("img", {
    name: "The floating dock with its Talk button",
  });
  await expect(dock).toBeVisible();
  await expect
    .poll(() => dock.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // It shows at the dock's real size, half the pixels of the Retina shot,
  // not stretched to fill the frame.
  expect(
    await dock.evaluate((img) => Math.round(img.getBoundingClientRect().width)),
  ).toBe(195);
  await expect(dialog.getByText("This is the floating dock.")).toBeVisible();
  // Plain words for the avatar line, no "recording pill".
  await expect(dialog).toContainText("the bubble that shows while you talk");
  await expect(dialog).not.toContainText("recording pill");
  await expect(dialog.locator("ol")).toHaveCount(0);
  await expect(dialog.getByText("Show your face")).toHaveCount(0);
  await expect(dialog.getByText("Reopen Say Less")).toHaveCount(0);
  await expect(dialog).not.toContainText("<!--");
});

test("What's New moves keyboard focus into the dialog, onto Got it", async ({
  page,
}) => {
  for (const query of ["whatsNew", "whatsNew&os=windows"]) {
    await page.goto(`/tests/fixtures/app.html?${query}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Got it", exact: true }),
    ).toBeFocused();
    // Tab stays inside the dialog from there.
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
});
