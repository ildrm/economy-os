import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a visitor sees actual world data and chooses an economic perspective without identifiers", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) requests.push(request.url());
  });
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Understand the economy");
  await expect(page.locator(".economicFacts")).toContainText("2.92%");
  await expect(page.locator(".dataCoverage").first()).toContainText("336,444");
  await expect(page.locator('input:not([type="range"]):not([type="checkbox"])')).toHaveCount(0);
  await expect(page.getByText(/UUID|true_vintage|systemAt/)).toHaveCount(0);
  await page.getByRole("button", { name: "Business", exact: true }).click();
  await page
    .locator(".audiencePanel")
    .getByRole("link", { name: "Capital formation", exact: true })
    .click();
  await expect(page.getByRole("combobox", { name: "Economic topic", exact: true })).toHaveValue(
    "output",
  );
  await expect(
    page.locator(".economicTable").filter({ has: page.locator(".economicValue, .missingValue") }),
  ).toContainText("Capital formation");
  expect(requests).toEqual([]);
});

test("country directory filters real profiles across the complete provider directory", async ({
  page,
}) => {
  await page.goto("/en/intelligence/countries");
  await expect(page.locator(".economyTile")).toHaveCount(24);
  await expect(page.locator(".economyTile").first()).toContainText("42.17%");
  await page.getByRole("combobox", { name: "Region", exact: true }).selectOption("North America");
  await expect(page.locator(".economyTile")).toHaveCount(3);
  await page.locator(".economyTile h2").getByRole("link", { name: "Canada", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Canada");
  await expect(page.locator(".economicFacts bdi").first()).not.toHaveText(/Not reported|…/);
  await page.getByRole("combobox", { name: "Economic topic", exact: true }).selectOption("all");
  await expect(
    page
      .locator(".economicTable")
      .filter({ has: page.locator(".economicValue, .missingValue") })
      .locator("tbody tr"),
  ).toHaveCount(80);
  await expect(
    page.getByRole("heading", { name: "Do these indicators move together?" }),
  ).toBeVisible();
});

test("comparison opens with actual matched-year numbers, survives refresh and exports exact source values", async ({
  page,
}) => {
  await page.goto("/en/intelligence/compare");
  const table = page
    .locator(".economicTable")
    .filter({ has: page.locator(".economicValue, .missingValue") });
  await expect(table.locator("thead th")).toHaveText([
    "Economic measure",
    "Iran",
    "Germany",
    "United States",
  ]);
  const inflation = table.locator("tbody tr").first();
  await expect(inflation.locator(".economicValue")).toHaveText(["32.46%", "2.26%", "2.95%"]);
  await expect(inflation.locator(".observationYear")).toHaveText(["2024", "2024", "2024"]);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV", exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  const chunks: Buffer[] = [];
  if (stream) for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain('"2024","32.455871402917"');
  expect(csv).toContain("https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG");
  for (const field of [
    "source_grade",
    "value_type",
    "currency",
    "original_value",
    "original_unit",
    "is_preliminary",
    "revision_status",
    "retrieval_timestamp",
  ])
    expect(csv).toContain(`"${field}"`);
  expect(csv).toContain('"A","multilateral"');
  expect(csv).toContain('"true","null","unknown"');
  await page.getByRole("combobox", { name: "Observation year", exact: true }).selectOption("2025");
  await expect(inflation.locator("td").nth(2)).toContainText("Not reported");
  await expect(inflation.locator(".economicValue").first()).toHaveText("42.17%");
  await page.getByRole("combobox", { name: "Economic topic", exact: true }).selectOption("all");
  await expect(table.locator("tbody tr")).toHaveCount(80);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Economic topic", exact: true })).toHaveValue(
    "all",
  );
  await expect(page.getByRole("combobox", { name: "Observation year", exact: true })).toHaveValue(
    "2025",
  );
  await page.getByRole("button", { name: "Add country", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add country", exact: true })).toBeDisabled();
  await expect(table.locator("thead th")).toHaveCount(5);
  await page.getByRole("button", { name: "Remove Iran", exact: true }).click();
  await expect(table.locator("thead th")).toHaveCount(4);
});

test("a failed or corrupted snapshot is identified as a loading failure and can be retried", async ({
  page,
}) => {
  let broken = true;
  await page.route("**/economy/IR.json?*", async (route) => {
    if (broken)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"countryCode":"IR"}',
      });
    else await route.continue();
  });
  await page.goto("/en/intelligence/compare");
  await expect(page.locator(".dataError[role=alert]")).toContainText("loading problem");
  broken = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page
      .locator(".economicTable")
      .filter({ has: page.locator(".economicValue, .missingValue") })
      .locator("tbody tr")
      .first(),
  ).toContainText("32.46%");
  await expect(page.locator(".dataError[role=alert]")).toHaveCount(0);
});

