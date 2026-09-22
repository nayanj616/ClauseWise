import { test, expect } from "@playwright/test";

/**
 * Phase 4.5 — Evidence-backed Analysis Display & Navigation E2E Tests
 *
 * Verifies end-to-end evidence navigation, linked views, absence truthfulness,
 * state regressions, and accessibility in a real browser.
 */

test.describe("Evidence Navigation — Complete User Journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-workspace");
    await expect(page.getByTestId("document-workspace-viewer")).toBeVisible();
  });

  test("FindingCard 'View in document' switches tab, selects section, highlights text, and focuses highlight", async ({
    page,
  }) => {
    // 1. Initial state: on Analysis tab
    const analysisTab = page.getByRole("tab", { name: /intelligence & findings/i });
    const documentTab = page.getByRole("tab", { name: /document text/i });
    await expect(analysisTab).toHaveAttribute("aria-selected", "true");

    // 2. Click "View in document" on the Effective Date finding in findings-list-container
    const listContainer = page.getByTestId("findings-list-container");
    const viewButton = listContainer.getByTestId("finding-view-in-doc-finding-date-1");
    await expect(viewButton).toBeVisible();
    await viewButton.click();

    // 3. Document tab must now be active
    await expect(documentTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("verbatim-document-panel")).toBeVisible();

    // 4. Correct section (Section 1) must be displayed
    await expect(
      page.getByRole("heading", { name: "Section 1: General Provisions and Term" })
    ).toBeVisible();

    // 5. Highlight element exists and contains the expected verbatim excerpt
    const highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText(
      "This Agreement shall commence on September 30, 2026"
    );

    // 6. Highlight receives focus for accessibility
    await expect(highlight).toBeFocused();
  });

  test("EvidencePanel 'View in Document Text' button navigates and highlights correctly", async ({
    page,
  }) => {
    // 1. Select the Maintenance Notice obligation finding in FindingList
    const listContainer = page.getByTestId("findings-list-container");
    const findingCard = listContainer.getByTestId("finding-card-finding-ob-1");
    await findingCard.click();

    // 2. Evidence panel must display the finding and its source excerpt
    const evidencePanel = page.getByTestId("evidence-panel-active");
    await expect(evidencePanel).toBeVisible();
    await expect(evidencePanel).toContainText("Maintenance Notice Requirement");
    await expect(page.getByTestId("substantive-evidence-block")).toBeVisible();

    // 3. Click "View in Document Text" in the EvidencePanel
    const jumpButton = page.getByTestId("jump-to-section-button");
    await expect(jumpButton).toBeVisible();
    await jumpButton.click();

    // 4. Workspace switches to Document tab with Section 1 and highlight
    const documentTab = page.getByRole("tab", { name: /document text/i });
    await expect(documentTab).toHaveAttribute("aria-selected", "true");

    const highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText(
      "Provider shall provide seventy-two (72) hours advance notice of scheduled maintenance"
    );
    await expect(highlight).toBeFocused();
  });
});

