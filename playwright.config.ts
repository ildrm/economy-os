import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.CI === "true" ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4401",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "corepack pnpm --filter @economyos/web start --hostname 127.0.0.1 --port 4401",
    url: "http://127.0.0.1:4401/en",
    reuseExistingServer: process.env.CI !== "true",
    timeout: 30_000,
  },
});
