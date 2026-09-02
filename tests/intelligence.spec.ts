import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT = "22222222-2222-4222-8222-222222222222";
const VECTOR_A = "33333333-3333-4333-8333-333333333333";
const VECTOR_B = "44444444-4444-4444-8444-444444444444";
const GEOGRAPHY_A = "55555555-5555-4555-8555-555555555555";
const GEOGRAPHY_B = "66666666-6666-4666-8666-666666666666";
const KNOWN_AT = "2026-08-31T12:00:00Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const locales = [
  ["en", "ltr", "Global economic state", "No composite score"],
  ["fa", "rtl", "وضعیت اقتصاد جهانی", "بدون امتیاز ترکیبی"],
  ["de", "ltr", "Globale Wirtschaftslage", "Kein Gesamtwert"],
  ["fr", "ltr", "État économique mondial", "Aucun score composite"],
  ["zh-Hans", "ltr", "全球经济状态", "无综合评分"],
  ["ru", "ltr", "Состояние мировой экономики", "Без сводной оценки"],
  ["es", "ltr", "Estado económico mundial", "Sin puntuación compuesta"],
  ["pt", "ltr", "Estado econômico global", "Sem pontuação composta"],
  ["hi", "ltr", "वैश्विक आर्थिक स्थिति", "कोई संयुक्त स्कोर नहीं"],
  ["ar", "rtl", "حالة الاقتصاد العالمي", "لا توجد درجة مركبة"],
  ["hy", "ltr", "Համաշխարհային տնտեսական վիճակ", "Առանց համակցված միավորի"],
  ["tr", "ltr", "Küresel ekonomik durum", "Bileşik puan yok"],
] as const;

const query = new URLSearchParams({
  workspaceId: WORKSPACE,
  snapshotId: SNAPSHOT,
  knownAt: KNOWN_AT,
  policy: "latest_revised",
  systemAt: "null",
}).toString();

