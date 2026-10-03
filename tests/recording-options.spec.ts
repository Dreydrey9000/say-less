import { test, expect, type Page } from "@playwright/test";

const card = (page: Page) => page.getByTestId("screen-recording-card");
const commands = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { testCommands: string[] }).testCommands,
  );

test("camera shape previews immediately and persists with keyboard support", async ({
  page,
}) => {
  let panel = await openSetup(page);
  await panel.getByRole("switch", { name: "Show your face" }).check();
  const bubble = panel.getByTestId("webcam-bubble-preview");
  await expect(
    panel.getByRole("radio", { name: "Circle", exact: true }),
  ).toBeChecked();
  await expect(bubble).toHaveCSS("border-radius", "50%");
  await panel.getByRole("radio", { name: "Square", exact: true }).check();
  await expect(bubble).toHaveCSS("border-radius", "0px");
  await expect(panel.getByRole("img", { name: /Shape: Square/ })).toBeVisible();
  await expect(bubble).toHaveAttribute("data-corner", "bottom_right");
  await expect(bubble).toHaveAttribute("data-size", "medium");
  panel = await openSetup(page);
  const square = panel.getByRole("radio", { name: "Square", exact: true });
  await expect(square).toBeChecked();
  await square.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(panel.getByTestId("webcam-bubble-preview")).toHaveCSS(
    "border-radius",
    "50%",
  );
});

test("changing shape while recording saves without interrupting capture", async ({
  page,
}) => {
  const panel = await openSetup(
    page,
    "/tests/fixtures/app.html?screen=recording",
  );
  await panel.getByRole("switch", { name: "Show your face" }).check();
  await panel.getByRole("radio", { name: "Square", exact: true }).check();
  const seen = await commands(page);
  expect(seen).toContain("save_recording_options");
  expect(seen).not.toContain("start_screen_recording");
  expect(seen).not.toContain("stop_screen_recording");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("test-recording") || "{}").webcam_shape,
    ),
  ).toBe("square");
});

async function openSetup(page: Page, url = "/tests/fixtures/app.html") {
  await page.goto(url);
  const toggle = card(page).getByRole("button", { name: "Recording setup" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false", {
    timeout: 15000,
  });
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
    panel.getByRole("switch", { name: "Record your voice" }),
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
    panel.getByRole("combobox", { name: "Which microphone" }),
  ).toBeVisible();
  await panel.getByRole("switch", { name: "Record your voice" }).uncheck();
  await expect(
    panel.getByRole("combobox", { name: "Which microphone" }),
  ).toHaveCount(0);
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

test("clicking a switch's title flips the switch", async ({ page }) => {
  const panel = await openSetup(page);
  const face = panel.getByRole("switch", { name: "Show your face" });
  // The card's Show my face falls back to this switch by its id.
  await expect(face).toHaveAttribute("id", "rec-setup-webcam");
  await panel.getByText("Show your face", { exact: true }).click();
  await expect(face).toBeChecked();
  await panel.getByText("Computer sound", { exact: true }).click();
  await expect(
    panel.getByRole("switch", { name: "Computer sound" }),
  ).not.toBeChecked();
});

test("wide setup stacks Camera right under What we record", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  const panel = await openSetup(page);
  const box = async (name: string) => {
    const found = await panel
      .getByRole("group", { name, exact: true })
      .boundingBox();
    if (!found) throw new Error(`${name} is not on screen`);
    return found;
  };
  const what = await box("What we record");
  const camera = await box("Camera");
  const sound = await box("Sound");
  const quality = await box("Quality");
  // Two columns: Sound sits to the right of What we record.
  expect(sound.x).toBeGreaterThan(what.x + what.width);
  // Each column stacks with only the normal 16px gap, no hole.
  expect(camera.x).toBe(what.x);
  expect(camera.y - (what.y + what.height)).toBeLessThanOrEqual(17);
  expect(quality.x).toBe(sound.x);
  expect(quality.y - (sound.y + sound.height)).toBeLessThanOrEqual(17);
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
  // Refused before, so macOS shows no prompt: straight to the fix.
  await expect(alert).toContainText(
    "We need Camera permission to show your face. Turn on Say Less in System Settings",
  );
  await alert.getByRole("button", { name: "Open System Settings" }).click();
  await expect
    .poll(async () => (await commands(page)).includes("open_camera_settings"))
    .toBe(true);
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

test("dock opens Recording setup in the main window", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?dock=1");
  // The camera icon says what it opens, so it doesn't read as "record video",
  // and whether your face is on.
  const label = "Recording setup: camera and sound, your face is off";
  const setup = page.getByRole("button", { name: label, exact: true });
  await setup.focus();
  await expect(page.getByRole("tooltip", { name: label })).toBeVisible();
  await setup.click();
  await expect
    .poll(async () =>
      (await commands(page)).includes("show_main_window_command"),
    )
    .toBe(true);
  // The request goes to the main window as an app event.
  expect(await commands(page)).toContain("plugin:event|emit");
});
