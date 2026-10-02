import { test, expect } from "@playwright/test";

test("loads a selected language only when it is needed", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "Appearance", exact: true }).waitFor();
  const result = await page.evaluate(async () => {
    const {
      default: i18n,
      changeAppLanguage,
      SUPPORTED_LANGUAGES,
    } = await import("/src/i18n/index.ts");
    const loadedBefore = i18n.hasResourceBundle("fr", "translation");
    const changed = await changeAppLanguage("fr");
    const loadedAfter = i18n.hasResourceBundle("fr", "translation");
    const translatedTitle = i18n.t("appLanguage.title");
    await changeAppLanguage("en");
    return {
      loadedBefore,
      changed,
      loadedAfter,
      translatedTitle,
      englishTitle: i18n.t("appLanguage.title"),
      frenchAvailable: SUPPORTED_LANGUAGES.some(
        (language) => language.code === "fr",
      ),
    };
  });
  expect(result).toEqual({
    loadedBefore: false,
    changed: true,
    loadedAfter: true,
    translatedTitle: "Langue de l'application",
    englishTitle: "Application Language",
    frenchAvailable: true,
  });
});

test("the language selector applies a lazily loaded translation", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/app.html");
  await page.getByRole("button", { name: "About", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Application Language" })
    .selectOption("fr");
  await expect(
    page.getByRole("combobox", { name: "Langue de l'application" }),
  ).toHaveValue("fr");
});

test("a saved language loads when the app starts", async ({ page }) => {
  await page.goto("/tests/fixtures/app.html?language=fr");
  await expect(
    page.getByRole("button", { name: "À propos", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "À propos", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Langue de l'application" }),
  ).toHaveValue("fr");
});
