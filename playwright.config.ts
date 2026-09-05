import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://127.0.0.1:3210", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "pnpm dev:e2e", url: "http://127.0.0.1:3210/onboarding", timeout: 120_000, reuseExistingServer: false },
});
