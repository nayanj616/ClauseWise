import { test, expect } from "@playwright/test";

/**
 * Phase 7 — Action Center E2E Tests
 *
 * Verifies the complete review action lifecycle:
 * 1. Finding -> Add Action:
 *    - User opens document workspace.
 *    - Clicks "Add action" on a finding card.
 *    - CreateActionDialog modal opens with linked finding context and pre-filled title.
 *    - Submitting the form posts to /api/actions and closes the dialog.
 * 2. Action Center Overview:
 *    - Navigates to Action Center (/test-actions).
 *    - Verifies action appears with title, description, document name, section, page, and verbatim quote.
 *    - Verifies Open and Completed counters.
 * 3. Status Lifecycle (Open -> Completed -> Reopen):
 *    - Clicking the checkbox completes the action (moves to Completed section).
 *    - Clicking the checkbox on a completed action reopens it (moves back to Open section).
 * 4. Filtering:
 *    - Switching between All, Open, and Completed status tabs filters the view.
 * 5. Return-to-Source Navigation:
 *    - Clicking "View source in document" navigates back to the Document Workspace.
 *    - The document viewer opens directly to the referenced section with the exact evidence highlighted.
 */

test.describe("Phase 7 — Action Center Flow", () => {
  test("Complete Action Lifecycle: Create -> Action Center -> Complete -> Reopen -> Return to Source", async ({
    page,
  }) => {
    // -----------------------------------------------------------------------
    // Step 1: Document Workspace & Create Action Dialog
    // -----------------------------------------------------------------------
    await page.goto("/test-workspace");
    await expect(page.getByTestId("document-workspace-viewer")).toBeVisible();

    // Verify finding card has "Add action" button
    const listContainer = page.getByTestId("findings-list-container");
    const addActionBtn = listContainer.getByTestId("finding-add-action-finding-date-1");
    await expect(addActionBtn).toBeVisible();

    // Mock POST /api/actions
    let capturedCreatePayload: Record<string, unknown> | null = null;
    await page.route("**/api/actions", async (route) => {
      if (route.request().method() === "POST") {
        capturedCreatePayload = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            action: {
              id: "action-created-1",
              documentId: capturedCreatePayload?.documentId,
              findingId: capturedCreatePayload?.findingId,
              userId: "user-test",
              title: capturedCreatePayload?.title,
              description: capturedCreatePayload?.description || null,
              status: "open",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedAt: null,
            },
          }),
        });
      }
    });

    // Click "Add action" on finding
    await addActionBtn.click();

    // Verify CreateActionDialog modal is open
    const dialog = page.getByTestId("create-action-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Add to Action Center")).toBeVisible();
    await expect(dialog.getByText("Agreement Effective Date")).toBeVisible();

    // Verify prefilled title
    const titleInput = page.getByTestId("create-action-title-input");
    await expect(titleInput).toHaveValue("Review Agreement Effective Date");

    // Enter custom description
    const descInput = page.getByTestId("create-action-description-input");
    await descInput.fill("Verify start date with finance department.");

    // Submit form
    const submitBtn = page.getByTestId("create-action-submit-button");
    await submitBtn.click();

    // Modal should close
    await expect(dialog).not.toBeVisible();
    expect(capturedCreatePayload).toMatchObject({
      documentId: "test-doc-12345",
      findingId: "finding-date-1",
      title: "Review Agreement Effective Date",
      description: "Verify start date with finance department.",
    });

    // -----------------------------------------------------------------------
    // Step 2: Action Center Overview
    // -----------------------------------------------------------------------
    await page.goto("/test-actions");
    const actionCenter = page.getByTestId("action-center-container");
    await expect(actionCenter).toBeVisible();

    // Verify counters
    await expect(actionCenter.getByText("1 Open")).toBeVisible();
    await expect(actionCenter.getByText("0 Completed")).toBeVisible();

    // Verify action card presence and metadata
    const actionCard = page.getByTestId("action-card-action-e2e-1");
    await expect(actionCard).toBeVisible();
    await expect(
      actionCard.getByText("Confirm scheduled maintenance notice period")
    ).toBeVisible();
    await expect(
      actionCard.getByText("Ask provider if 72 hours can be increased to 5 days.")
    ).toBeVisible();
    await expect(actionCard.getByText("Master Services Agreement 2026")).toBeVisible();
    await expect(actionCard.getByText("Section 1: General Provisions and Term")).toBeVisible();
    await expect(
      actionCard.getByText(
        "Provider shall provide seventy-two (72) hours advance notice of scheduled maintenance"
      )
    ).toBeVisible();

    // Checkbox is unchecked
    const checkbox = page.getByTestId("action-checkbox-action-e2e-1");
    await expect(checkbox).toHaveAttribute("aria-checked", "false");

    // -----------------------------------------------------------------------
    // Step 3: Complete Action (Open -> Completed)
    // -----------------------------------------------------------------------
    // Mock PATCH /api/actions/*
    await page.route("**/api/actions/action-e2e-1", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON() || {};
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            action: {
              id: "action-e2e-1",
              status: body.status,
              completedAt: body.status === "completed" ? new Date().toISOString() : null,
              updatedAt: new Date().toISOString(),
            },
          }),
        });
      }
    });

    await checkbox.click();

    // Verify checkbox is now checked
    await expect(checkbox).toHaveAttribute("aria-checked", "true");

    // Verify it moved to Completed section
    const completedSection = page.getByTestId("completed-actions-section");
    await expect(completedSection).toBeVisible();
    await expect(completedSection.getByTestId("action-card-action-e2e-1")).toBeVisible();

    // Verify counters updated
    await expect(actionCenter.getByText("0 Open")).toBeVisible();
    await expect(actionCenter.getByText("1 Completed")).toBeVisible();

    // -----------------------------------------------------------------------
    // Step 4: Reopen Action (Completed -> Open)
    // -----------------------------------------------------------------------
    await checkbox.click();

    // Verify checkbox is back to unchecked
    await expect(checkbox).toHaveAttribute("aria-checked", "false");

    // Verify it moved back to Open section
    const openSection = page.getByTestId("open-actions-section");
    await expect(openSection).toBeVisible();
    await expect(openSection.getByTestId("action-card-action-e2e-1")).toBeVisible();

    // Verify counters updated back
    await expect(actionCenter.getByText("1 Open")).toBeVisible();
    await expect(actionCenter.getByText("0 Completed")).toBeVisible();

    // -----------------------------------------------------------------------
    // Step 5: Filter Tabs
    // -----------------------------------------------------------------------
    const openFilterBtn = page.getByTestId("filter-open-button");
    await openFilterBtn.click();
    await expect(page.getByTestId("open-actions-list")).toBeVisible();
    await expect(page.getByTestId("action-card-action-e2e-1")).toBeVisible();

    const completedFilterBtn = page.getByTestId("filter-completed-button");
    await completedFilterBtn.click();
    await expect(page.getByTestId("completed-actions-list")).toBeVisible();
    await expect(page.getByText("No completed items yet")).toBeVisible();

    const allFilterBtn = page.getByTestId("filter-all-button");
    await allFilterBtn.click();
    await expect(page.getByTestId("open-actions-section")).toBeVisible();

    // -----------------------------------------------------------------------
    // Step 6: Return-to-Source Navigation
    // -----------------------------------------------------------------------
    const viewSourceLink = page.getByTestId("action-view-source-action-e2e-1");
    await expect(viewSourceLink).toBeVisible();
    await viewSourceLink.click();

    // Verify browser navigated to document workspace
    await expect(page).toHaveURL(/.*test-workspace\?sectionId=sec-1&findingId=finding-ob-1&tab=document/);

    // Verify document tab is active
    const documentTab = page.getByRole("tab", { name: /document text/i });
    await expect(documentTab).toHaveAttribute("aria-selected", "true");

    // Verify section heading is visible
    await expect(
      page.getByRole("heading", { name: "Section 1: General Provisions and Term" })
    ).toBeVisible();

    // Verify highlight element is visible and focused with verbatim excerpt
    const highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText(
      "Provider shall provide seventy-two (72) hours advance notice of scheduled maintenance"
    );
  });
});
