import { test, expect, type Page } from "@playwright/test";

const card = (page: Page) => page.getByTestId("screen-recording-card");
const commands = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { testCommands: string[] }).testCommands,
  );

async function openSetup(page: Page, url = "/tests/fixtures/app.html") {
  await page.goto(url);
  const toggle = card(page).getByRole("button", { name: "Recording setup" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("region", { name: "Recording setup" });
  await expect(panel).toBeVisible();
  return panel;
}

test("setup opens from the Record button and shows the 8GB-friendly defaults", async ({
  page,
}) => {
  const panel = await openSetup(page);
  await expect(
    panel.getByRole("combobox", { name: "Record", exact: true }),
  ).toHaveValue("display");
  await expect(
    panel.getByRole("switch", { name: "Your microphone" }),
  ).toBeChecked();
  await expect(
    panel.getByRole("switch", { name: "Computer sound" }),
  ).toBeChecked();
  await expect(
    panel.getByRole("switch", { name: "Show your face" }),
  ).not.toBeChecked();
  await expect(
    panel.getByRole("combobox", { name: "Picture size" }),
  ).toHaveValue("p1080");
  await expect(
    panel.getByRole("combobox", { name: "Frames per second" }),
  ).toHaveValue("30");
  // One click still records with the saved setup.
  await expect(
    card(page).getByRole("button", { name: "Record screen" }),
  ).toBeEnabled();
});

test("changes save right away and survive a reload", async ({ page }) => {
  let panel = await openSetup(page);
  await panel.getByRole("switch", { name: "Computer sound" }).uncheck();
  await panel
    .getByRole("combobox", { name: "Picture size" })
    .selectOption("p720");
  await panel
    .getByRole("combobox", { name: "Frames per second" })
    .selectOption("60");
  expect(
    (await commands(page)).filter((c) => c === "save_recording_options").length,
  ).toBe(3);
  panel = await openSetup(page);
  await expect(
    panel.getByRole("switch", { name: "Computer sound" }),
  ).not.toBeChecked();
  await expect(
    panel.getByRole("combobox", { name: "Picture size" }),
  ).toHaveValue("p720");
  await expect(
    panel.getByRole("combobox", { name: "Frames per second" }),
  ).toHaveValue("60");
  // The microphone picker hides with the microphone.
  await expect(
    panel.getByRole("combobox", { name: "Microphone" }),
  ).toBeVisible();
  await panel.getByRole("switch", { name: "Your microphone" }).uncheck();
  await expect(panel.getByRole("combobox", { name: "Microphone" })).toHaveCount(
    0,
  );
});

test("webcam shows a live preview and remembers its corner and size", async ({
  page,
}) => {
  let panel = await openSetup(page);
  await panel.getByRole("switch", { name: "Show your face" }).check();
  const bubble = panel.getByTestId("webcam-bubble-preview");
  await expect(bubble).toHaveAttribute("data-corner", "bottom_right");
  await expect(bubble).toHaveAttribute("data-size", "medium");
  // Live frames from the camera fill the circle.
  await expect(bubble.locator("img")).toHaveAttribute("src", /^data:image/);
  await panel.getByRole("radio", { name: "Top left" }).check();
  await panel.getByRole("radio", { name: "Large" }).check();
  await expect(bubble).toHaveAttribute("data-corner", "top_left");
  await expect(bubble).toHaveAttribute("data-size", "large");
  await expect(
    panel.getByRole("img", { name: /Position: Top left/ }),
  ).toBeVisible();
  // Arrow keys move between corners, like any radio group.
  await panel.getByRole("radio", { name: "Top left" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(bubble).toHaveAttribute("data-corner", "top_right");
  panel = await openSetup(page);
  await expect(
    panel.getByRole("switch", { name: "Show your face" }),
  ).toBeChecked();
  await expect(panel.getByTestId("webcam-bubble-preview")).toHaveAttribute(
    "data-corner",
    "top_right",
  );
  await expect(panel.getByRole("radio", { name: "Large" })).toBeChecked();
  // Turning the camera off stops the preview.
  await panel.getByRole("switch", { name: "Show your face" }).uncheck();
  await expect(panel.getByTestId("webcam-bubble-preview")).toHaveCount(0);
  expect(await commands(page)).toContain("stop_camera_preview");
});

test("one window: picks an open window and names it", async ({ page }) => {
  const panel = await openSetup(page);
  await panel
    .getByRole("combobox", { name: "Record", exact: true })
    .selectOption("window");
  const window = panel.getByRole("combobox", { name: "Window" });
  await expect(window).toHaveValue("11");
  await expect(window.locator("option:checked")).toHaveText(
    "Safari: Start page",
  );
  await window.selectOption("12");
  await expect(window.locator("option:checked")).toHaveText("Notes");
});

test("a second screen can be picked", async ({ page }) => {
  const panel = await openSetup(page, "/tests/fixtures/app.html?displays=2");
  const screen = panel.getByRole("combobox", { name: "Screen" });
  await expect(screen).toHaveValue("1");
  await expect(screen.locator("option:checked")).toHaveText(
    "Built-in Display (main)",
  );
  await screen.selectOption("2");
  await expect(screen).toHaveValue("2");
});

test("denied camera explains the fix and opens System Settings", async ({
  page,
}) => {
  const panel = await openSetup(page, "/tests/fixtures/app.html?camera=denied");
  await panel.getByRole("switch", { name: "Show your face" }).check();
  const alert = panel.getByRole("alert");
  await expect(alert).toContainText("System Settings");
  await alert.getByRole("button", { name: "Open System Settings" }).click();
  expect(await commands(page)).toContain("open_camera_settings");
  expect(await commands(page)).not.toContain("start_camera_preview");
});

test("a closed window says so and offers the setup", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?screen=window");
  await card(page).getByRole("button", { name: "Record screen" }).click();
  const alert = card(page).getByRole("alert");
  await expect(alert).toContainText("The window you picked is closed.");
  await alert.getByRole("button", { name: "Recording setup" }).click();
  await expect(
    page.getByRole("region", { name: "Recording setup" }),
  ).toBeVisible();
});

test("Windows shows the setup, disabled, with the same plain reason", async ({
  page,
}) => {
  const panel = await openSetup(page, "/tests/fixtures/app.html?os=windows");
  await expect(panel).toContainText(
    "Screen recording is coming to Windows soon.",
  );
  await expect(
    panel.getByRole("switch", { name: "Your microphone" }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("switch", { name: "Show your face" }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("combobox", { name: "Picture size" }),
  ).toBeDisabled();
  expect(await commands(page)).not.toContain("save_recording_options");
});

test("dock opens Recording setup in the main window", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?dock=1");
  const setup = page.getByRole("button", { name: "Recording setup" });
  await setup.focus();
  await expect(
    page.getByRole("tooltip", { name: "Recording setup" }),
  ).toBeVisible();
  await setup.click();
  await expect
    .poll(async () =>
      (await commands(page)).includes("show_main_window_command"),
    )
    .toBe(true);
  // The request goes to the main window as an app event.
  expect(await commands(page)).toContain("plugin:event|emit");
});
