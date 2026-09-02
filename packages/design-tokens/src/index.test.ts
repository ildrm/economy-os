import { describe, expect, it } from "vitest";
import { dataColors, spacing } from "./index.js";

describe("design tokens", () => {
  it("exposes semantic data classes and spacing without raw product colors", () => {
    expect(dataColors.forecast).toBe("var(--data-forecast)");
    expect(dataColors.scenario).toBe("var(--data-scenario)");
    expect(spacing[4]).toBe("var(--space-4)");
  });
});
