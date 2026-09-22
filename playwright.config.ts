import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "msedge",
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/clausewise_test",
      NEXTAUTH_SECRET: "test-secret-at-least-32-chars-long-placeholder",
      NEXTAUTH_URL: "http://localhost:3000",
      SUPABASE_URL: "https://placeholder.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      OPENAI_API_KEY: "sk-placeholder-test-key",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
});

