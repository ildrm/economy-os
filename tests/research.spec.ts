import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { researchCopy } from "../apps/web/app/[locale]/intelligence/_lib/research-copy";

// All API responses in this suite are explicitly synthetic test fixtures.
const workspace = "398f47ac-19fc-7c92-ae91-0242ac120003";
const knownAt = "2026-01-01T00:00:00Z";

function fixture(command: Record<string, unknown>, result: Record<string, unknown>) {
  return {
    ...command,
    // PostgreSQL returns six fractional digits for the same exact requested instant.
    knownAt: "2026-01-01T00:00:00.000000Z",
    organizationId: "398f47ac-19fc-7c92-ae91-0242ac120001",
    actorId: "398f47ac-19fc-7c92-ae91-0242ac120005",
    dataClass: "scenario",
    evidenceStatus: "caller_supplied_unverified",
    recordedAt: "2026-01-02T00:00:00.000001Z",
    manifestSha256: "a".repeat(64),
    result,
  };
}
async function context(page: Page) {
  await page.getByLabel("Workspace UUID").fill(workspace);
  await page.getByLabel("As known at", { exact: false }).fill(knownAt);
}
async function behavioral(page: Page) {
  await context(page);
  await page.getByLabel("Utility flows, separated by commas").fill("10, 20");
  await page.getByLabel("Present-bias parameter β").fill("0.5");
  await page.getByLabel("Discount factor δ").fill("0.9");
  await page.getByLabel("Population / decision context").fill("Synthetic test population");
  await page.getByLabel("Period unit").fill("Synthetic yearly periods");
  await page
    .getByLabel("Assumptions and limitations")
    .fill("Synthetic fixture, no empirical claim");
}
const behavioralResult = {
  utility: "19",
  exponentialBenchmark: "28",
  sensitivity: [
    { beta: "0", utility: "10" },
    { beta: "0.5", utility: "19" },
    { beta: "1", utility: "28" },
  ],
};

for (const locale of [
  "en",
  "fa",
  "de",
  "fr",
  "zh-Hans",
  "ru",
  "es",
  "pt",
  "hi",
  "ar",
  "hy",
  "tr",
] as const) {
  test(`${locale}: research starts without fabricated quantities`, async ({ page }) => {
    await page.goto(`/${locale}/intelligence/research`);
    await expect(
      page.getByRole("heading", { level: 1, name: researchCopy(locale).title }),
    ).toBeVisible();
    await expect(page.locator("#research-beta")).toHaveValue("");
    await expect(page.locator("#research-delta")).toHaveValue("");
    await expect(page.locator("#research-workspaceId")).toHaveValue("");
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      ["fa", "ar"].includes(locale) ? "rtl" : "ltr",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}

test("intertemporal research preserves result context, provenance, and accessible forms", async ({
  page,
}, testInfo) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/v1/research/runs", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, json: fixture(submitted, behavioralResult) });
  });
  await page.goto("/en/intelligence/research");
  await behavioral(page);
  await page.getByRole("button", { name: "Run and save research" }).click();
  await expect(page.getByRole("status")).toContainText("Immutable research record");
  expect(submitted).toMatchObject({
    workspaceId: workspace,
    knownAt,
    kind: "behavioral_choice",
    input: { utilities: ["10", "20"], beta: "0.5", delta: "0.9" },
  });
  await expect(page.locator("dd", { hasText: /^19$/ })).toBeVisible();
  await page.getByText("Evidence and provenance", { exact: true }).click();
  await expect(page.locator("pre[lang=en]")).toContainText("caller_supplied_unverified");
  await expect(page.locator("pre[lang=en]")).toContainText("Synthetic fixture, no empirical claim");
  await page.screenshot({ path: testInfo.outputPath("research-result.png"), fullPage: true });
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  await page.getByLabel("Present-bias parameter β").fill("0.7");
  await expect(page.getByRole("status")).toContainText("No research run yet");
  await expect(page.locator("pre")).toHaveCount(0);
});

