import { test, expect } from "@playwright/test";

/**
 * Phase 8 — Professional Prep E2E Tests
 *
 * Verifies the complete document-level professional consultation briefing flow:
 * 1. Professional Prep Tab Access:
 *    - User navigates to workspace and selects the "Professional Prep" tab.
 *    - Panel renders with disclaimer banner, overview, key clauses, findings review,
 *      open checklist actions, discussion questions for counsel, and recorded user questions.
 * 2. Non-Lawyer Disclaimers & Safety:
 *    - Prominent banner and footer explicitly stating ClauseWise is not a law firm
 *      and the briefing does not constitute legal advice.
 * 3. Key Clauses Navigation:
 *    - Key clauses listed from document intelligence.
 *    - Clicking "View in Document Text" switches tab to Document Text and focuses the section.
 * 4. Finding Evidence Traceability:
 *    - Findings review shows attention items, obligations, ambiguities, and absent provisions.
 *    - Absent provisions clearly marked without fabricated excerpts.
 *    - Clicking "View Source Excerpt" on an attention item navigates to Document Text,
 *      scrolls to the section, and highlights the verbatim quote.
 * 5. Questions for Counsel:
 *    - Objective discussion prompts derived deterministically (never phrased as legal advice).
 * 6. Export Functionality:
 *    - Copy Markdown and Print / PDF buttons are rendered and accessible.
 */

test.describe("Phase 8 — Professional Prep Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to test workspace
    await page.goto("/test-workspace");
    await expect(page.getByTestId("document-workspace-viewer")).toBeVisible();
  });

  test("Renders Professional Prep tab and all organizational briefing sections", async ({
    page,
  }) => {
    // 1. Click Professional Prep tab
    const prepTabBtn = page.getByTestId("tab-prep-btn");
    await expect(prepTabBtn).toBeVisible();
    await prepTabBtn.click();

    // 2. Verify Professional Prep Panel is visible
    const prepPanel = page.getByTestId("professional-prep-panel");
    await expect(prepPanel).toBeVisible();

    // 3. Verify Disclaimer Banner & Footer
    const banner = page.getByTestId("prep-disclaimer-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Organizational & Consultation Briefing Only");
    await expect(banner).toContainText("not a law firm or legal representative");

    const footer = page.getByTestId("prep-disclaimer-footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText("No attorney-client relationship is formed");

    // 4. Verify Export Controls
    await expect(page.getByTestId("prep-copy-markdown-btn")).toBeVisible();
    await expect(page.getByTestId("prep-print-btn")).toBeVisible();

    // 5. Verify Document Overview
    const overview = page.getByTestId("prep-document-overview");
    await expect(overview).toBeVisible();
    await expect(overview).toContainText("Master Services Agreement");
    await expect(overview).toContainText("Alpha Corp");
    await expect(overview).toContainText("Omega LLC");
    await expect(overview).toContainText("State of Delaware");

    // 6. Verify Key Clauses
    const keyClauses = page.getByTestId("prep-key-clauses");
    await expect(keyClauses).toBeVisible();
    await expect(keyClauses).toContainText("Section 1: General Provisions and Term");
    await expect(keyClauses).toContainText("Section 2: Fees, Invoicing, and Payment Terms");

    // 7. Verify Findings Review
    const findingsReview = page.getByTestId("prep-findings-review");
    await expect(findingsReview).toBeVisible();
    await expect(findingsReview).toContainText("Short Notice for Billing Disputes");
    await expect(findingsReview).toContainText("Absence of Indemnification Clause");
    await expect(findingsReview).toContainText("Absent Standard Provision");

    // 8. Verify Questions for Counsel
    const counselQuestions = page.getByTestId("prep-questions-for-counsel");
    await expect(counselQuestions).toBeVisible();
    await expect(counselQuestions).toContainText("Suggested Questions for Legal Counsel");
    await expect(counselQuestions).toContainText("Indemnification");
    await expect(counselQuestions).toContainText("Short Notice for Billing Disputes");

    // 9. Verify Open Checklist Actions & User Questions
    await expect(page.getByTestId("prep-open-actions")).toBeVisible();
    await expect(page.getByTestId("prep-user-questions")).toBeVisible();
  });

  test("Key clause 'View in Document Text' switches tab, navigates to section", async ({
    page,
  }) => {
    // Open Prep tab
    await page.getByTestId("tab-prep-btn").click();
    await expect(page.getByTestId("professional-prep-panel")).toBeVisible();

    // Click "View in Document Text" on Section 1 key clause
    const viewSrcBtn = page.getByTestId("prep-clause-view-src-sec-1");
    await expect(viewSrcBtn).toBeVisible();
    await viewSrcBtn.click();

    // Document tab must now be active
    const documentTab = page.getByRole("tab", { name: /document text/i });
    await expect(documentTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("verbatim-document-panel")).toBeVisible();

    // Section 1 heading should be visible
    await expect(
      page.getByRole("heading", { name: "Section 1: General Provisions and Term" })
    ).toBeVisible();
  });

  test("Finding 'View Source Excerpt' switches tab and highlights verbatim quote", async ({
    page,
  }) => {
    // Open Prep tab
    await page.getByTestId("tab-prep-btn").click();
    await expect(page.getByTestId("professional-prep-panel")).toBeVisible();

    // Click "View Source Excerpt" on the attention finding (Short Notice for Billing Disputes)
    const viewSrcBtn = page.getByTestId("prep-finding-view-src-finding-att-1");
    await expect(viewSrcBtn).toBeVisible();
    await viewSrcBtn.click();

    // Document tab must now be active
    const documentTab = page.getByRole("tab", { name: /document text/i });
    await expect(documentTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("verbatim-document-panel")).toBeVisible();

    // Section 2 should be displayed
    await expect(
      page.getByRole("heading", { name: "Section 2: Fees, Invoicing, and Payment Terms" })
    ).toBeVisible();

    // Evidence highlight mark should be focused and contain the verbatim quote
    const highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText(
      "Customer shall notify Provider within thirty (30) days of any billing discrepancy"
    );
  });

  test("Direct URL navigation with tab=prep opens Professional Prep tab", async ({
    page,
  }) => {
    await page.goto("/test-workspace?tab=prep");
    await expect(page.getByTestId("professional-prep-panel")).toBeVisible();
    const prepTabBtn = page.getByTestId("tab-prep-btn");
    await expect(prepTabBtn).toHaveAttribute("aria-selected", "true");
  });
});