test.describe("Phase 4.4 Linked Views — Attention Items, Dates, and Financial Terms", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-workspace");
  });

  test("Attention Items view displays needs_attention findings and navigates to evidence", async ({
    page,
  }) => {
    const attentionSection = page.getByTestId("attention-items-section");
    await expect(attentionSection).toBeVisible();
    await expect(attentionSection).toContainText("Items Requiring Attention");

    // Must show the billing dispute attention item
    const billingCard = attentionSection.getByTestId("finding-card-finding-att-1");
    await expect(billingCard).toBeVisible();
    await expect(billingCard).toContainText("Short Notice for Billing Disputes");

    // Click "View in document" inside Attention Items
    const viewButton = attentionSection.getByTestId("finding-view-in-doc-finding-att-1");
    await viewButton.click();

    // Switches to Document tab and highlights Section 2
    await expect(page.getByTestId("verbatim-document-panel")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Section 2: Fees, Invoicing, and Payment Terms" })
    ).toBeVisible();

    const highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText(
      "Customer shall notify Provider within thirty (30) days of any billing discrepancy"
    );
  });

  test("Important Dates view displays formatted date badge and navigates to evidence", async ({
    page,
  }) => {
    const datesSection = page.getByTestId("formatted-dates-section");
    await expect(datesSection).toBeVisible();
    await expect(datesSection).toContainText("Important Dates");

    // Must show date card with formatted date badge
    const dateBadge = datesSection.getByTestId("finding-date-badge-finding-date-1");
    await expect(dateBadge).toBeVisible();
    await expect(dateBadge).toContainText("Sep 30, 2026");

    // Click "View in document" from Dates view
    const viewBtn = datesSection.getByTestId("finding-view-in-doc-finding-date-1");
    await viewBtn.click();

    // Verifies section 1 and highlight
    const highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toContainText("September 30, 2026");
  });

  test("Financial Terms view displays formatted currency badge and navigates to evidence", async ({
    page,
  }) => {
    const financialSection = page.getByTestId("formatted-financial-section");
    await expect(financialSection).toBeVisible();
    await expect(financialSection).toContainText("Financial Terms");

    // Must show financial card with formatted financial badge
    const financialBadge = financialSection.getByTestId("finding-financial-badge-finding-fin-1");
    await expect(financialBadge).toBeVisible();
    await expect(financialBadge).toContainText("$12,500 (monthly)");

    // Click "View in document" from Financial Terms view
    const viewBtn = financialSection.getByTestId("finding-view-in-doc-finding-fin-1");
    await viewBtn.click();

    // Navigates to Section 2 and highlights the subscription fee
    await expect(
      page.getByRole("heading", { name: "Section 2: Fees, Invoicing, and Payment Terms" })
    ).toBeVisible();

    const highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText(
      "The monthly subscription fee shall be $12,500 USD payable in advance"
    );
  });
});

test.describe("Missing-Information Truthfulness Invariant", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-workspace");
  });

  test("missing_information finding displays absence truthfulness without fake navigation or citations", async ({
    page,
  }) => {
    // FindingCard for missing information in findings-list-container
    const listContainer = page.getByTestId("findings-list-container");
    const missingCard = listContainer.getByTestId("finding-card-finding-miss-1");
    await expect(missingCard).toBeVisible();
    await expect(missingCard).toContainText("Absence in document");

    // Invariant: MUST NOT have a "View in document" button anywhere
    const viewBtn = page.locator('[data-testid="finding-view-in-doc-finding-miss-1"]');
    await expect(viewBtn).toHaveCount(0);

    // Click to select the missing information finding
    await missingCard.click();

    // Evidence panel must show absence block, not substantive quote block
    const evidencePanel = page.getByTestId("evidence-panel-active");
    await expect(evidencePanel).toBeVisible();
    await expect(page.getByTestId("missing-information-evidence-block")).toBeVisible();
    await expect(page.getByTestId("substantive-evidence-block")).toHaveCount(0);
    await expect(evidencePanel).toContainText("Absence in Document");
    await expect(evidencePanel).toContainText("Indemnification");
    await expect(evidencePanel).toContainText("No source text exists because the provision is absent");

    // Invariant: Evidence panel must NOT show "View in Document Text" jump button
    await expect(page.getByTestId("jump-to-section-button")).toHaveCount(0);
  });
});

test.describe("Multiple Findings Navigation & Isolation Regression", () => {
  test("navigating to Finding A then Finding B resets highlight to Finding B only", async ({
    page,
  }) => {
    await page.goto("/test-workspace");
    const listContainer = page.getByTestId("findings-list-container");

    // 1. Navigate to Finding Date (Section 1)
    await listContainer.getByTestId("finding-view-in-doc-finding-date-1").click();
    await expect(
      page.getByRole("heading", { name: "Section 1: General Provisions and Term" })
    ).toBeVisible();
    let highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toHaveText("This Agreement shall commence on September 30, 2026");

    // 2. Return to Analysis tab
    await page.getByRole("tab", { name: /intelligence & findings/i }).click();

    // 3. Navigate to Finding Financial (Section 2)
    await listContainer.getByTestId("finding-view-in-doc-finding-fin-1").click();
    await expect(
      page.getByRole("heading", { name: "Section 2: Fees, Invoicing, and Payment Terms" })
    ).toBeVisible();

    // Highlight is now Finding B's text only
    highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toHaveCount(1);
    await expect(highlight).toHaveText(
      "The monthly subscription fee shall be $12,500 USD payable in advance"
    );

    // Section 1's text is not in Section 2, verifying section separation
    await expect(page.getByTestId("active-section-content")).not.toContainText(
      "commence on September 30, 2026"
    );
  });
});