for (const [locale, direction, title, trustBoundary] of locales) {
  test(`${locale} global intelligence shell preserves locale and reflows`, async ({ page }) => {
    const response = await page.goto(`/${locale}/intelligence/global`);
    expect(response?.ok()).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", direction);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator(".trustStrip li")).toHaveText([/.+/, /.+/, trustBoundary]);
    await expect(page.locator(".workbenchSidebar .moduleLink")).toHaveCount(2);
    await expect(page.locator(".workbenchSidebar .moduleStatus")).toHaveCount(3);
    await expect(page.locator(`.localeList a[href^="/${locale}/intelligence/global"]`)).toHaveCount(
      1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}

const loadingCases = [
  {
    locale: "en",
    direction: "ltr",
    loadingTitle: "Preparing the research view",
  },
  {
    locale: "fa",
    direction: "rtl",
    loadingTitle: "در حال آماده‌سازی نمای پژوهش",
  },
] as const;

for (const loadingCase of loadingCases) {
  test(`${loadingCase.locale} delayed navigation renders the localized loading boundary`, async ({
    page,
  }, testInfo) => {
    const viewport =
      testInfo.project.name === "mobile-chromium"
        ? { width: 375, height: 812 }
        : { width: 1_440, height: 900 };
    await page.setViewportSize(viewport);
    await mockEconomicState(page);

    let releaseRoute!: () => void;
    const routeGate = new Promise<void>((resolve) => {
      releaseRoute = resolve;
    });
    let markIntercepted!: () => void;
    const intercepted = new Promise<void>((resolve) => {
      markIntercepted = resolve;
    });
    let markPrefetched!: () => void;
    const prefetched = new Promise<void>((resolve) => {
      markPrefetched = resolve;
    });
    await page.route(`**/${loadingCase.locale}/intelligence/countries/**`, async (route) => {
      const headers = route.request().headers();
      const isPrefetch =
        headers["next-router-prefetch"] === "1" ||
        headers.purpose === "prefetch" ||
        headers["sec-purpose"]?.includes("prefetch");
      if (isPrefetch) {
        const response = await route.fetch();
        await route.fulfill({ response });
        markPrefetched();
        return;
      }
      markIntercepted();
      await routeGate;
      await route.continue();
    });
    await page.goto(`/${loadingCase.locale}/intelligence/global?${query}`);
    const countryLink = page.locator(".matrixCountry").first();
    await expect(countryLink).toBeVisible();
    await countryLink.hover();
    await prefetched;

    const navigation = countryLink.click();
    await intercepted;

    try {
      const loading = page.locator(".routeState-loading");
      const liveRegion = loading.getByRole("status");
      await expect(page.locator(".workbenchTopbar")).toBeVisible();
      await expect(page.locator(".workbenchSidebar")).toBeVisible();
      await expect(loading).toBeVisible();
      await expect(loading).toHaveAttribute("lang", loadingCase.locale);
      await expect(loading).toHaveAttribute("dir", loadingCase.direction);
      await expect(liveRegion).toHaveAttribute("aria-live", "polite");
      await expect(liveRegion).toHaveAttribute("aria-busy", "true");
      await expect(
        loading.getByRole("heading", { level: 1, name: loadingCase.loadingTitle }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      const screenshotPath = testInfo.outputPath(
        `${loadingCase.locale}-loading-${viewport.width}x${viewport.height}.png`,
      );
      await page.screenshot({ path: screenshotPath });
      await testInfo.attach(`${loadingCase.locale}-loading-${viewport.width}x${viewport.height}`, {
        path: screenshotPath,
        contentType: "image/png",
      });
    } finally {
      releaseRoute();
    }

    await navigation;
    await expect(
      page.getByRole("heading", { level: 1, name: "Testland — synthetic demo" }),
    ).toBeVisible();
  });
}

test("global to country to governed evidence stays within three interactions", async ({ page }) => {
  await mockEconomicState(page);
  await page.goto(`/en/intelligence/global?${query}`);
  await expect(page.getByText("Testland — synthetic demo", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("table", { name: /ordered by evidence coverage/i })).toBeVisible();
  await expect(page.getByText("No composite score", { exact: true })).toBeVisible();
  const firstCountryDimensions = page
    .locator(".matrixRows > li")
    .first()
    .locator(".dimensionUnavailable");
  await expect(firstCountryDimensions).toHaveCount(5);
  await expect(firstCountryDimensions).toHaveText([
    /MacroeconomicNot loaded/,
    /Human economicNot loaded/,
    /Financial systemNot loaded/,
    /MarketNot loaded/,
    /RegimeNot loaded/,
  ]);
  await expect(
    page.getByRole("table", { name: /ordered by evidence coverage/i }).getByRole("columnheader", {
      name: "Macroeconomic",
    }),
  ).toBeVisible();

  const countryLink = page.getByRole("link", { name: /Testland — synthetic demo/ }).first();
  await countryLink.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Testland — synthetic demo" }),
  ).toBeVisible();

  const firstDimension = page.locator(".dimensionPanel summary").first();
  await firstDimension.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Artifact lifecycle at run", { exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByText(
        "Frozen artifact identity from this run; this is not a current production-approval claim.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  const evidence = page.getByRole("link", { name: "Evidence", exact: true }).first();
  await expect(evidence).toBeVisible();
  await evidence.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/api\/v1\/economic-state\/runs\/.+\/components\?workspaceId=/);
});

test("comparison leads with compatibility and keeps all five dimensions separate", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") {
    await page.setViewportSize({ width: 320, height: 800 });
  }
  await page.route("**/api/v1/economic-state/comparisons?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(comparisonFixture()),
    }),
  );
  await page.goto(`/en/intelligence/compare?${query}&vectorIds=${VECTOR_A},${VECTOR_B}`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Context differences detected" }),
  ).toBeVisible();
  await expect(page.locator(".compatibilityTape > div")).toHaveCount(5);
  const unavailableRegime = page.locator(".compatibilityTape > .unavailable");
  await expect(unavailableRegime).toHaveCount(1);
  await expect(unavailableRegime).toContainText("Regime");
  await expect(unavailableRegime).toContainText("All values unknown");
  await expect(unavailableRegime).not.toContainText("Estimated");
  const incompatibleDimension = page.locator(".compatibilityTape > .incompatible");
  await expect(incompatibleDimension).toHaveCount(1);
  await expect(incompatibleDimension).toContainText("Human economic");
  await expect(incompatibleDimension).toContainText("Incompatible");
  await expect(page.getByRole("table", { name: /vectors retain request order/i })).toBeVisible();
  await expect(page.getByText("No composite score.", { exact: true })).toBeVisible();
  await expect(page.getByText("Testland — synthetic demo", { exact: true }).first()).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  if (testInfo.project.name === "mobile-chromium") {
    const tableViewport = page.locator(".comparisonTableWrap");
    const dimensions = await tableViewport.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.clientHeight).toBeLessThanOrEqual(450);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
    const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(documentHeight).toBeLessThan(5_000);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});

