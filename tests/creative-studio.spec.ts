import { test, expect } from "@playwright/test";
import path from "node:path";

test("Studio opens inside the app and exposes all five tools", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: {
        refs: [],
        recent: [],
        recordings: [],
        history: [],
        items: [],
        total: 0,
        drive: { ok: false, error: "" },
      },
    }),
  );
  await page.route("**/app/studio.js", (route) =>
    route.fulfill({
      path: path.resolve("bridge/ui/studio.js"),
      contentType: "text/javascript",
    }),
  );
  await page.route("**/app/studio.css", (route) =>
    route.fulfill({
      path: path.resolve("bridge/ui/studio.css"),
      contentType: "text/css",
    }),
  );
  await page.goto("/tests/fixtures/app.html?version=0.14.12");
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Studio", exact: true }),
  ).toBeVisible();
  const studio = page.frameLocator('iframe[title="Say Less Studio tools"]');
  for (const name of ["Create", "Titles", "Videos", "Screens", "Library"]) {
    await expect(
      studio.locator("#nav").getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  await page.getByText("Studio connections", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save connections" }),
  ).toBeVisible();
  await expect(
    page.getByLabel(
      "Upload recordings automatically while Say Less is running",
    ),
  ).not.toBeChecked();
  await page.getByText("Studio connections", { exact: true }).click();
  await page.screenshot({ path: "public/release-notes/0.14.12/studio.png" });
});

test("failed startup explains recovery and provides retry", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?studioFails");
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Studio could not open");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your saved files are unchanged",
  );
});

test("updating waits for active Studio jobs", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?updater=available&studioBusy");
  await page
    .getByRole("button", { name: "Restart to update", exact: true })
    .last()
    .click();
  await expect(
    page.getByText(
      "Finish or cancel your Studio jobs before restarting to update.",
    ),
  ).toBeVisible();
  const calls = await page.evaluate(
    () => (window as unknown as { testCommands: string[] }).testCommands,
  );
  expect(calls).not.toContain("plugin:updater|install");
  expect(calls).not.toContain("plugin:process|restart");
});

for (const width of [390, 1280]) {
  test(`Studio shell fits at ${width}px and remains keyboard accessible`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/fixtures/app.html?studioFails");
    await page.getByRole("button", { name: "Studio", exact: true }).click();
    const retry = page.getByRole("button", { name: "Try again" });
    await retry.focus();
    await expect(retry).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
