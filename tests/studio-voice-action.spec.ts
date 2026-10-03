import { test, expect } from "@playwright/test";

const FRAME = 'iframe[title="Say Less Studio tools"]';

test("a spoken Create action opens the Studio on the page it names", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?events");
  await page.waitForFunction(() => "testEmit" in window);
  await page.evaluate(() =>
    (
      window as unknown as { testEmit: (e: string, p: string) => void }
    ).testEmit("open-create", "titles"),
  );
  await expect(
    page.getByRole("heading", { name: "Studio", exact: true }),
  ).toBeVisible();
  await expect(page.locator(FRAME)).toHaveAttribute("src", /#\/titles$/);

  // Already open: the next cue changes the page without reopening the Studio.
  await page.evaluate(() =>
    (
      window as unknown as { testEmit: (e: string, p: string) => void }
    ).testEmit("open-create", "library"),
  );
  await expect(page.locator(FRAME)).toHaveAttribute("src", /#\/library$/);
});
