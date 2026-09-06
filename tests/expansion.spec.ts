import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const locales = ["en", "fa", "de", "fr", "zh-Hans", "ru", "es", "pt", "hi", "ar", "hy", "tr"];
for (const locale of locales)
  for (const route of ["behavioral", "decisions"]) {
    test(`${locale} ${route} loads actual evidence, is accessible and fits the viewport`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/${locale}/intelligence/${route}`);
      await expect(page.locator("main.publicMain")).toHaveAttribute("lang", locale);
      await expect(page.locator("main.publicMain")).toHaveAttribute(
        "dir",
        ["fa", "ar"].includes(locale) ? "rtl" : "ltr",
      );
      await expect(
        page.locator(route === "behavioral" ? ".behavioralHeadlines" : ".decisionMetricGrid"),
      ).toBeVisible();
      await expect(page.locator("main input:not([type=range])")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

test("survey selection uses monthly history and retains raw evidence in export", async ({
  page,
}) => {
  await page.goto("/en/intelligence/behavioral");
  await expect(page.locator(".behavioralHeadlines button")).toHaveCount(4);
  await page
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="FI"]') })
    .selectOption("FI");
  await expect(page.locator(".behavioralHeadlines")).toBeVisible();
  await page.getByRole("button", { name: /Disagreement/ }).click();
  await expect(page.locator(".behavioralLatest")).toContainText("percentage points");
  await page.locator(".behavioralChart summary").click();
  await expect(page.locator(".decisionHistory table tr")).not.toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence" }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  if (stream) for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(data.country).toBe("FI");
  expect(data.method).toBe("weighted-percentile-difference/1.0.0");
  expect(data.observations[0].inputs).toHaveLength(2);
  expect(data.observations[0].inputs[0].observation.frequency).toBe("monthly");
  expect(data.observations[0].inputs[0].vintage).toBe("latest_revised_only");
});

test("corrupt survey downloads show a recoverable error without rendering invented values", async ({
  page,
}) => {
  let corrupt = true;
  await page.route("**/behavioral/DE.json?*", (route) =>
    corrupt
      ? route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
      : route.continue(),
  );
  await page.goto("/en/intelligence/behavioral");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.locator(".behavioralLatest")).toHaveCount(0);
  corrupt = false;
  await page.getByRole("button", { name: /Try again/ }).click();
  await expect(page.locator(".behavioralLatest")).toBeVisible();
});

test("all ten scenario families execute from named presets and disclose assumptions", async ({
  page,
}) => {
  await page.goto("/en/intelligence/decisions");
  const choices = page.locator(".scenarioChoices button");
  await expect(choices).toHaveCount(10);
  for (const choice of await choices.all()) {
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".scenarioResults strong")).toHaveCount(4);
  }
  await page.locator(".decisionScenario summary").click();
  await expect(page.locator(".decisionScenario details")).toContainText(
    "Domestic currency cost of imports",
  );
  await expect(page.locator(".decisionScenario")).toContainText("assumptions");
});

test("risk areas show dated evidence and consecutive changes without fabricated forecasts", async ({
  page,
}) => {
  await page.goto("/en/intelligence/decisions");
  await page
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="DE"]') })
    .selectOption("DE");
  await page.getByRole("button", { name: "Risk indicators" }).click();
  await expect(
    page.getByText("Forecast probabilities are unavailable", { exact: false }),
  ).toBeVisible();
  const area = page.getByRole("combobox", { name: "Risk area", exact: true });
  for (const value of ["external", "banking", "sovereign", "monetary"]) {
    await area.selectOption(value);
    await expect(page.locator(".decisionMetricGrid article")).toHaveCount(4);
  }
  await expect(page.locator(".decisionMetricGrid")).toContainText("Change from preceding year");
  await expect(page.locator(".decisionMetricGrid")).toContainText("percentage points");
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});
