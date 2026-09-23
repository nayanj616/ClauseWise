import { test, expect } from "@playwright/test";

/**
 * Phase 6 — Contextual Assistant E2E Tests
 *
 * Verifies:
 * 1. Section Selection in Document Tab:
 *    - User navigates to Document Text tab.
 *    - Clicks "Ask about this section" button on Section 2.
 * 2. Automatic Transition & Active Context Visibility:
 *    - Automatically switches to the Ask tab.
 *    - Renders the active section context banner with section title and page badge.
 *    - Updates question input placeholder to reference the active section.
 * 3. Contextual Question Submission & SSE Stream:
 *    - Submitting a question sends { question, sectionId } payload.
 *    - User message displays the focused section badge.
 *    - Streaming response delivers provisional text followed by verified answer and citation card.
 * 4. Context Switching:
 *    - User switches section scope via the scope selector dropdown.
 *    - Active section context banner updates to new section.
 *    - Subsequent question carries the new sectionId.
 * 5. Clearing Context:
 *    - Clicking "Clear context" removes the banner and restores whole-document scope.
 */

test.describe("Phase 6 — Contextual Assistant Flow", () => {
  test.beforeEach(async ({ page }) => {
    let conversationList = [
      {
        id: "convo-context-1",
        documentId: "test-doc-12345",
        title: "Contextual Review",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
      },
    ];

    await page.route("**/api/documents/**/conversations", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ conversations: conversationList }),
        });
      } else if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() || {};
        const newConvo = {
          id: `convo-new-${Date.now()}`,
          documentId: "test-doc-12345",
          title: body.title || "New Context Chat",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
        };
        conversationList.unshift(newConvo);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ conversation: newConvo }),
        });
      }
    });

    await page.route("**/api/documents/**/conversations/convo-context-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: conversationList[0],
          messages: [],
        }),
      });
    });

    await page.goto("/test-workspace");
    await expect(page.getByTestId("document-workspace-viewer")).toBeVisible();
  });

  test("Select section in DocumentViewer, ask contextual question, verify streaming answer and switch context", async ({
    page,
  }) => {
    // 1. Navigate to Document Text tab
    const documentTab = page.getByRole("tab", { name: /document text/i });
    await expect(documentTab).toBeVisible();
    await documentTab.click();
    await expect(documentTab).toHaveAttribute("aria-selected", "true");

    // 2. Select Section 2 in sidebar and click "Ask about this section"
    await page.getByRole("button", { name: /Section 2: Fees, Invoicing/i }).click();
    const askAboutSectionButton = page.getByTestId("ask-about-section-button");
    await expect(askAboutSectionButton).toBeVisible();
    await askAboutSectionButton.click();

    // 3. Verify automatic tab switch to "Ask"
    const askTab = page.getByRole("tab", { name: "Ask" });
    await expect(askTab).toHaveAttribute("aria-selected", "true");

    // 4. Verify Active Section Context banner
    const contextBanner = page.getByTestId("active-section-context-banner");
    await expect(contextBanner).toBeVisible();
    await expect(contextBanner).toContainText("Section 2: Fees, Invoicing, and Payment Terms");
    await expect(contextBanner).toContainText("Page 2");

    // 5. Verify input placeholder references the active section
    const questionInput = page.locator("#ask-question-input");
    await expect(questionInput).toBeVisible();
    await expect(questionInput).toHaveAttribute(
      "placeholder",
      "Ask a question about Section 2: Fees, Invoicing, and Payment Terms..."
    );

    // 6. Mock streaming endpoint capturing request payload
    let capturedRequestBody: { question?: string; sectionId?: string } | null = null;
    let turnCount = 0;

    await page.route("**/api/documents/**/conversations/**/messages", async (route) => {
      turnCount++;
      capturedRequestBody = route.request().postDataJSON();

      if (turnCount === 1) {
        // SSE payload for contextual question
        const sseStream =
          "event: status\n" +
          'data: {"type":"status","phase":"retrieving_evidence","message":"Searching verified document text…"}\n\n' +
          "event: status\n" +
          'data: {"type":"status","phase":"generating_answer","message":"Generating grounded answer…"}\n\n' +
          "event: delta\n" +
          'data: {"type":"delta","delta":"Customer shall pay all "}\n\n' +
          "event: delta\n" +
          'data: {"type":"delta","delta":"undisputed invoices within 30 days."}\n\n' +
          "event: complete\n" +
          'data: {"type":"complete","messageId":"msg-asst-1","answer":"Customer shall pay all undisputed invoices within 30 days.","citations":[{"chunkId":"chunk-2","documentId":"test-doc-12345","sectionId":"sec-2","sourceText":"Customer shall pay all undisputed invoices within thirty (30) days of receipt of invoice.","pageNumber":2,"chunkIndex":0}],"hasSufficientEvidence":true,"isGrounded":true,"citationValidationPassed":true,"sectionId":"sec-2","fallbackUsed":false}\n\n';

        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
          body: sseStream,
        });
      } else {
        // Turn 2 SSE payload (after switching context)
        const sseStream =
          "event: status\n" +
          'data: {"type":"status","phase":"generating_answer","message":"Analyzing governing law provisions…"}\n\n' +
          "event: complete\n" +
          'data: {"type":"complete","messageId":"msg-asst-2","answer":"The agreement is governed by Delaware law with arbitration in Wilmington.","citations":[{"chunkId":"chunk-3","documentId":"test-doc-12345","sectionId":"sec-3","sourceText":"This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware.","pageNumber":3,"chunkIndex":1}],"hasSufficientEvidence":true,"isGrounded":true,"citationValidationPassed":true,"sectionId":"sec-3","fallbackUsed":false}\n\n';

        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
          body: sseStream,
        });
      }
    });

    // 7. Ask a contextual question
    await questionInput.fill("What is the invoice payment deadline?");
    const submitBtn = page.getByTestId("ask-submit-button");
    await submitBtn.click();

    // Verify request payload contained sectionId: "sec-2"
    await expect.poll(() => capturedRequestBody?.sectionId).toBe("sec-2");
    expect((capturedRequestBody as { question?: string } | null)?.question).toBe(
      "What is the invoice payment deadline?"
    );

    // 8. Verify user message has context badge
    const userMsgBadge = page.getByTestId("user-message-context-badge");
    await expect(userMsgBadge).toBeVisible();
    await expect(userMsgBadge).toContainText("Section 2: Fees, Invoicing, and Payment Terms");

    // 9. Verify assistant grounded response and citation
    await expect(page.getByTestId("assistant-message-1")).toBeVisible();
    await expect(page.getByTestId("ask-grounded-answer")).toBeVisible();
    await expect(page.getByText("Customer shall pay all undisputed invoices within 30 days.")).toBeVisible();
    await expect(page.getByTestId("citation-card-0")).toBeVisible();

    // 10. Context Switching: Select Section 3 in the scope selector
    const scopeSelector = page.getByTestId("section-context-selector");
    await expect(scopeSelector).toBeVisible();
    await scopeSelector.selectOption("sec-3");

    // Banner must update to Section 3
    await expect(contextBanner).toContainText("Section 3: Governing Law and Dispute Resolution");
    await expect(contextBanner).toContainText("Page 3");

    // 11. Ask second contextual question with new scope
    await questionInput.fill("What is the governing law and arbitration location?");
    await submitBtn.click();

    // Verify turn 2 request carried sectionId: "sec-3"
    await expect.poll(() => capturedRequestBody?.sectionId).toBe("sec-3");

    // 12. Context Clearing: Click "Clear context" button
    const clearBtn = page.getByTestId("clear-section-context-button");
    await clearBtn.click();

    // Context banner must be removed
    await expect(contextBanner).not.toBeVisible();

    // Scope selector must show whole document
    await expect(scopeSelector).toHaveValue("");
  });
});
