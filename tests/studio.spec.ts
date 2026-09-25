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
  await page.getByLabel("Custom hex color", { exact: true }).fill("#000000");
  await page.getByRole("button", { name: "Apply color" }).click();
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--studio-on-accent"),
    ),
  ).toBe("#ffffff");
  await page.getByRole("button", { name: "Show dock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hide dock", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByLabel("Custom hex color", { exact: true }),
  ).toHaveValue("#000000");
  await expect(
    page.getByRole("button", { name: "Hide dock", exact: true }),
  ).toBeVisible();
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
  await page.setViewportSize({ width: 360, height: 96 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  await expect(
    page.getByRole("button", { name: "Record", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= 360),
  ).toBe(true);
  await page.screenshot({ path: "test-results/floating-dock.png" });
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
