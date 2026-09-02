import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["packages/*/src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: { branches: 80, functions: 85, lines: 85, statements: 85 },
    },
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "services/*/src/**/*.test.ts",
    ],
    passWithNoTests: false,
    testTimeout: 30_000,
  },
});
