import { test, expect } from "@playwright/test";

/**
 * Phase 9 — Document Comparison E2E Tests
 *
 * Verifies the complete objective side-by-side document comparison workflow:
 * 1. Compare Workspace Access & Non-Lawyer Disclaimers:
 *    - User navigates to /test-compare.
 *    - Header, disclaimer banner, and footer render with clear non-lawyer notices.
 * 2. Document Selection & Dynamic Comparison:
 *    - Document selector pair displays ready user documents.
 *    - Swap button (↔) swaps Document A and Document B.
 * 3. Overview Metrics & Metadata Diff:
 *    - Summary card displays total differences, modified, added, removed, and unchanged counts.
 *    - Metadata comparison highlights changed fields (e.g. Governing Law, Jurisdiction).
 * 4. Section Differences & Evidence Traceability:
 *    - Difference cards render for modified, added, removed, and unchanged clauses.
 *    - Side-by-side excerpts show verbatim text and page references.
 *    - "View in Document A" and "View in Document B" deep-link back to Document Workspace.
 * 5. Filtering and Search:
 *    - Filter tabs isolate modified, added, removed, or unchanged clauses.
 *    - Text search filters clauses by keyword.
 * 6. Empty & Edge States:
 *    - Graceful messaging when fewer than two documents exist or when selection is pending.
 */

