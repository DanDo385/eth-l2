import { defineConfig, devices } from "@playwright/test";
import { FRONTEND_PORT, FRONTEND_URL } from "./app/data/ports";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,   // share the single dev server; run tests serially
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? FRONTEND_URL,
    trace: "on-first-retry",
    screenshot: "on",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${process.env.ETH_L2_FRONTEND_PORT ?? FRONTEND_PORT}`,
    url: process.env.PLAYWRIGHT_BASE_URL ?? FRONTEND_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
