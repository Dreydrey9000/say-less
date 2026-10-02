import { test, expect } from "@playwright/test";

for (const [words, time] of [
  [40, "1 min"],
  [2400, "1 h"],
  [2600, "1 h 5 min"],
] as const) {
  test(`Home explains ${words} dictated words without translation keys`, async ({
    page,
  }) => {
    await page.goto(`/tests/fixtures/app.html?statsWords=${words}`);
    const stats = page.getByTestId("home-stats");
    await expect(stats.getByRole("heading")).toHaveText(
      "Your dictation activity",
    );
    await expect(stats).toContainText("Words dictated");
    await expect(stats).toContainText(time);
    await expect(stats).toContainText("Estimated typing time saved");
    await expect(stats).toContainText("Daily streak");
    await expect(stats).toContainText("12 dictations");
    await expect(stats).toContainText("40 words per minute");
    await expect(stats).not.toContainText("home.stats.");
  });
}

test("Home hides usage statistics before the first dictation", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await expect(
    page.getByRole("heading", { name: "Speak. We'll type." }),
  ).toBeVisible();
  await expect(page.getByTestId("home-stats")).toHaveCount(0);
});
