import { test, expect } from "@playwright/test";

test("the dock look is one control, and particle patterns only show when they apply", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Appearance", level: 1 }),
  ).toBeVisible();
  const look = page.getByRole("combobox", { name: "Dock look" });
  await expect(look).toHaveCount(1);
  await expect(page.getByText("Companion style")).toHaveCount(0);
  // Exactly one pattern reads as chosen.
  await expect(
    page.locator('.formation-grid > button[aria-pressed="true"]'),
  ).toHaveCount(1);
  await look.selectOption("buddy");
  await expect(page.locator(".formation-grid")).toHaveCount(0);
  await expect(page.getByText("This look has no particles")).toBeVisible();
  // Pause is a switch with one fixed name, set in one place.
  await expect(
    page.getByRole("switch", { name: "Pause animations" }),
  ).toHaveCount(1);
});

for (const [mode, instruction, absent] of [
  [
    "toggle",
    "Press to start. Press again to finish.",
    "Hold to talk. Let go to finish.",
  ],
  [
    "push_to_talk",
    "Hold to talk. Let go to finish.",
    "Press to start. Press again to finish.",
  ],
] as const) {
  test(`home shows only the ${mode} instruction`, async ({ page }) => {
    await page.goto(`/tests/fixtures/app.html?mode=${mode}`);
    await expect(
      page.getByRole("heading", { name: "Speak. We'll type." }),
    ).toBeVisible();
    const main = page.getByTestId("home-instruction");
    await expect(main).toContainText(instruction);
    await expect(main).toContainText("Option + Space");
    await expect(page.getByText(absent)).toHaveCount(0);
    // Fn is the headline Mac feature, so it stays out in the open.
    await expect(page.getByText("or hold Fn to talk")).toBeVisible();
    // No empty key caps anywhere on Home.
    for (const text of await page.locator("kbd").allTextContents())
      expect(text.trim()).not.toBe("");
    await expect(
      page.getByRole("button", { name: "Share Say Less" }),
    ).toBeVisible();
  });
}

test("onboarding recommends one engine, then guides a first dictation", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?newUser=1");
  await expect(
    page.getByRole("heading", { name: "Parakeet Unified" }),
  ).toBeVisible();
  // Permissions were already granted, so setup is two steps.
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  // Exactly one main action: the engine already here needs no download.
  await expect(page.locator(".accent-action")).toHaveCount(1);
  await expect(page.locator(".accent-action")).toHaveText("Use this engine");
  await expect(
    page.getByRole("button", { name: "Download (600 MB)" }),
  ).toBeVisible();
  // Every engine here scores the same, so the bars would say nothing.
  await expect(page.getByText("accuracy", { exact: true })).toHaveCount(0);
  for (const other of ["Canary Flash", "Whisper Small", "Moonshine Tiny"])
    await expect(page.getByRole("heading", { name: other })).toHaveCount(0);
  await page.getByRole("button", { name: "See other engines (3)" }).click();
  await expect(
    page.getByRole("heading", { name: "Whisper Small" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Use this engine" }).click();
  await expect(
    page.getByRole("heading", { name: "Try it once" }),
  ).toBeVisible();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await expect(
    page.getByText("Press Globe key to", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Practice box").fill("This is faster than typing.");
  await expect(page.getByRole("status")).toContainText("It works the same");
  await page.getByRole("button", { name: "Start using Say Less" }).click();
  await expect(
    page.getByRole("button", { name: "Shortcuts & mic", exact: true }),
  ).toBeVisible();
});

test("about says Say Less and credits Handy", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByText("Built on Handy (MIT license)")).toBeVisible();
  await expect(page.getByText("Support Handy", { exact: true })).toBeVisible();
  await expect(page.getByText("Help us continue building Handy")).toHaveCount(
    0,
  );
  // Theme lives in Appearance only.
  await expect(page.getByRole("combobox", { name: "Theme" })).toHaveCount(0);
});

test("each setting has one home and duplicates point to it", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Remove Filler Words" }),
  ).toHaveCount(0);
  await expect(page.getByText("Shortcut not found")).toHaveCount(0);
  await page.getByRole("button", { name: "Open Writing" }).click();
  await expect(
    page.getByRole("switch", { name: "Remove Filler Words" }),
  ).toBeVisible();
  // AI cleanup is always reachable, so hints that point there never dead-end.
  await page.getByRole("button", { name: "AI cleanup", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Use AI cleanup" }),
  ).toBeVisible();
  await expect(
    page.getByText("sends your transcript text (never audio)", {
      exact: false,
    }),
  ).toBeVisible();
});
