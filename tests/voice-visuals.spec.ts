import { test, expect, type Page } from "@playwright/test";

/** The fixture exposes Tauri's mocked `emit` as `window.testEmit` in overlay mode. */
type TestWindow = {
  testEmit: (event: string, payload?: unknown) => Promise<void>;
};

async function openAppearance(page: Page, query = "") {
  await page.goto(`/tests/fixtures/app.html${query}`);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recording indicator" }),
  ).toBeVisible();
}

/** The avatar builder only shows once an avatar is in use somewhere. */
async function useAvatarIndicator(page: Page) {
  await page.getByRole("button", { name: "Avatar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Customize your avatar" }),
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
  const look = page.getByRole("combobox", { name: "Dock look" });
  await expect(look).toHaveValue("emblem");
  // Neither surface uses an avatar yet, so there is nothing to customize.
  await expect(
    page.getByRole("heading", { name: "Customize your avatar" }),
  ).toHaveCount(0);
  await look.selectOption("avatar");
  await expect
    .poll(async () => (await studio(page))?.dock_character)
    .toBe("avatar");
  await expect(
    page.getByRole("heading", { name: "Customize your avatar" }),
  ).toBeVisible();

  const squiggle = page.getByRole("button", {
    name: "Voice line",
    exact: true,
  });
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

  await page.reload();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Voice line", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Cat", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Accessory", { exact: true })).toHaveValue(
    "crown",
  );
  await expect(page.getByRole("combobox", { name: "Dock look" })).toHaveValue(
    "avatar",
  );
  // A face hides the particles, so there is no pattern to pick.
  await expect(page.locator(".formation-grid")).toHaveCount(0);
  await expect(page.getByText("This look has no particles")).toBeVisible();
  await page.screenshot({ path: "test-results/voice-visuals-builder.png" });
});

test("Preview makes the avatar talk, then it closes its mouth", async ({
  page,
}) => {
  await openAppearance(page);
  await useAvatarIndicator(page);
  const preview = page.locator(".avatar-preview svg.avatar");
  const mouth = preview.locator(".avatar-mouth");
  await expect(preview).toHaveAttribute("data-mouth", "0");
  // One persistent mouth path that morphs, never a line swapped for an oval.
  await expect(mouth).toHaveCount(1);
  expect(await mouth.evaluate((el) => el.tagName)).toBe("path");
  const closed = await mouth.getAttribute("d");
  await page.getByRole("button", { name: "Preview animation" }).click();
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
  await useAvatarIndicator(page);
  await page.getByRole("button", { name: "Preview animation" }).click();
  await expect(page.getByText("so previews hold still")).toBeVisible();
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
  ).toBe("rgb(199, 204, 212)");
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

for (const visual of ["bars", "squiggle", "avatar"]) {
  test(`overlay ${visual} sits in its own slot, clear of the label`, async ({
    page,
  }) => {
    await openOverlay(page, visual);
    await speak(page, 0.9);
    const label = await page.locator(".sstatus").boundingBox();
    const slot = await page.locator(".svis").boundingBox();
    const art = await page
      .locator(".svis > *")
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, width: r.width };
      });
    expect(label && slot).toBeTruthy();
    // The slot starts after the label and the visual is centered inside it,
    // so nothing is drawn over "Listening" (the slot clips any overflow).
    expect(slot!.x).toBeGreaterThanOrEqual(label!.x + label!.width);
    const slotCenter = slot!.x + slot!.width / 2;
    expect(Math.abs(art.x + art.width / 2 - slotCenter)).toBeLessThan(1.5);
    if (art.width <= slot!.width)
      expect(art.x).toBeGreaterThanOrEqual(label!.x + label!.width);
    // One 56px pill for every visual, lifted clear of the window edge.
    const row = await page.locator(".sbase").boundingBox();
    expect(Math.round(row!.height)).toBe(56);
    const card = await page.locator(".scard").boundingBox();
    expect(160 - (card!.y + card!.height)).toBeGreaterThanOrEqual(16);
    // Red means we are listening.
    expect(
      await page
        .locator(".sdot")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(255, 90, 90)");
  });
}

for (const dock_compact of [true, false]) {
  test(`${dock_compact ? "compact" : "expanded"} dock shows the Say Less emblem look`, async ({
    page,
  }) => {
    await page.goto("/tests/fixtures/app.html");
    await page.evaluate((compact) => {
      const saved = JSON.parse(localStorage.getItem("test-studio") || "{}");
      localStorage.setItem(
        "test-studio",
        JSON.stringify({
          ...saved,
          dock_compact: compact,
          dock_character: "emblem",
          dock_animation: "orbit",
        }),
      );
    }, dock_compact);
    await page.setViewportSize(
      dock_compact ? { width: 104, height: 104 } : { width: 360, height: 112 },
    );
    await page.goto("/tests/fixtures/app.html?dock=1");
    const center = page.locator(
      dock_compact ? ".compact-companion" : ".dock-companion",
    );
    await expect(
      center.locator('.companion-emblem img[src$="say-less-emblem.png"]'),
    ).toBeVisible();
    await expect(center.locator(".companion-orb")).toHaveCount(0);
    if (dock_compact) {
      const dot = page.locator(".compact-indicator");
      await expect(dot).toHaveAttribute("aria-label", /.+/);
      expect(Math.round((await dot.boundingBox())?.width ?? 0)).toBe(8);
    } else {
      await expect(
        page.getByRole("button", { name: "Shrink to small dock" }),
      ).toHaveAttribute("aria-label", "Shrink to small dock");
    }
  });
}

test("every select is one 40px control that fits its content", async ({
  page,
}) => {
  await openAppearance(page);
  for (const name of ["Theme", "Dock placement", "Dock look"]) {
    const box = await page.getByRole("combobox", { name }).boundingBox();
    expect(Math.round(box!.height)).toBe(40);
    expect(box!.width).toBeLessThanOrEqual(280);
  }
  await page
    .getByRole("button", { name: "Shortcuts & mic", exact: true })
    .click();
  const behavior = await page
    .getByRole("combobox", { name: "Shortcut behavior" })
    .boundingBox();
  expect(Math.round(behavior!.height)).toBe(40);
});
