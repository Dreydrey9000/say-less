import { test, expect } from "@playwright/test";

for (const width of [390, 680, 1200]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`dock gallery scrolls within the page at ${width}px in ${colorScheme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto("/tests/fixtures/app.html");
      await page
        .getByRole("button", { name: "Appearance", exact: true })
        .click();
      const gallery = page.getByRole("radiogroup", { name: "Dock look" });
      await expect(gallery.getByRole("radio")).toHaveCount(5);
      await expect(gallery.locator(".companion.is-paused")).toHaveCount(5);
      const metrics = await gallery.evaluate((el) => ({
        width: el.clientWidth,
        content: el.scrollWidth,
        tops: Array.from(el.children).map(
          (card) => card.getBoundingClientRect().top,
        ),
      }));
      expect(new Set(metrics.tops).size).toBe(1);
      if (width < 1200) expect(metrics.content).toBeGreaterThan(metrics.width);
      const avatar = gallery.getByRole("radio", {
        name: "Your avatar (talks when you do)",
      });
      await avatar.check();
      await expect(avatar).toBeChecked();
      if (metrics.content > metrics.width) {
        await expect
          .poll(() => gallery.evaluate((el) => el.scrollLeft))
          .toBeGreaterThan(0);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.reload();
      await page
        .getByRole("button", { name: "Appearance", exact: true })
        .click();
      await expect(
        page.getByRole("radio", { name: "Your avatar (talks when you do)" }),
      ).toBeChecked();
    });
  }
}

test("dock gallery supports arrow-key selection and scrolls the focused card into view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const gallery = page.getByRole("radiogroup", { name: "Dock look" });
  const names = [
    "Say Less emblem",
    "Buddy (animated)",
    "Buddy with particles",
    "Your avatar (talks when you do)",
  ];
  await gallery.getByRole("radio", { name: names[0], exact: true }).focus();
  for (let i = 1; i < names.length; i++) {
    await page.keyboard.press("ArrowRight");
    const radio = gallery.getByRole("radio", { name: names[i], exact: true });
    await expect(radio).toBeChecked();
    await expect(radio).toBeEnabled();
    await expect(radio).toBeFocused();
  }
  expect(await gallery.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test("a failed gallery save retains the previous selection and reports the error", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?failStudio=1");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("radio", { name: "Buddy with particles" }).click();
  await expect(
    page.getByRole("radio", { name: "Say Less emblem" }),
  ).toBeChecked();
  await expect(page.getByRole("alert")).toBeVisible();
});