test.describe("Phase 9 — Document Comparison Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-compare");
    await expect(page.getByTestId("comparison-workspace")).toBeVisible();
  });

  test("Renders Compare workspace with disclaimers and selector pair", async ({ page }) => {
    // 1. Verify Header
    await expect(
      page.getByRole("heading", { name: "Compare Documents" })
    ).toBeVisible();

    // 2. Verify Legal & Non-Lawyer Disclaimers
    const banner = page.getByTestId("compare-disclaimer-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Objective Document Comparison");
    await expect(banner).toContainText("not legal advice");

    const footer = page.getByTestId("compare-disclaimer-footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText("No attorney-client relationship is formed");

    // 3. Verify Document Selector Pair
    await expect(page.getByTestId("document-selector-pair")).toBeVisible();
    await expect(page.getByTestId("doc-a-select")).toBeVisible();
    await expect(page.getByTestId("doc-b-select")).toBeVisible();
    await expect(page.getByTestId("swap-docs-btn")).toBeVisible();
  });

  test("Renders comparison summary card and metadata differences", async ({ page }) => {
    // 1. Verify Summary Card & Counts
    const summaryCard = page.getByTestId("comparison-summary-card");
    await expect(summaryCard).toBeVisible();
    await expect(page.getByTestId("stat-total-diffs")).toContainText("4");
    await expect(page.getByTestId("stat-modified")).toContainText("2");
    await expect(page.getByTestId("stat-added")).toContainText("1");
    await expect(page.getByTestId("stat-removed")).toContainText("1");
    await expect(page.getByTestId("stat-unchanged")).toContainText("1");

    // 2. Verify Metadata Diff Card
    const metaCard = page.getByTestId("metadata-diff-card");
    await expect(metaCard).toBeVisible();
    await expect(metaCard).toContainText("Governing Law");
    await expect(metaCard).toContainText("State of New York");
    await expect(metaCard).toContainText("State of Delaware");
    await expect(metaCard).toContainText("Jurisdiction");
    await expect(metaCard).toContainText("New York County, NY");
    await expect(metaCard).toContainText("Wilmington, DE");
  });

  test("Renders section differences with side-by-side evidence and deep links", async ({ page }) => {
    const diffList = page.getByTestId("differences-list-container");
    await expect(diffList).toBeVisible();

    // 1. Modified clause (Definition of Confidential Information)
    const modCard = page.getByTestId("diff-card-diff-sec-1");
    await expect(modCard).toBeVisible();
    await expect(modCard).toContainText("Definition of Confidential Information");
    await expect(modCard).toContainText("Confidential Information means all non-public technical and financial data.");
    await expect(modCard).toContainText("Confidential Information means all non-public technical, algorithmic weights");

    // Check deep links
    const linkDocA = page.getByTestId("diff-view-doc-a-diff-sec-1");
    await expect(linkDocA).toBeVisible();
    await expect(linkDocA).toHaveAttribute(
      "href",
      "/documents/doc-nda-v1?tab=document&sectionId=sec-nda1-1&findingId=finding-att-1"
    );

    const linkDocB = page.getByTestId("diff-view-doc-b-diff-sec-1");
    await expect(linkDocB).toBeVisible();
    await expect(linkDocB).toHaveAttribute(
      "href",
      "/documents/doc-nda-v2?tab=document&sectionId=sec-nda2-1&findingId=finding-att-2"
    );

    // 2. Added clause (Non-Solicitation in Doc B only)
    const addedCard = page.getByTestId("diff-card-diff-sec-3");
    await expect(addedCard).toBeVisible();
    await expect(addedCard).toContainText("Non-Solicitation of Personnel");
    await expect(addedCard).toContainText("Clause absent from Document A");
    await expect(addedCard).toContainText("Neither party shall solicit or recruit any employee");

    // 3. Removed clause (Arbitration in Doc A only)
    const removedCard = page.getByTestId("diff-card-diff-sec-4");
    await expect(removedCard).toBeVisible();
    await expect(removedCard).toContainText("Arbitration and Dispute Resolution");
    await expect(removedCard).toContainText("settled by arbitration in NY");
    await expect(removedCard).toContainText("Clause absent from Document B");
  });

  test("Filters differences by category tabs and search keyword", async ({ page }) => {
    const diffList = page.getByTestId("differences-list-container");
    await expect(diffList).toBeVisible();

    // Initial state: all 5 difference items visible
    await expect(page.getByTestId("diff-card-diff-sec-1")).toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-3")).toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-4")).toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-5")).toBeVisible();

    // 1. Filter: Modified only
    await page.getByTestId("filter-tab-modified").click();
    await expect(page.getByTestId("diff-card-diff-sec-1")).toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-2")).toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-3")).not.toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-4")).not.toBeVisible();

    // 2. Filter: Added only
    await page.getByTestId("filter-tab-added").click();
    await expect(page.getByTestId("diff-card-diff-sec-3")).toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-1")).not.toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-2")).not.toBeVisible();

    // 3. Filter: Removed only
    await page.getByTestId("filter-tab-removed").click();
    await expect(page.getByTestId("diff-card-diff-sec-4")).toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-3")).not.toBeVisible();

    // 4. Filter: Unchanged only
    await page.getByTestId("filter-tab-unchanged").click();
    await expect(page.getByTestId("diff-card-diff-sec-5")).toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-1")).not.toBeVisible();

    // 5. Reset to All and test search input
    await page.getByTestId("filter-tab-all").click();
    const searchInput = page.getByTestId("diff-search-input");
    await searchInput.fill("solicitation");

    // Only non-solicitation card should match
    await expect(page.getByTestId("diff-card-diff-sec-3")).toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-1")).not.toBeVisible();
    await expect(page.getByTestId("diff-card-diff-sec-4")).not.toBeVisible();
  });

  test("Swap button toggles Document A and Document B selections", async ({ page }) => {
    // Intercept comparison API calls when swapped
    let swappedRequestDetected = false;
    await page.route("**/api/documents/compare*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("docA") === "doc-nda-v2" && url.searchParams.get("docB") === "doc-nda-v1") {
        swappedRequestDetected = true;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          documentA: {
            id: "doc-nda-v2",
            title: "Non-Disclosure Agreement 2026",
            filename: "NDA_2026.pdf",
            documentType: "Non-Disclosure Agreement",
            pageCount: 4,
            governingLaw: "State of Delaware",
            jurisdiction: "Wilmington, DE",
            parties: [],
          },
          documentB: {
            id: "doc-nda-v1",
            title: "Non-Disclosure Agreement 2024",
            filename: "NDA_2024.pdf",
            documentType: "Non-Disclosure Agreement",
            pageCount: 3,
            governingLaw: "State of New York",
            jurisdiction: "New York County, NY",
            parties: [],
          },
          metadataDifferences: [],
          differences: [],
          summary: {
            totalDifferences: 0,
            addedCount: 0,
            removedCount: 0,
            modifiedCount: 0,
            unchangedCount: 0,
          },
          comparedAt: new Date().toISOString(),
        }),
      });
    });

    const swapBtn = page.getByTestId("swap-docs-btn");
    await expect(swapBtn).toBeVisible();
    await swapBtn.click();

    expect(swappedRequestDetected).toBe(true);
  });

  test("Renders friendly empty states when fewer than two documents exist", async ({ page }) => {
    await page.goto("/test-compare?state=fewer_than_two_docs");
    const emptyState = page.getByTestId("compare-empty-fewer-than-two");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText("Upload at least two documents");
  });

  test("Renders no selection state when documents have not been chosen", async ({ page }) => {
    await page.goto("/test-compare?state=no_selection");
    const emptyState = page.getByTestId("compare-empty-no-selection");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText("Select Two Documents to Compare");
  });
});
