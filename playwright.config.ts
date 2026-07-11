import { defineConfig, devices } from "@playwright/test";
import { e2eProjectsRoot } from "./tests/e2e/fixtures/e2e-projects-root";

const port = process.env.JGZ_E2E_PORT ?? "4173";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command:
      `bun apps/sandbox/src/server.ts --host 127.0.0.1 --port ${port} ` +
      `--projects-root ${e2eProjectsRoot} --test-fixtures`,
    url: baseURL,
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
