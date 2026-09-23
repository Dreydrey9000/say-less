import { test, expect } from "@playwright/test";

test("settings can be browsed without granting OS permissions or starting shortcuts", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?noPermissions=1");
  await page.getByRole("button", { name: "Browse settings first" }).click();
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await expect(
    page.getByText("You are browsing settings.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCommands: string[] }).testCommands.some(
        (cmd) =>
          cmd === "initialize_shortcuts" ||
          cmd === "initialize_enigo" ||
          cmd.includes("request_"),
      ),
    ),
  ).toBe(false);
});

test("rejected setting changes visibly roll back", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?failSetting=1");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Remove Filler Words" });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(
    page.getByText("Could not save this change.", { exact: false }),
  ).toBeVisible();
});

test("secondary settings fit narrow windows and enlarged text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto("/tests/fixtures/app.html");
  for (const name of ["Advanced", "About", "History", "Models"]) {
    await page.getByRole("button", { name, exact: true }).click();
    expect(
      await page
        .locator(".settings-content")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page.evaluate(() => (document.documentElement.style.fontSize = "30px"));
  expect(
    await page
      .locator(".settings-content")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

test("saved snippets survive navigation; preview, edit and removal work", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page.getByLabel("When I say", { exact: true }).fill("my booking link");
  await page
    .getByLabel("Insert this text", { exact: true })
    .fill("Book a time:\nhttps://example.com/book");
  await page.getByRole("button", { name: "Save snippet", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Snippets saved" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await expect(page.getByText("Book a time:", { exact: false })).toBeVisible();
  await page
    .getByLabel("Try a saved cue", { exact: true })
    .fill("my booking link");
  await page.getByRole("button", { name: "Preview result" }).click();
  await expect(page.locator("output")).toContainText("test IPC adapter");
  await page
    .getByRole("button", { name: "Edit my booking link", exact: true })
    .click();
  await expect(page.getByLabel("When I say", { exact: true })).toBeFocused();
  await page
    .getByLabel("Insert this text", { exact: true })
    .fill("Updated reply");
  await page.getByRole("button", { name: "Save snippet", exact: true }).click();
  await expect(page.getByText("Updated reply", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Remove my booking link", exact: true })
    .click();
  await expect(
    page.getByText("No snippets yet.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo removal" }).click();
  await expect(page.getByText("Updated reply", { exact: true })).toBeVisible();
});

test("failed save retains the draft; failed load cannot overwrite existing storage", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?failSave=1");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page.getByLabel("When I say", { exact: true }).fill("my reply");
  await page
    .getByLabel("Insert this text", { exact: true })
    .fill("Keep this draft");
  await page.getByRole("button", { name: "Save snippet", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not read or save");
  await expect(
    page.getByLabel("Insert this text", { exact: true }),
  ).toHaveValue("Keep this draft");
  await page.goto("/tests/fixtures/app.html?failLoad=1");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save snippet", exact: true }),
  ).toHaveCount(0);
});

for (const theme of ["dark", "light"]) {
  for (const width of [390, 680, 1200]) {
    test(`controls fit ${width}px in ${theme} theme and remain keyboard operable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.emulateMedia({
        reducedMotion: "reduce",
        colorScheme: theme as "dark" | "light",
      });
      await page.goto(`/tests/fixtures/app.html?theme=${theme}`);
      await expect(
        page.getByRole("heading", { name: "Dictation", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("combobox").first()).toBeVisible();
      await page.getByRole("combobox").first().focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Writing", exact: true }).focus();
      await page.keyboard.press("Enter");
      const toggle = page.getByRole("switch", { name: "Remove Filler Words" });
      await toggle.focus();
      await page.keyboard.press("Space");
      await expect(toggle).toBeChecked();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator(".settings-content")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/writing-${theme}-${width}.png`,
        fullPage: true,
      });
    });
  }
}

test("stalled audio enumeration falls back to the system device", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?stallDevices=1");
  const microphone = page.getByRole("combobox", {
    name: "Microphone",
    exact: true,
  });
  await expect(microphone).toBeEnabled({ timeout: 8000 });
  await expect(microphone).toHaveValue("Default");
});