test("invalid setup sends no governed request and valid form context persists in the URL", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/v1/economic-state/vectors?*", (route) => {
    requests += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...listFixture(), vectors: [], count: 0 }),
    });
  });
  await page.goto("/en/intelligence/global");
  await expect(page.getByRole("heading", { name: "Set the research context" })).toBeVisible();
  await expect(page.locator(".contextIssues")).toHaveCount(0);
  await expect(page.getByLabel("As known at")).not.toHaveAttribute("aria-invalid");
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Apply context" }).click();
  const contextAlert = page.locator(".contextIssues");
  await expect(contextAlert).toHaveAttribute("role", "alert");
  await expect(contextAlert).toBeFocused();
  await expect(contextAlert.getByRole("link")).toHaveCount(4);
  await expect(page.getByLabel("As known at")).toHaveAttribute("aria-invalid", "true");
  expect(requests).toBe(0);
  await page.getByLabel("As known at").fill(KNOWN_AT);
  await expect(page.getByLabel("As known at")).not.toHaveAttribute("aria-invalid");
  await page.getByLabel("System time").fill("null");
  await page.getByLabel("Policy").selectOption("latest_revised");
  await page.getByLabel("Workspace UUID").fill(WORKSPACE);
  await page.getByLabel("Snapshot UUID").fill(SNAPSHOT);
  await page.getByRole("button", { name: "Apply context" }).click();
  await expect(page).toHaveURL(new RegExp(`workspaceId=${WORKSPACE}`));
  await expect(page).toHaveURL(/systemAt=null/);
  await expect(
    page.getByRole("heading", { name: "Global economic state: Unavailable" }),
  ).toBeVisible();
  expect(requests).toBe(1);
});

test("policy denial remains non-enumerating and retryable", async ({ page }) => {
  await page.route("**/api/v1/economic-state/vectors?*", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/problem+json",
      body: JSON.stringify({ code: "ENTITLEMENT_REQUIRED", traceId: "trace-test-only" }),
    }),
  );
  await page.goto(`/fa/intelligence/global?${query}`);
  await expect(
    page.getByRole("heading", { name: "سیاست یا سطح دسترسی، نمایش این نما را مجاز نمی‌داند" }),
  ).toBeVisible();
  await expect(page.getByText(/وجود منبع درخواستی را تأیید نمی‌کند/)).toBeVisible();
  await expect(page.getByRole("button", { name: "تلاش دوبارهٔ ایمن" })).toBeVisible();
});

