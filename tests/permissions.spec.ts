import { test, expect } from "@playwright/test";

test("denied permission stops waiting and retains a recovery path", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/tests/fixtures/app.html?noPermissions=1");
  const card = page
    .getByRole("heading", { name: "Accessibility Access" })
    .locator("../..");
  await card.getByRole("button", { name: "Grant Permission" }).click();
  await expect(card.getByText("Waiting...", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Check again" })).toBeVisible();
  await page.clock.fastForward(16000);
  await expect(card.getByText("Waiting...", { exact: true })).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Grant Permission" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Permissions Required" }),
  ).toBeVisible();
});

for (const method of ["focus", "retry"]) {
  test(`permission granted externally is recognized by ${method}`, async ({
    page,
  }) => {
    await page.goto("/tests/fixtures/app.html?noPermissions=1");
    await expect(
      page.getByRole("heading", { name: "Permissions Required" }),
    ).toBeVisible();
    await page.evaluate(() =>
      sessionStorage.setItem("test-permissions", "granted"),
    );
    if (method === "focus")
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    else await page.getByRole("button", { name: "Check again" }).click();
    await expect(
      page.getByRole("button", { name: "General", exact: true }),
    ).toBeVisible();
  });
}

for (const width of [390, 1200]) {
  test(`permission recovery fits ${width}px and supports keyboard retry`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/fixtures/app.html?noPermissions=1");
    const retry = page.getByRole("button", { name: "Check again" });
    await retry.focus();
    await expect(retry).toBeFocused();
    await retry.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Permissions Required" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
