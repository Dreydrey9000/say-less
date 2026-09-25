import { test, expect } from "@playwright/test";

for (const width of [390, 1200])
  for (const theme of ["dark", "light"]) {
    test(`home is usable at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tests/fixtures/app.html?theme=${theme}`);
      await expect(
        page.getByRole("heading", { name: "Speak. We'll type." }),
      ).toBeVisible();
      const dock = page.getByRole("button", { name: "Show floating dock" });
      await dock.focus();
      await expect(dock).toBeFocused();
      await dock.press("Enter");
      await expect(page.getByRole("status")).toContainText(
        "The floating dock is showing",
      );
      expect(
        await page
          .locator(".settings-content")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/home-${width}-${theme}.png`,
      });
      await page
        .getByRole("button", { name: "Change your look", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Floating dock" }),
      ).toBeVisible();
    });
  }

test("companion choice, edge and pause persist", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Helix", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Dock placement" })
    .selectOption("right");
  await page.getByRole("switch", { name: "Pause animations" }).check();
  await page.reload();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Helix", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("combobox", { name: "Dock placement" }),
  ).toHaveValue("right");
  await expect(
    page.getByRole("switch", { name: "Pause animations" }),
  ).toBeChecked();
  expect(
    await page
      .locator(".particle-world")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});

test("reduced motion keeps particles static even when cycling is selected", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Show floating dock" }).click();
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem("test-studio")!);
    localStorage.setItem(
      "test-studio",
      JSON.stringify({ ...settings, dock_cycle: true }),
    );
  });
  await page.reload();
  await expect(page.locator(".companion.is-paused")).toBeVisible();
  expect(
    await page
      .locator(".particle-world")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});

test("history failure has a working retry and home supports enlarged text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tests/fixtures/app.html?failHistory=1");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("historyRecovered", "yes"));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => (document.documentElement.style.fontSize = "30px"));
  expect(
    await page
      .locator(".settings-content")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

test("normal dictation cleanup preference survives restart", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page
    .getByRole("button", { name: "Use AI cleanup for normal dictation" })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use local formatting only" }),
  ).toBeVisible();
});

test("name corrections persist and duplicates cannot silently replace a rule", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page.getByLabel("When it hears").fill("Louis");
  await page.getByLabel("Use this spelling").fill("Louise");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await expect(page.getByText("Louis → Louise", { exact: true })).toBeVisible();
  await page.getByLabel("When it hears").fill("Louis");
  await page.getByLabel("Use this spelling").fill("Wrong");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "already has a correction",
  );
});

test("dock shows switchable companion and remains usable at 360px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 132 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  await page.getByRole("button", { name: "Switch particle pattern" }).click();
  await expect(page.locator(".formation-helix")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/companion-dock.png" });
});