test("offline failure preserves governed context and offers a safe retry", async ({ page }) => {
  await page.route("**/api/v1/economic-state/vectors?*", (route) =>
    route.abort("internetdisconnected"),
  );
  await page.goto(`/en/intelligence/global?${query}`);
  await expect(page.getByRole("heading", { name: "Network unavailable" })).toBeVisible();
  await expect(page.getByText(/point-in-time context is preserved/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry safely" })).toBeVisible();
  await expect(page.locator(".querySummary")).toBeVisible();
  await expect(
    page.getByText(/does not confirm whether the requested resource exists/i),
  ).toHaveCount(0);
});

async function mockEconomicState(page: Page): Promise<void> {
  await page.route("**/api/v1/economic-state/runs/*/components?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, components: [] }),
    }),
  );
  await page.route("**/api/v1/economic-state/vectors/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(detailFixture()),
    }),
  );
  await page.route("**/api/v1/economic-state/vectors?*", (route) => fulfillList(route));
}

function fulfillList(route: Route): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(listFixture()),
  });
}

function diagnostics(missing = 1) {
  return {
    dimensionCount: 5,
    reportedDimensionCount: 5 - missing,
    scoredDimensionCount: 4 - missing,
    insufficientDimensionCount: 1,
    missingDimensionCount: missing,
    dimensionCoverage: missing ? "0.800000" : "1.000000",
    scoredDimensionCoverage: missing ? "0.600000" : "0.800000",
    evidenceCoverage: missing ? "0.720000" : "0.880000",
    confidenceCoverage: missing ? "0.610000" : "0.790000",
    evidenceQuality: "0.847222",
    reportedComponentCount: 20,
    observedComponentCount: 16,
    distinctSourceCount: 8,
    distinctSourceCoverage: "0.400000",
  };
}

function summary(id: string, geographyId: string, code: string, name: string, missing = 1) {
  return {
    id,
    geography: { id: geographyId, kind: "country", codeScheme: "ISO-3166-1-alpha-3", code, name },
    snapshot: { id: SNAPSHOT, manifestSha256: HASH_A },
    pointInTime: { knownAt: KNOWN_AT, policy: "latest_revised", systemAt: null },
    contextSha256: HASH_B,
    diagnostics: diagnostics(missing),
    stateManifestSha256: HASH_A,
    assembledAt: "2026-08-31T12:05:00Z",
    links: { self: `/api/v1/economic-state/vectors/${id}?workspaceId=${WORKSPACE}` },
  };
}

function listFixture() {
  return {
    schemaVersion: 1,
    methodologyScope: "research_baseline",
    context: {
      workspaceId: WORKSPACE,
      snapshot: { id: SNAPSHOT },
      pointInTime: { knownAt: KNOWN_AT, policy: "latest_revised", systemAt: null },
      geographyId: null,
    },
    count: 2,
    nextCursor: null,
    vectors: [
      summary(VECTOR_A, GEOGRAPHY_A, "TST", "Testland — synthetic demo"),
      summary(VECTOR_B, GEOGRAPHY_B, "ALT", "Alternia — synthetic demo", 0),
    ],
  };
}

function detailFixture() {
  const dimensions = [
    "macroeconomic",
    "human_economic",
    "financial_system",
    "market",
    "regime",
  ] as const;
  return {
    ...summary(VECTOR_A, GEOGRAPHY_A, "TST", "Testland — synthetic demo"),
    schemaVersion: 1,
    methodologyScope: "research_baseline",
    contextSha256: HASH_B,
    dimensions: dimensions.map((dimension, index) =>
      index === 4
        ? { ordinal: index + 1, dimension, model: null, run: null, missingReason: "not_modeled" }
        : {
            ordinal: index + 1,
            dimension,
            missingReason: null,
            model: {
              id: `77777777-7777-4777-8${String(index).repeat(3)}-777777777777`,
              key: `${dimension}.baseline`,
              version: "1.0.0",
              definitionSha256: HASH_A,
              artifact: {
                id: `88888888-8888-4888-8${String(index).repeat(3)}-888888888888`,
                sha256: HASH_B,
                lifecycleStatus: "research",
              },
            },
            run: {
              id: `99999999-9999-4999-8${String(index).repeat(3)}-999999999999`,
              status: index === 3 ? "partial" : "complete",
              score: `0.${index + 4}00000`,
              missingReason: null,
              completeness: index === 3 ? "0.700000" : "1.000000",
              sourceCoverage: "0.600000",
              confidence: "0.750000",
              distinctSourceCount: 4,
              renormalized: index === 3,
              calculatedAt: "2026-08-31T12:04:00Z",
              links: {
                self: `/api/v1/economic-state/runs/99999999-9999-4999-8${String(index).repeat(3)}-999999999999?workspaceId=${WORKSPACE}`,
                components: `/api/v1/economic-state/runs/99999999-9999-4999-8${String(index).repeat(3)}-999999999999/components?workspaceId=${WORKSPACE}`,
              },
            },
          },
    ),
  };
}

