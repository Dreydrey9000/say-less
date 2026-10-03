import { test, expect, type Page } from "@playwright/test";

const footer = (page: Page) => page.locator(".border-t").last();
const calls = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { testCommands: string[] }).testCommands,
  );

test("downloads once automatically, waits for the user, then installs and relaunches", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?updater=available");
  const restart = footer(page).getByRole("button", {
    name: "Restart to update",
  });
  await expect(restart).toBeVisible();
  expect(
    (await calls(page)).filter((c) => c === "plugin:updater|download"),
  ).toHaveLength(1);
  expect(await calls(page)).not.toContain("plugin:updater|install");
  await page.getByRole("button", { name: "Later", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(restart).toBeVisible();
  expect(
    (await calls(page)).filter((c) => c === "plugin:updater|download"),
  ).toHaveLength(1);
  await restart.click();
  await expect.poll(() => calls(page)).toContain("plugin:process|restart");
  const commands = await calls(page);
  expect(commands.indexOf("plugin:updater|install")).toBeLessThan(
    commands.indexOf("plugin:process|restart"),
  );
  expect(commands).not.toContain("plugin:updater|download_and_install");
});

for (const activity of [
  "updateDictation=recording",
  "updateDictation=transcribing",
  "updateScreen=starting",
  "updateScreen=recording",
  "updateScreen=stopping",
]) {
  test(`restart waits for ${activity}`, async ({ page }) => {
    await page.goto(`/tests/fixtures/app.html?updater=available&${activity}`);
    await footer(page)
      .getByRole("button", { name: "Restart to update" })
      .click();
    await expect(
      page.getByText(
        "Finish dictation or screen recording before restarting to update.",
      ),
    ).toBeVisible();
    expect(await calls(page)).not.toContain("plugin:updater|install");
    expect(await calls(page)).not.toContain("plugin:process|restart");
  });
}

test("failed download can be retried without installing automatically", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?updater=available&downloadFails=1");
  await footer(page).getByRole("button", { name: "Update now" }).click();
  await expect(
    footer(page).getByRole("button", { name: "Restart to update" }),
  ).toBeVisible();
  expect(
    (await calls(page)).filter((c) => c === "plugin:updater|download"),
  ).toHaveLength(2);
  expect(await calls(page)).not.toContain("plugin:updater|install");
});

for (const query of ["", "?updater=available&updatesLocked=1"]) {
  test(`disabled updater does no network work: ${query || "preference off"}`, async ({
    page,
  }) => {
    await page.goto(`/tests/fixtures/app.html${query}`);
    await expect(
      footer(page).getByRole("button", { name: "Updates off" }),
    ).toBeDisabled();
    expect(await calls(page)).not.toContain("plugin:updater|check");
    expect(await calls(page)).not.toContain("plugin:updater|download");
  });
}

test("portable install keeps the manual download path", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?updater=available&portable=1");
  await footer(page).getByRole("button", { name: "Update now" }).click();
  await expect(
    page.getByRole("heading", { name: "Manual update required" }),
  ).toBeVisible();
  expect(await calls(page)).not.toContain("plugin:updater|download");
  expect(await calls(page)).not.toContain("plugin:updater|install");
});

test("turning updates off discards an in-flight download; turning on checks again", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?updater=available&holdDownload=1");
  await expect.poll(() => calls(page)).toContain("plugin:updater|download");
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Automatic updates" });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.evaluate(() =>
    (
      window as unknown as { finishUpdateDownload: () => void }
    ).finishUpdateDownload(),
  );
  await expect.poll(() => calls(page)).toContain("plugin:resources|close");
  await expect(
    footer(page).getByRole("button", { name: "Updates off" }),
  ).toBeDisabled();
  expect(await calls(page)).not.toContain("plugin:updater|install");
  await toggle.click();
  await expect
    .poll(
      async () =>
        (await calls(page)).filter((c) => c === "plugin:updater|download")
          .length,
    )
    .toBe(2);
  await page.evaluate(() =>
    (
      window as unknown as { finishUpdateDownload: () => void }
    ).finishUpdateDownload(),
  );
  await expect(
    footer(page).getByRole("button", { name: "Restart to update" }),
  ).toBeVisible();
});

test("failed install never relaunches and lets the user download again", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?updater=available&installFails=1");
  await footer(page).getByRole("button", { name: "Restart to update" }).click();
  await expect(
    footer(page).getByRole("button", { name: "Update now" }),
  ).toBeVisible();
  expect(await calls(page)).not.toContain("plugin:process|restart");
});
