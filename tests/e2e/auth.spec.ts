import { test, expect } from "@playwright/test";

/**
 * E2E smoke tests — Phase 0 auth flow
 *
 * Tests:
 * 1. Unauthenticated request to a protected route → redirect to /sign-in
 * 2. Sign-in page is reachable and shows the form
 * 3. Sign-up page is reachable and shows the form
 *
 * Note: Tests that actually sign in require a seeded database.
 * Seed setup is documented in README.md.
 */

test.describe("Unauthenticated access", () => {
  test("visiting / redirects to /dashboard then to /sign-in", async ({ page }) => {
    await page.goto("/");
    // Should end up on /sign-in (/ → /dashboard → /sign-in via middleware)
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("visiting /dashboard directly redirects to /sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("visiting /documents directly redirects to /sign-in", async ({ page }) => {
    await page.goto("/documents");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("visiting /compare directly redirects to /sign-in", async ({ page }) => {
    await page.goto("/compare");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("visiting /actions directly redirects to /sign-in", async ({ page }) => {
    await page.goto("/actions");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("Sign-in page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
  });

  test("renders the sign-in form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("has a link to the sign-up page", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  });

  test("displays an error for invalid credentials", async ({ page }) => {
    await page.getByLabel("Email").fill("nonexistent@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for the error message
    const alert = page.locator("form [role='alert']");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/invalid email or password|something went wrong/i);
  });
});

test.describe("Sign-up page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-up");
  });

  test("renders the sign-up form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("has a link back to sign-in", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("Legal disclaimer", () => {
  test("auth pages show the not-legal-advice disclaimer", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText(/not a substitute for professional legal advice/i)).toBeVisible();
  });
});