test("material balance submits unknown quantities as null and renders explicit missingness", async ({
  page,
}) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/v1/research/runs", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: fixture(submitted, {
        status: "missing",
        missingFields: [
          "production",
          "imports",
          "openingInventory",
          "intermediateDemand",
          "householdDemand",
          "governmentDemand",
          "investmentDemand",
          "exports",
          "closingInventory",
        ],
      }),
    });
  });
  await page.goto("/en/intelligence/research");
  await page.getByRole("radio", { name: "Material balance" }).check();
  await context(page);
  await page.getByLabel("Commodity", { exact: true }).fill("Synthetic commodity");
  await page.getByLabel("Quantity unit").fill("Synthetic units");
  await expect(page.getByLabel("Production", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Run and save research" }).click();
  await expect(page.getByRole("heading", { name: "Missing inputs" })).toBeVisible();
  expect(submitted).toMatchObject({
    kind: "material_balance",
    input: { production: null, imports: null, householdDemand: null, closingInventory: null },
  });
  await expect(page.locator("dd", { hasText: /^unknown$/ })).toHaveCount(5);
});

test("identical denied retries preserve id while changed inputs use a new identity", async ({
  page,
}) => {
  const commands: Record<string, unknown>[] = [];
  await page.route("**/api/v1/research/runs", async (route) => {
    const command = route.request().postDataJSON() as Record<string, unknown>;
    commands.push(command);
    await route.fulfill(
      commands.length === 1
        ? { status: 403, json: { code: "RESOURCE_ACCESS_DENIED" } }
        : { status: 201, json: fixture(command, behavioralResult) },
    );
  });
  await page.goto("/en/intelligence/research");
  await behavioral(page);
  await page.getByRole("button", { name: "Run and save research" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("does not confirm whether");
  await page.getByRole("button", { name: "Run and save research" }).click();
  await expect(page.getByRole("status")).toContainText("Immutable research record");
  expect(commands[0]?.id).toBe(commands[1]?.id);
  await page.getByLabel("Present-bias parameter β").fill("0.7");
  await page.getByRole("button", { name: "Run and save research" }).click();
  await expect(page.getByRole("status")).toContainText("Immutable research record");
  expect(commands[2]?.id).not.toBe(commands[1]?.id);
});

test("editing context while a request is pending cannot display its late result", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured!: () => void;
  const requestSeen = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/v1/research/runs", async (route) => {
    const command = route.request().postDataJSON() as Record<string, unknown>;
    captured();
    await gate;
    await route.fulfill({ status: 201, json: fixture(command, behavioralResult) });
  });
  await page.goto("/en/intelligence/research");
  await behavioral(page);
  await page.getByRole("button", { name: "Run and save research" }).click();
  await requestSeen;
  await expect(page.getByRole("button", { name: "Running…" })).toBeDisabled();
  await page.getByLabel("Workspace UUID").fill("398f47ac-19fc-7c92-ae91-0242ac120004");
  release();
  await expect(page.getByRole("status")).toContainText("No research run yet");
  await expect(page.locator("pre")).toHaveCount(0);
});

test("response scope mismatch fails closed", async ({ page }) => {
  await page.route("**/api/v1/research/runs", async (route) => {
    const command = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: {
        ...fixture(command, behavioralResult),
        workspaceId: "398f47ac-19fc-7c92-ae91-0242ac120004",
      },
    });
  });
  await page.goto("/en/intelligence/research");
  await behavioral(page);
  await page.getByRole("button", { name: "Run and save research" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Unable to run");
  await expect(page.locator("pre")).toHaveCount(0);
});

test("response knowledge cutoff rejects a hidden microsecond difference", async ({ page }) => {
  await page.route("**/api/v1/research/runs", async (route) => {
    const command = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: { ...fixture(command, behavioralResult), knownAt: "2026-01-01T00:00:00.000001Z" },
    });
  });
  await page.goto("/en/intelligence/research");
  await behavioral(page);
  await page.getByRole("button", { name: "Run and save research" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Unable to run");
  await expect(page.locator("pre")).toHaveCount(0);
});
