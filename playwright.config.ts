import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.JGZ_E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `bun apps/sandbox/src/server.ts --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