test.describe("Manual Section Navigation Regression", () => {
  test("manually switching sections preserves document viewing and subsequent finding navigation", async ({
    page,
  }) => {
    await page.goto("/test-workspace?tab=document");
    await expect(page.getByTestId("verbatim-document-panel")).toBeVisible();

    // Initially at Section 1
    await expect(
      page.getByRole("heading", { name: "Section 1: General Provisions and Term" })
    ).toBeVisible();

    // Click Next section button
    const nextBtn = page.getByRole("button", { name: "Next section" });
    await nextBtn.click();

    // Now at Section 2
    await expect(
      page.getByRole("heading", { name: "Section 2: Fees, Invoicing, and Payment Terms" })
    ).toBeVisible();

    // Click Section 3 in sidebar
    const sec3Btn = page.getByRole("button", { name: "Section 3: Governing Law and Dispute Resolution" });
    await sec3Btn.click();
    await expect(
      page.getByRole("heading", { name: "Section 3: Governing Law and Dispute Resolution" })
    ).toBeVisible();

    // Switch back to Analysis tab
    await page.getByRole("tab", { name: /intelligence & findings/i }).click();

    // Click "View in document" on Finding Date (Section 1)
    const listContainer = page.getByTestId("findings-list-container");
    await listContainer.getByTestId("finding-view-in-doc-finding-date-1").click();

    // Successfully returns to Section 1 with highlight
    await expect(
      page.getByRole("heading", { name: "Section 1: General Provisions and Term" })
    ).toBeVisible();
    const highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText("This Agreement shall commence on September 30, 2026");
  });
});

test.describe("Status-State Handling Regressions", () => {
  test("processing state displays processing indicator", async ({ page }) => {
    await page.goto("/test-workspace?state=processing");
    await expect(page.getByTestId("workspace-processing-state")).toBeVisible();
    await expect(page.getByText(/document is being processed/i)).toBeVisible();
  });

  test("error state displays user-safe error message", async ({ page }) => {
    await page.goto("/test-workspace?state=error");
    await expect(page.getByTestId("workspace-error-state")).toBeVisible();
    await expect(page.getByText(/failed to parse document content/i)).toBeVisible();
  });

  test("empty state displays empty content message", async ({ page }) => {
    await page.goto("/test-workspace?state=empty");
    await expect(page.getByTestId("workspace-empty-state")).toBeVisible();
    await expect(page.getByText(/no readable content found/i)).toBeVisible();
  });

  test("not found state displays document not found", async ({ page }) => {
    await page.goto("/test-workspace?state=not-found");
    await expect(page.getByTestId("workspace-not-found-state")).toBeVisible();
    await expect(page.getByRole("heading", { name: /document not found/i })).toBeVisible();
  });
});

test.describe("Accessibility & Security Verification", () => {
  test("keyboard navigation: Enter selects finding card and updates evidence panel", async ({
    page,
  }) => {
    await page.goto("/test-workspace");

    const listContainer = page.getByTestId("findings-list-container");
    const dateCard = listContainer.getByTestId("finding-card-finding-date-1");
    await dateCard.focus();
    await expect(dateCard).toBeFocused();

    // Press Enter to select
    await page.keyboard.press("Enter");

    // Evidence panel updates to show Effective Date
    const evidencePanel = page.getByTestId("evidence-panel-active");
    await expect(evidencePanel).toContainText("Agreement Effective Date");
    await expect(evidencePanel).toContainText("This Agreement shall commence on September 30, 2026");
  });

  test("legal disclaimer is displayed prominently", async ({ page }) => {
    await page.goto("/test-workspace");
    await expect(
      page.getByText(/not a substitute for professional legal advice/i)
    ).toBeVisible();
  });
});