function comparisonFixture() {
  const names = [
    "macroeconomic",
    "human_economic",
    "financial_system",
    "market",
    "regime",
  ] as const;
  const compatibility = names.map((dimension, index) => ({
    ordinal: index + 1,
    dimension,
    compatible: index !== 1,
    reason:
      index === 1
        ? "model_definition_mismatch"
        : index === 4
          ? "all_missing"
          : "same_model_and_artifact",
    sharedModelId: index === 1 || index === 4 ? null : "77777777-7777-4777-8777-777777777777",
    sharedModelDefinitionSha256: index === 1 || index === 4 ? null : HASH_A,
    sharedModelArtifactId:
      index === 1 || index === 4 ? null : "88888888-8888-4888-8888-888888888888",
    sharedModelArtifactSha256: index === 1 || index === 4 ? null : HASH_B,
  }));
  const dimensions = names.map((dimension, index) => ({
    ordinal: index + 1,
    dimension,
    modelId: index === 4 ? null : "77777777-7777-4777-8777-777777777777",
    modelDefinitionSha256: index === 4 ? null : HASH_A,
    modelArtifactId: index === 4 ? null : "88888888-8888-4888-8888-888888888888",
    modelArtifactSha256: index === 4 ? null : HASH_B,
    status: index === 4 ? null : "complete",
    score: index === 4 ? null : `0.${index + 4}00000`,
    missingReason: index === 4 ? "not_modeled" : null,
    completeness: index === 4 ? null : "1.000000",
    sourceCoverage: index === 4 ? null : "0.600000",
    confidence: index === 4 ? null : "0.750000",
    renormalized: index === 4 ? null : false,
  }));
  return {
    schemaVersion: 1,
    methodologyScope: "research_baseline",
    requestedVectorIds: [VECTOR_A, VECTOR_B],
    vectorCount: 2,
    context: {
      workspaceId: WORKSPACE,
      ordering: "requested",
      comparisonBasis: {
        snapshot: "exact_id_and_manifest",
        pointInTime: "exact_policy_known_at_system_at",
        dimension: "exact_model_and_artifact_identity",
        scoreTreatment: "persisted_exact_no_normalization",
      },
    },
    compatibility: {
      compatible: false,
      snapshot: {
        compatible: true,
        reason: "same_snapshot",
        sharedId: SNAPSHOT,
        sharedManifestSha256: HASH_A,
      },
      pointInTime: {
        compatible: true,
        reason: "same_point_in_time",
        sharedKnownAt: KNOWN_AT,
        sharedPolicy: "latest_revised",
        sharedSystemAt: null,
      },
      dimensions: compatibility,
    },
    vectors: [
      { ...summary(VECTOR_A, GEOGRAPHY_A, "TST", "Testland — synthetic demo"), dimensions },
      { ...summary(VECTOR_B, GEOGRAPHY_B, "ALT", "Alternia — synthetic demo", 0), dimensions },
    ],
  };
}
