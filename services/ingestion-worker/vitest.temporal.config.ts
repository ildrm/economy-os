import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    fileParallelism: false,
    include: ["src/**/*.temporal.ts"],
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
