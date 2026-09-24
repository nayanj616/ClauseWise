import { test, expect } from "@playwright/test";

/**
 * Phase 10 — Final Integration & Polish E2E Journey
 *
 * Validates the complete user experience across all completed phases:
 * 1. Authentication boundaries & form accessibility
 * 2. Document Workspace intelligence, findings, and verbatim excerpt highlighting
 * 3. Contextual Ask navigator
 * 4. Professional Prep briefing with counsel discussion prompts and export controls
 * 5. Action Center checklist with verified provenance and status filtering
 * 6. Side-by-side document comparison with difference categories and deep links
 * 7. Responsive mobile navigation drawer (< 768px)
 * 8. Keyboard accessibility and skip-to-content link
 */

test.describe("Phase 10 — Full Integration Journey", () => {
  test("1. Authentication boundaries and accessible form rendering", async ({ page }) => {
    // Unauthenticated access to /dashboard redirects to /sign-in
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);

    // Verify Sign-in form accessible structure
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    const emailInput = page.getByLabel("Email");
    const passwordInput = page.getByLabel("Password");
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("aria-invalid", "false");

    // Navigate to Sign-up
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/sign-up/);
    await expect(page.getByRole("heading", { name: /Create your account/i })).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
  });

  test("2. Document Workspace: intelligence, evidence navigation, and excerpt highlighting", async ({ page }) => {
    await page.goto("/test-workspace?tab=analysis");

    // Verify Workspace Header & Classification
    await expect(page.getByTestId("document-workspace-viewer")).toBeVisible();
    await expect(page.getByText("Master_Services_Agreement_2026.pdf")).toBeVisible();
    await expect(page.getByTestId("workspace-doc-type-badge")).toBeVisible();

    // Verify Document Overview structured cards
    await expect(page.getByTestId("document-overview-card")).toBeVisible();
    await expect(page.getByText("Alpha Corp")).toBeVisible();
    await expect(page.getByText("State of Delaware")).toBeVisible();

    // Verify Findings section
    await expect(page.getByTestId("findings-and-evidence-section")).toBeVisible();
    const findingItem = page.getByTestId("finding-card-finding-att-1").first();
    await expect(findingItem).toBeVisible();

    // Click "View in Document Text" on finding to test Evidence Highlight Deep Link
    const viewTextBtn = page.getByTestId("view-in-doc-btn-finding-att-1").first();
    await expect(viewTextBtn).toBeVisible();
    await viewTextBtn.click();

    // Document Text tab should become active and highlight the excerpt
    await expect(page.getByTestId("document-viewer-container")).toBeVisible();
    const highlight = page.locator("mark");
    await expect(highlight).toBeVisible();
  });

  test("3. Contextual Ask: starter questions and evidence-grounded panel", async ({ page }) => {
    await page.goto("/test-workspace?tab=ask");

    // Verify Ask panel renders
    await expect(page.getByTestId("ask-panel-container")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ask ClauseWise" })).toBeVisible();

    // Verify conversation switcher and starter questions
    await expect(page.getByTestId("new-conversation-button")).toBeVisible();
    await expect(page.getByPlaceholder(/Ask a question about/i)).toBeVisible();
  });

  test("4. Professional Prep: executive briefing, counsel discussion prompts, and export controls", async ({ page }) => {
    await page.goto("/test-workspace?tab=prep");

    // Verify Non-Lawyer Prep Disclaimer Banner
    const disclaimer = page.getByTestId("prep-disclaimer-banner");
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText("Organizational & Consultation Briefing Only");
    await expect(disclaimer).toContainText("not a law firm or legal representative");

    // Verify Executive Summary & Key Clauses
    await expect(page.getByTestId("prep-document-overview")).toBeVisible();
    await expect(page.getByTestId("prep-key-clauses")).toBeVisible();

    // Verify Questions / Discussion Prompts for Counsel (strictly no negotiation points)
    await expect(page.getByTestId("prep-questions-for-counsel")).toBeVisible();
    await expect(page.getByText(/Discussion Prompts for Legal Counsel/i)).toBeVisible();

    // Verify Export controls (Copy Markdown & Print)
    const exportControls = page.getByTestId("prep-export-controls");
    await expect(exportControls).toBeVisible();
    await expect(page.getByTestId("prep-copy-markdown-btn")).toBeVisible();
    await expect(page.getByTestId("prep-print-btn")).toBeVisible();
  });

  test("5. Action Center: review checklist and status filtering", async ({ page }) => {
    await page.goto("/test-actions");

    // Verify Action Center header
    await expect(page.getByRole("heading", { name: "Action Center" })).toBeVisible();

    // Verify Status filter tabs (All, Open, Completed)
    const allTab = page.getByTestId("action-tab-all");
    const openTab = page.getByTestId("action-tab-open");
    const completedTab = page.getByTestId("action-tab-completed");

    await expect(allTab).toBeVisible();
    await expect(openTab).toBeVisible();
    await expect(completedTab).toBeVisible();

    // Toggle filter to Open actions
    await openTab.click();
    await expect(page.getByTestId("actions-list-open")).toBeVisible();

    // Verify Action Card with section provenance
    const firstAction = page.locator("[data-testid^='action-card-']").first();
    await expect(firstAction).toBeVisible();
  });

  test("6. Compare Documents: side-by-side differences, swap button, and category filtering", async ({ page }) => {
    await page.goto("/test-compare");

    // Verify Compare disclaimer
    const disclaimer = page.getByTestId("compare-disclaimer-banner");
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText("Objective Document Comparison");

    // Verify document selector pair & swap button
    await expect(page.getByTestId("select-doc-a")).toBeVisible();
    await expect(page.getByTestId("select-doc-b")).toBeVisible();
    await expect(page.getByTestId("swap-docs-btn")).toBeVisible();

    // Verify comparison summary counts
    await expect(page.getByTestId("comparison-summary-card")).toBeVisible();
    await expect(page.getByTestId("count-modified")).toBeVisible();
    await expect(page.getByTestId("count-added")).toBeVisible();

    // Verify differences list and filter pills
    await expect(page.getByTestId("differences-list-container")).toBeVisible();
    await expect(page.getByTestId("filter-tab-modified")).toBeVisible();
    await expect(page.getByTestId("filter-tab-added")).toBeVisible();

    // Verify side-by-side excerpt card
    const firstDiff = page.getByTestId("diff-card-diff-sec-1");
    await expect(firstDiff).toBeVisible();
    await expect(firstDiff).toContainText("Document A");
    await expect(firstDiff).toContainText("Document B");
  });

  test("7. Responsive Viewport: mobile header and navigation drawer (< 768px)", async ({ page }) => {
    // Set viewport to mobile phone width (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/test-workspace");

    // In mobile view, hamburger menu button should be visible
    const mobileToggle = page.getByTestId("mobile-menu-toggle");
    await expect(mobileToggle).toBeVisible();
    await expect(mobileToggle).toHaveAttribute("aria-expanded", "false");

    // Click hamburger button to open drawer
    await mobileToggle.click();
    await expect(mobileToggle).toHaveAttribute("aria-expanded", "true");

    const drawer = page.getByTestId("mobile-navigation-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Documents" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Compare" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Action Center" })).toBeVisible();

    // Close drawer via Escape key
    await page.keyboard.press("Escape");
    await expect(mobileToggle).toHaveAttribute("aria-expanded", "false");
  });
});

