import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const locales = [
  { locale: "en", direction: "ltr", tagline: "Evidence before assertion" },
  { locale: "fa", direction: "rtl", tagline: "شواهد پیش از ادعا" },
  { locale: "de", direction: "ltr", tagline: "Belege vor Behauptungen" },
  { locale: "fr", direction: "ltr", tagline: "Les preuves avant les affirmations" },
  { locale: "zh-Hans", direction: "ltr", tagline: "先有证据，再下结论" },
  { locale: "ru", direction: "ltr", tagline: "Сначала доказательства, затем утверждения" },
  { locale: "es", direction: "ltr", tagline: "La evidencia antes que las afirmaciones" },
  { locale: "pt", direction: "ltr", tagline: "Evidências antes de afirmações" },
  { locale: "hi", direction: "ltr", tagline: "दावे से पहले प्रमाण" },
  { locale: "ar", direction: "rtl", tagline: "الدليل قبل الادعاء" },
  { locale: "hy", direction: "ltr", tagline: "Ապացույցը՝ պնդումից առաջ" },
  { locale: "tr", direction: "ltr", tagline: "İddiadan önce kanıt" },
] as const;

for (const { locale, direction, tagline } of locales) {
  test(`${locale} shell is translated, secure, accessible, and keyboard reachable`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(`/${locale}`);
    if (!response) throw new Error("Navigation did not return a response");
    expect(response.ok()).toBe(true);
    expect(response.headers()["x-powered-by"]).toBeUndefined();
    expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers()["content-security-policy"]).toContain("object-src 'none'");
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");

    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", direction);
    await expect(page.getByRole("heading", { level: 1, name: tagline })).toBeVisible();
    expect(await page.title()).toContain(tagline);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);

    const languageLinks = page.locator(".localeList a");
    await expect(languageLinks).toHaveCount(locales.length);
    expect(
      await languageLinks.evaluateAll((links) =>
        links.every((link) => link.getClientRects().length > 0),
      ),
    ).toBe(true);
    await expect(page.locator('.localeList a[aria-current="page"]')).toHaveAttribute(
      "href",
      `/${locale}`,
    );

    await expect(page.locator(".moduleStatus")).toHaveCount(3);
    await expect(page.locator(".sidebar a")).toHaveCount(2);
    expect(
      await page
        .locator(".moduleStatus")
        .evaluateAll((items) => items.every((item) => !item.hasAttribute("tabindex"))),
    ).toBe(true);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);

    await page.keyboard.press("Tab");
    await expect(page.locator(".skipLink")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(pageErrors).toEqual([]);
  });
}

test("root route honors weighted Accept-Language preferences", async ({ request }) => {
  const response = await request.get("/", {
    headers: { "accept-language": "fa;q=0, tr-TR;q=0.9, en;q=0.5" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/tr");
});

const missingRouteCases = [
  {
    locale: "en",
    direction: "ltr",
    path: "/en/private/governed-record",
    title: "This view is unavailable",
    home: "/en",
  },
  {
    locale: "fa",
    direction: "rtl",
    path: "/fa/private/governed-record",
    title: "این نما در دسترس نیست",
    home: "/fa",
  },
] as const;

for (const missing of missingRouteCases) {
  test(`${missing.locale} missing governed-looking route is a non-enumerating 404`, async ({
    page,
  }) => {
    const response = await page.goto(missing.path);
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", missing.locale);
    await expect(page.locator("html")).toHaveAttribute("dir", missing.direction);
    await expect(page.getByRole("heading", { level: 1, name: missing.title })).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator(`.routeStateActions a[href="${missing.home}"]`)).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });
}

test("invalid locale renders the accessible branded global fallback with a real 404", async ({
  page,
}) => {
  const response = await page.goto("/zz/private/governed-record");
  expect(response?.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(
    page.getByRole("heading", { level: 1, name: "This view is unavailable" }),
  ).toBeVisible();
  await expect(page.locator(".routeStateTopbar")).toContainText("EconomyOS");
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator('.routeStateActions a[href="/en"]')).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
});
