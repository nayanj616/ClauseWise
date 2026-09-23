import { test, expect } from "@playwright/test";

/**
 * Phase 5.3 — Ask UI & Grounded Citation Navigation E2E Tests
 *
 * Verifies:
 * 1. Ask tab navigation within Document Workspace.
 * 2. Starter prompt prefilling into the question textarea.
 * 3. Question submission and display of grounded answer.
 * 4. Grounded citation card display without similarity score exposure.
 * 5. Citation navigation: Clicking "View in Document" switches to Document tab,
 *    selects the correct section, and highlights the verbatim evidence excerpt.
 * 6. Insufficient evidence handling: Displays grounded refusal banner without guessing.
 * 7. Unverified citation edge case: Empty citations with answer displays unverified banner.
 */

test.describe("Ask UI & Citation Navigation Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-workspace");
    await expect(page.getByTestId("document-workspace-viewer")).toBeVisible();
  });

  test("Ask tab navigation, question submission, grounded answer, and citation jump to verbatim text", async ({
    page,
  }) => {
    // 1. Switch to Ask tab
    const askTab = page.getByRole("tab", { name: "Ask" });
    const documentTab = page.getByRole("tab", { name: /document text/i });
    await expect(askTab).toBeVisible();
    await askTab.click();
    await expect(askTab).toHaveAttribute("aria-selected", "true");

    // 2. Initial empty state is displayed
    await expect(page.getByTestId("ask-empty-state")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /ask any question about this document/i })
    ).toBeVisible();

    // 3. Click starter prompt
    const starterBtn = page.getByRole("button", {
      name: /what are the payment terms and invoice dispute deadlines/i,
    });
    await expect(starterBtn).toBeVisible();
    await starterBtn.click();

    // 4. Verify input contains selected prompt
    const textarea = page.locator("#ask-question-input");
    await expect(textarea).toHaveValue(
      "What are the payment terms and invoice dispute deadlines?"
    );

    // 5. Mock Q&A API route response
    await page.route("**/api/documents/**/ask", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer:
            "Customer agrees to pay all undisputed invoices within thirty (30) days of receipt.",
          hasSufficientEvidence: true,
          isGrounded: true,
          citationValidationPassed: true,
          citations: [
            {
              chunkId: "chunk-sec-2",
              documentId: "test-doc-12345",
              sectionId: "sec-2",
              pageNumber: 2,
              sourceText:
                "Customer agrees to pay all undisputed invoices within thirty (30) days of receipt.",
              similarity: 0.892,
            },
          ],
          evidenceUsed: [],
          documentId: "test-doc-12345",
          question: "What are the payment terms and invoice dispute deadlines?",
        }),
      });
    });

    // 6. Submit the question
    const submitBtn = page.getByTestId("ask-submit-button");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 7. Verify grounded answer is rendered
    await expect(page.getByTestId("ask-grounded-answer")).toBeVisible();
    await expect(page.getByText("Grounded in Evidence")).toBeVisible();
    await expect(
      page.getByText(
        "Customer agrees to pay all undisputed invoices within thirty (30) days of receipt."
      )
    ).toBeVisible();

    // 8. Verify citation card
    await expect(page.getByTestId("ask-citations-section")).toBeVisible();
    const citationCard = page.getByTestId("citation-card-0");
    await expect(citationCard).toBeVisible();
    await expect(citationCard.getByText("Page 2")).toBeVisible();
    await expect(
      citationCard.getByText("Section 2: Fees, Invoicing, and Payment Terms")
    ).toBeVisible();

    // Verify similarity score is NOT visible
    await expect(citationCard.getByText("0.892")).not.toBeVisible();
    await expect(citationCard.getByText(/similarity/i)).not.toBeVisible();

    // 9. Click "View in Document" on the citation
    const viewInDocBtn = citationCard.getByTestId("citation-view-btn-0");
    await expect(viewInDocBtn).toBeVisible();
    await viewInDocBtn.click();

    // 10. Document Text tab must now be active
    await expect(documentTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("verbatim-document-panel")).toBeVisible();

    // 11. Correct Section (Section 2) must be selected
    await expect(
      page.getByRole("heading", { name: "Section 2: Fees, Invoicing, and Payment Terms" })
    ).toBeVisible();

    // 12. Highlight element contains the verbatim excerpt and is focused
    const highlight = page.locator("mark#active-evidence-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText(
      "Customer agrees to pay all undisputed invoices within thirty (30) days of receipt."
    );
    await expect(highlight).toBeFocused();
  });

  test("Insufficient evidence response displays grounded refusal banner", async ({
    page,
  }) => {
    // 1. Switch to Ask tab
    await page.getByRole("tab", { name: "Ask" }).click();

    // 2. Type an unanswerable question
    const textarea = page.locator("#ask-question-input");
    await textarea.fill("What is the penalty for early termination?");

    // 3. Mock insufficient evidence response
    await page.route("**/api/documents/**/ask", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer:
            "The document does not appear to contain sufficient information to answer this question.",
          hasSufficientEvidence: false,
          isGrounded: false,
          citationValidationPassed: false,
          citations: [],
          evidenceUsed: [],
          documentId: "test-doc-12345",
          question: "What is the penalty for early termination?",
        }),
      });
    });

    // 4. Submit
    await page.getByTestId("ask-submit-button").click();

    // 5. Verify refusal banner
    await expect(page.getByTestId("insufficient-evidence-banner")).toBeVisible();
    await expect(page.getByText("Grounded Refusal")).toBeVisible();
    await expect(
      page.getByText(
        "The document does not appear to contain sufficient information to answer this question."
      )
    ).toBeVisible();

    // Grounded answer should not be shown
    await expect(page.getByTestId("ask-grounded-answer")).not.toBeVisible();
  });

  test("Empty citations array triggers unverified banner even if boolean flags were true", async ({
    page,
  }) => {
    // 1. Switch to Ask tab
    await page.getByRole("tab", { name: "Ask" }).click();

    const textarea = page.locator("#ask-question-input");
    await textarea.fill("What are the intellectual property rights?");

    // 2. Mock model response with citations: []
    await page.route("**/api/documents/**/ask", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer: "All intellectual property belongs to Customer.",
          hasSufficientEvidence: true,
          isGrounded: true,
          citationValidationPassed: true,
          citations: [], // EMPTY
          evidenceUsed: [],
          documentId: "test-doc-12345",
          question: "What are the intellectual property rights?",
        }),
      });
    });

    // 3. Submit
    await page.getByTestId("ask-submit-button").click();

    // 4. Must display unverified banner, NOT grounded answer
    await expect(page.getByTestId("unverified-citations-banner")).toBeVisible();
    await expect(page.getByTestId("ask-grounded-answer")).not.toBeVisible();
  });
});

