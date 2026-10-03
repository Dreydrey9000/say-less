import { test, expect } from "@playwright/test";

const FRAME = "Create: pictures, titles, videos and your library";

test("Create turns on with one click and then shows the page inside the app", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Create pictures, titles and video notes",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Turn on Create" }).click();
  const frame = page.locator(`iframe[title="${FRAME}"]`);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute(
    "src",
    "http://127.0.0.1:8810/app?embed=1#/image",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { testCommands: string[] }).testCommands,
      ),
    )
    .toContain("studio_fit_window");
});

test("Create goes straight to the page when the helper is already running", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?helperRunning=1");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(`iframe[title="${FRAME}"]`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Turn on Create" }),
  ).toHaveCount(0);
});

test("Create says plainly what is missing and lets you try again", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?helperStartFails=python_missing");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Turn on Create" }).click();
  await expect(page.getByRole("alert")).toContainText("needs Python 3");
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
});

test("Create explains that it needs a Mac when it cannot start here", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html?helperNoStart=1");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("works on Mac");
  await expect(
    page.getByRole("button", { name: "Turn on Create" }),
  ).toBeDisabled();
});

test("only the Create page's own frame can ask the app to capture the screen", async ({
  page,
}) => {
  // Stand in for the helper's page: it asks the app for a region capture and
  // prints whatever the app answers.
  await page.route("http://127.0.0.1:8810/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<body>waiting</body><script>
        window.addEventListener("message", (e) => {
          document.body.textContent = JSON.stringify(e.data);
        });
        parent.postMessage({ __sayless: 1, id: "7", action: "capture", mode: "region", dir: "/Users/t/state/captures" }, "*");
      </script>`,
    }),
  );
  await page.goto("/tests/fixtures/app.html?helperRunning=1");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const body = page.frameLocator(`iframe[title="${FRAME}"]`).locator("body");
  await expect(body).toContainText('"ok":true');
  await expect(body).toContainText("/Users/t/state/captures/capture-1.png");

  // The same request from the app's own window (not the frame) is ignored.
  await page.evaluate(() => {
    (window as unknown as { testCommands: string[] }).testCommands = [];
    window.postMessage(
      {
        __sayless: 1,
        id: "8",
        action: "capture",
        mode: "screen",
        dir: "/Users/t/state/captures",
      },
      "*",
    );
  });
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => (window as unknown as { testCommands: string[] }).testCommands,
    ),
  ).not.toContain("studio_capture");
});

test("a cancelled region capture is passed on as cancelled", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:8810/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<body>waiting</body><script>
        window.addEventListener("message", (e) => {
          document.body.textContent = JSON.stringify(e.data);
        });
        parent.postMessage({ __sayless: 1, id: "9", action: "capture", mode: "region", dir: "/Users/t/state/captures" }, "*");
      </script>`,
    }),
  );
  await page.goto(
    "/tests/fixtures/app.html?helperRunning=1&captureCancelled=1",
  );
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.frameLocator(`iframe[title="${FRAME}"]`).locator("body"),
  ).toContainText('"error":"cancelled"');
});

test("a spoken action opens Create on the page it names", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?helperRunning=1&events");
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as { testEmit: (e: string, p?: unknown) => void }
    ).testEmit("open-create", "titles"),
  );
  const frame = page.locator(`iframe[title="${FRAME}"]`);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute(
    "src",
    "http://127.0.0.1:8810/app?embed=1#/titles",
  );
  // Asking again for another page moves the same frame to it.
  await page.evaluate(() =>
    (
      window as unknown as { testEmit: (e: string, p?: unknown) => void }
    ).testEmit("open-create", "library"),
  );
  await expect(frame).toHaveAttribute(
    "src",
    "http://127.0.0.1:8810/app?embed=1#/library",
  );
});

test("a voice action can be set to open a page of Create", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  await page
    .getByRole("button", { name: "Voice actions", exact: true })
    .click();
  await page.getByLabel("After “Say Less”, say").fill("make an image");
  await page.getByLabel("Action type", { exact: true }).selectOption("create");
  await page.getByLabel("Destination", { exact: true }).selectOption("image");
  await page.getByRole("button", { name: "Save action", exact: true }).click();
  await expect(
    page.getByText("“Say Less, make an image”", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("li p", { hasText: "Make an image" }),
  ).toBeVisible();
});