test("scientific studies retain limitations and all seven model explorations calculate", async ({
  page,
}) => {
  await page.goto("/en/intelligence/science");
  await expect(page.locator(".studyArticle")).toHaveCount(3);
  await expect(page.locator(".studyArticle").first()).toContainText("Limit");
  await expect(page.locator(".modelResult")).toContainText("-160");
  await page.getByRole("slider", { name: /Loss multiplier/ }).fill("2");
  await expect(page.locator(".modelResult")).toContainText("-200");
  await page.getByRole("button", { name: "Show all studies" }).click();
  await expect(page.locator(".studyArticle")).toHaveCount(12);
  await expect(page.locator(".theoryDirectory tbody tr")).toHaveCount(20);
  const model = page.getByRole("combobox", { name: "Working model", exact: true });
  await model.selectOption("time");
  await expect(page.locator(".modelResult")).toContainText("95");
  await page.getByRole("button", { name: "Moderate present bias", exact: true }).click();
  await expect(page.locator(".modelResult")).toContainText("76");
  for (const [mode, expected] of [
    ["fairness", "A payoff"],
    ["search", "Find an acceptable option"],
    ["probability", "decision weight"],
    ["disposition", "selling rates"],
    ["choices", "three utility levels"],
  ]) {
    await model.selectOption(mode);
    await expect(page.locator(".modelResult")).toContainText(expected);
  }
  await model.selectOption("disposition");
  await page.getByRole("button", { name: "No opportunities", exact: true }).click();
  await expect(page.locator(".modelResult dd")).toHaveText(["Unknown", "Unknown"]);
  await page
    .getByRole("combobox", { name: "Research topic", exact: true })
    .selectOption("intertemporal_choice");
  await expect(page.locator(".studyArticle")).not.toHaveCount(0);
  await expect(page.locator(".theoryDirectory tbody tr")).toHaveCount(1);
});

test("the lab compounds prices, handles unknown supply and shows model assumptions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/en/intelligence/research");
  const output = page.locator(".labResult");
  await expect(output.locator(".exampleNumber")).toHaveText("95.24");
  await page.getByRole("slider", { name: /^Years/ }).fill("2");
  await expect(output.locator(".exampleNumber")).toHaveText("90.7");
  await page.getByRole("button", { name: "Savings", exact: true }).click();
  await page.getByRole("slider", { name: /Annual savings interest/ }).fill("5");
  await expect(output.locator(".exampleNumber")).toHaveText("100");
  await page.getByRole("button", { name: "Supply & demand", exact: true }).click();
  await page.getByRole("button", { name: "Smaller harvest" }).click();
  await expect(output).toContainText("tonnes of shortage");
  await expect(output.locator(".exampleNumber")).toHaveText("10");
  await page.getByRole("button", { name: "Harvest unknown" }).click();
  await expect(output).toContainText("Not enough information");
  await expect(output.locator(".exampleNumber")).toHaveCount(0);
  await page.getByRole("button", { name: "Choices over time" }).click();
  await expect(output).toContainText("The later option");
  await page.getByRole("button", { name: "Strong preference for now" }).click();
  await expect(output).toContainText("The immediate option");
  await page.getByText("See the calculation & assumptions", { exact: true }).click();
  await expect(page.locator(".formula")).toContainText("β");
  expect(errors).toEqual([]);
});

for (const locale of ["en", "fa"] as const) {
  for (const path of [
    "global",
    "countries",
    "compare?countries=IR,DE",
    "global?view=concepts&topic=trade",
    "global?view=sources",
    "research",
    "countries/IR",
    "science",
  ]) {
    test(`${locale} ${path} is accessible and reflows without page overflow`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/${locale}/intelligence/${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("main.publicMain")).toHaveAttribute("lang", locale);
      await expect(page.locator("main.publicMain")).toHaveAttribute(
        "dir",
        locale === "fa" ? "rtl" : "ltr",
      );
      await expect(
        page.getByText("Loading published country indicators…", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("در حال بارگذاری شاخص‌های منتشرشده کشورها…", { exact: true }),
      ).toHaveCount(0);
      if (locale === "en" && path === "countries/IR") {
        await expect(page.locator(".plainInsights")).toContainText("7.14 in 2015 prices by 2025");
      }
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations).toEqual([]);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    });
  }
}

test("language selection preserves the chosen concept and does not show technical setup", async ({
  page,
}) => {
  await page.goto("/en/intelligence/global?view=concepts&concept=inflation");
  await page.locator(".languageSelect select").selectOption("fa");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("تورم");
  await expect(page).toHaveURL(/\/fa\/intelligence\/global\?view=concepts&concept=inflation/);
  await expect(page.locator(".temporalLens")).toHaveCount(0);
});

test("source guide explains price types and distinguishes registered sources from connected data", async ({
  page,
}) => {
  await page.goto("/en/intelligence/global?view=sources");
  const policy = page.getByRole("region", { name: "What kind of number is this?" });
  await expect(policy).toContainText(
    "Direct national consumer-price feeds and Eurostat HICP are not connected yet",
  );
  await policy.getByText("Ten price meanings, with simple examples", { exact: true }).click();
  await expect(policy.locator("dt")).toHaveCount(10);
  await expect(policy).toContainText("An index of 112.4 is not €112.4");
  await expect(policy).toContainText("RDW catalogue values are not today’s used-car values");
  await policy
    .getByText("Supplied source catalog · 87 entries awaiting connection review", { exact: true })
    .click();
  await expect(policy).toContainText("None of these entries is presented as a connected feed");
  await policy.getByText("Brazil", { exact: true }).click();
  await expect(policy.getByText("FIPE", { exact: false }).last()).toBeVisible();
  await page.goto("/fa/intelligence/global?view=sources");
  await expect(
    page.getByRole("heading", { name: "این عدد از چه نوعی است؟", exact: true }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
