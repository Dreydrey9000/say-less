import { test, expect } from "@playwright/test";

test("insights shows the top problem, its quotes, and stays local by default", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByText(
      "Built from your dictation history on this computer. Nothing is uploaded.",
    ),
  ).toBeVisible();
  const fixFirst = page.getByRole("region", { name: "Fix this first" });
  await expect(fixFirst).toContainText("video export audio");
  await expect(fixFirst).toContainText("mentioned 27 times");
  await fixFirst.getByText("video export audio", { exact: true }).click();
  await expect(fixFirst).toContainText(
    "The video export audio is broken again",
  );
  await expect(
    page.getByText("Recurring ideas", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("grocery receipt", { exact: true }),
  ).toBeVisible();
  // No provider configured: AI summary is off, nothing was sent.
  await expect(
    page.getByRole("button", { name: "Summarize with AI" }),
  ).toBeDisabled();
  const calls = await page.evaluate(
    () => (window as unknown as { testCommands: string[] }).testCommands,
  );
  expect(calls).not.toContain("summarize_insights");
  expect(calls).not.toContain("export_notes_now");
  await page.getByRole("button", { name: "All time" }).click();
  await expect(page.getByRole("button", { name: "All time" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("insights search, notes export, and Claude setup", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await page.getByLabel("Search your dictations").fill("export");
  await expect(page.getByText("Export audio broke again")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Export notes nightly" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Export now" }).click();
  await expect(page.getByRole("status").last()).toContainText(
    "4 notes written",
  );
  await expect(
    page.getByText(
      'claude mcp add say-less -- "/Applications/Say Less.app/Contents/MacOS/handy" --mcp',
    ),
  ).toBeVisible();
});

test("insights explains when there is too little history", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?fewHistory=1");
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(page.getByText("Not enough history yet")).toBeVisible();
});
