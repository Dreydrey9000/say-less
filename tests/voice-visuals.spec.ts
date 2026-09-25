import { test, expect, type Page } from "@playwright/test";

/** The fixture exposes Tauri's mocked `emit` as `window.testEmit` in overlay mode. */
type TestWindow = {
  testEmit: (event: string, payload?: unknown) => Promise<void>;
};

async function openAppearance(page: Page, query = "") {
  await page.goto(`/tests/fixtures/app.html${query}`);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Voice visuals" }),
  ).toBeVisible();
}

function studio(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("test-studio") || "null"),
  );
}

test("voice visuals default to bars and the avatar builder persists", async ({
  page,
}) => {
  await openAppearance(page);
  await expect(
    page.getByRole("button", { name: "Bars", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Companion style")).toHaveValue("emblem");

  const squiggle = page.getByRole("button", { name: "Squiggle", exact: true });
  await squiggle.focus();
  await expect(squiggle).toBeFocused();
  await squiggle.press("Space");
  await expect(squiggle).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Cat", exact: true }).click();
  await page.getByLabel("Accessory", { exact: true }).selectOption("crown");
  await page.getByLabel("Background", { exact: true }).fill("#335577");
  await expect(
    page.getByRole("img", { name: "Avatar preview: Cat with Crown" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await studio(page))?.avatar)
    .toMatchObject({ kind: "cat", accessory: "crown", background: "#335577" });

  await page.getByLabel("Companion style").selectOption("avatar");
  await expect
    .poll(async () => (await studio(page))?.dock_character)
    .toBe("avatar");
  await page.reload();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Squiggle", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Cat", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Accessory", { exact: true })).toHaveValue(
    "crown",
  );
  await expect(page.getByLabel("Companion style")).toHaveValue("avatar");
  // A face would hide the formation, so the picker previews each one on the orb.
  await expect(
    page.locator(".formation-grid .companion.character-orb").first(),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/voice-visuals-builder.png" });
});

test("Test makes the avatar talk, then it closes its mouth", async ({
  page,
}) => {
  await openAppearance(page);
  const preview = page.locator(".avatar-preview svg.avatar");
  const mouth = preview.locator(".avatar-mouth");
  await expect(preview).toHaveAttribute("data-mouth", "0");
  // One persistent mouth path that morphs, never a line swapped for an oval.
  await expect(mouth).toHaveCount(1);
  expect(await mouth.evaluate((el) => el.tagName)).toBe("path");
  const closed = await mouth.getAttribute("d");
  await page.getByRole("button", { name: "Test the voice" }).click();
  await expect
    .poll(async () => Number(await preview.getAttribute("data-mouth")))
    .toBeGreaterThan(0.3);
  await expect(mouth).toHaveCount(1);
  expect(await mouth.evaluate((el) => el.tagName)).toBe("path");
  expect(await mouth.getAttribute("d")).not.toBe(closed);
  await expect(preview).toHaveClass(/state-listening/);
  await expect(preview).toHaveAttribute("data-mouth", "0", { timeout: 6000 });
  await expect(mouth).toHaveCount(1);
});

test("reduced motion keeps the avatar in a still pose", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openAppearance(page);
  await page.getByRole("button", { name: "Test the voice" }).click();
  await expect(page.getByText("so the avatar holds still")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator(".avatar-preview svg.avatar")).toHaveAttribute(
    "data-mouth",
    "0",
  );
  expect(
    await page
      .locator(".avatar-preview .avatar-eyes")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});

async function openOverlay(page: Page, overlay_visual?: string) {
  await page.goto("/tests/fixtures/app.html");
  if (overlay_visual)
    await page.evaluate((visual) => {
      const saved = JSON.parse(localStorage.getItem("test-studio") || "{}");
      localStorage.setItem(
        "test-studio",
        JSON.stringify({ ...saved, overlay_visual: visual }),
      );
    }, overlay_visual);
  await page.setViewportSize({ width: 420, height: 160 });
  await page.goto("/tests/fixtures/app.html?overlay=1");
  await page.waitForFunction(() => "testEmit" in window);
  // The overlay registers its event listeners asynchronously after mount, so
  // an event sent too early is simply missed (as it would be in the app).
  // Repeat the start-of-recording events until the overlay shows it heard them.
  await expect(async () => {
    await page.evaluate(async () => {
      const emit = (window as unknown as TestWindow).testEmit;
      await emit("show-overlay", "recording");
      await emit("recording-ready");
    });
    await expect(page.locator(".sdot.ready")).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10000 });
}

function speak(page: Page, level: number) {
  return page.evaluate(async (value) => {
    const emit = (window as unknown as TestWindow).testEmit;
    for (let i = 0; i < 6; i++) {
      await emit("mic-level", Array(16).fill(value));
      await new Promise((r) => setTimeout(r, 40));
    }
  }, level);
}

test("overlay keeps bars by default", async ({ page }) => {
  await openOverlay(page);
  await expect(page.locator(".swave.ready")).toBeVisible();
  await expect(page.locator(".ssquiggle")).toHaveCount(0);
});

test("overlay squiggle follows the voice", async ({ page }) => {
  await openOverlay(page, "squiggle");
  const path = page.locator(".ssquiggle.ready .strand-front");
  await expect(path).toBeVisible();
  // Three strands from the same points (one bright front, two behind) over a
  // faint baseline.
  await expect(page.locator(".ssquiggle .ssquiggle-strand")).toHaveCount(3);
  await expect(page.locator(".ssquiggle .strand-back")).toHaveCount(2);
  await expect(page.locator(".ssquiggle .ssquiggle-base")).toHaveCount(1);
  await expect(page.locator(".swave")).toHaveCount(0);
  const height = async () => (await path.boundingBox())?.height ?? 0;
  const quiet = await height();
  await speak(page, 0.9);
  await expect.poll(height).toBeGreaterThan(quiet + 3);
  await page.screenshot({ path: "test-results/overlay-squiggle.png" });
});

test("reduced motion draws a still squiggle that ignores the voice", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openOverlay(page, "squiggle");
  const squiggle = page.locator(".ssquiggle.ready");
  await expect(squiggle).toHaveClass(/is-still/);
  await expect(squiggle.locator(".ssquiggle-strand")).toHaveCount(3);
  const front = squiggle.locator(".strand-front");
  const still = await front.getAttribute("d");
  expect(still).toBeTruthy();
  // A resting shape with real height, not a flat line.
  expect((await front.boundingBox())?.height ?? 0).toBeGreaterThan(3);
  await speak(page, 0.9);
  await page.waitForTimeout(300);
  expect(await front.getAttribute("d")).toBe(still);
});

test("overlay avatar opens its mouth when you talk", async ({ page }) => {
  await openOverlay(page, "avatar");
  const avatar = page.locator(".savatar svg.avatar");
  await expect(avatar).toBeVisible();
  // The small pill gets just one voice ring.
  await expect(avatar.locator(".avatar-ring")).toHaveCount(1);
  await speak(page, 0.9);
  await expect
    .poll(async () => Number(await avatar.getAttribute("data-mouth")))
    .toBeGreaterThan(0.3);
  await expect(avatar.locator(".avatar-mouth")).toHaveCount(1);
});

test("talking avatar reads in the 104px compact dock", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("test-studio") || "{}");
    localStorage.setItem(
      "test-studio",
      JSON.stringify({
        ...saved,
        dock_compact: true,
        dock_character: "avatar",
        avatar: {
          kind: "dog",
          body: "#e2b48f",
          accent: "#8796ab",
          background: "#22262e",
          accessory: "headphones",
        },
      }),
    );
  });
  await page.setViewportSize({ width: 104, height: 104 });
  await page.goto("/tests/fixtures/app.html?dock=1");
  const face = page.locator(".companion-avatar svg.avatar");
  await expect(face).toBeVisible();
  expect((await face.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(64);
  // The status dot means state (neutral when idle), not a copy of the accent.
  expect(
    await page
      .locator(".compact-indicator")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(139, 144, 152)");
  await page.screenshot({ path: "test-results/dock-avatar-104.png" });
});

test("each companion card has its own shape and only the chosen one moves", async ({
  page,
}) => {
  await openAppearance(page);
  await page.mouse.move(0, 0);
  const card = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await expect(card("Orbit").locator(".orbit-bead").first()).toBeAttached();
  await expect(card("Helix").locator(".helix-bead").first()).toBeAttached();
  await expect(card("Wave").locator(".wave-line").first()).toBeAttached();
  await expect(
    card("Chrome S").locator('img[src$="say-less-emblem.png"]'),
  ).toBeVisible();
  await expect(card("Orbit")).toHaveAttribute("aria-pressed", "true");
  const running = (name: string) =>
    card(name).evaluate(
      (el) =>
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.playState === "running").length,
    );
  await expect.poll(() => running("Orbit")).toBeGreaterThan(0);
  expect(await running("Helix")).toBe(0);
  expect(await running("Wave")).toBe(0);
  await page.screenshot({ path: "test-results/companion-cards.png" });
});
