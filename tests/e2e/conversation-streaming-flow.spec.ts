import { test, expect } from "@playwright/test";

/**
 * Phase 5.4 — Conversation Persistence & Streaming Interaction E2E Tests
 *
 * Verifies:
 * 1. Ask tab navigation within Document Workspace.
 * 2. Multi-turn conversation rendering with thread switcher and "+ New Chat".
 * 3. SSE streaming interaction:
 *    - Status indicator: searching evidence -> generating answer.
 *    - Provisional delta streaming text.
 *    - Authoritative completion event rendering grounded answer and citation card.
 * 4. Multi-turn persistence in the thread:
 *    - Submitting a second turn retains both turns in the conversation list.
 * 5. Grounded citation navigation:
 *    - Clicking "View in Document" on an assistant message citation switches to Document tab,
 *      selects Section 2, and focuses the verbatim highlight.
 * 6. Switching conversations:
 *    - Creating a new conversation resets the active message thread.
 */

test.describe("Conversation Persistence & Streaming Interaction Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Mock conversations collection endpoint
    let conversationList = [
      {
        id: "convo-test-1",
        documentId: "test-doc-12345",
        title: "Payment Discussion",
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
          title: body.title || "New Conversation",
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

    await page.route("**/api/documents/**/conversations/convo-test-1", async (route) => {
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

  test("Streaming Q&A, multi-turn persistence, citation navigation, and thread creation", async ({
    page,
  }) => {
    // 1. Switch to Ask tab
    const askTab = page.getByRole("tab", { name: "Ask" });
    const documentTab = page.getByRole("tab", { name: /document text/i });
    await expect(askTab).toBeVisible();
    await askTab.click();
    await expect(askTab).toHaveAttribute("aria-selected", "true");

    // 2. Thread controls are visible
    const convoSelector = page.getByTestId("conversation-selector");
    await expect(convoSelector).toBeVisible();
    const newChatBtn = page.getByTestId("new-conversation-button");
    await expect(newChatBtn).toBeVisible();

    // 3. Mock streaming messages endpoint
    let turnCount = 0;
    await page.route("**/api/documents/**/conversations/**/messages", async (route) => {
      turnCount++;
      if (turnCount === 1) {
        // Turn 1 SSE payload
        const sseStream =
          "event: status\n" +
          "data: {\"type\":\"status\",\"phase\":\"retrieving_evidence\"}\n\n" +
          "event: status\n" +
          "data: {\"type\":\"status\",\"phase\":\"generating_answer\"}\n\n" +
          "event: delta\n" +
          "data: {\"type\":\"delta\",\"delta\":\"Customer agrees to pay all undisputed invoices \"}\n\n" +
          "event: delta\n" +
          "data: {\"type\":\"delta\",\"delta\":\"within thirty (30) days of receipt.\"}\n\n" +
          "event: complete\n" +
          "data: {\"type\":\"complete\",\"messageId\":\"msg-turn-1\",\"answer\":\"Customer agrees to pay all undisputed invoices within thirty (30) days of receipt.\",\"hasSufficientEvidence\":true,\"isGrounded\":true,\"citationValidationPassed\":true,\"citations\":[{\"chunkId\":\"chunk-sec-2\",\"documentId\":\"test-doc-12345\",\"sectionId\":\"sec-2\",\"pageNumber\":2,\"sourceText\":\"Customer agrees to pay all undisputed invoices within thirty (30) days of receipt.\",\"similarity\":0.91}],\"evidenceUsed\":[],\"documentId\":\"test-doc-12345\",\"conversationId\":\"convo-test-1\"}\n\n";

        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sseStream,
        });
      } else {
        // Turn 2 SSE payload
        const sseStream2 =
          "event: status\n" +
          "data: {\"type\":\"status\",\"phase\":\"generating_answer\"}\n\n" +
          "event: delta\n" +
          "data: {\"type\":\"delta\",\"delta\":\"Late payments accrue interest \"}\n\n" +
          "event: delta\n" +
          "data: {\"type\":\"delta\",\"delta\":\"at 1.5% per month.\"}\n\n" +
          "event: complete\n" +
          "data: {\"type\":\"complete\",\"messageId\":\"msg-turn-2\",\"answer\":\"Late payments accrue interest at 1.5% per month.\",\"hasSufficientEvidence\":true,\"isGrounded\":true,\"citationValidationPassed\":true,\"citations\":[{\"chunkId\":\"chunk-sec-2-late\",\"documentId\":\"test-doc-12345\",\"sectionId\":\"sec-2\",\"pageNumber\":2,\"sourceText\":\"Late payments shall accrue interest at 1.5% per month.\",\"similarity\":0.88}],\"evidenceUsed\":[],\"documentId\":\"test-doc-12345\",\"conversationId\":\"convo-test-1\"}\n\n";

        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sseStream2,
        });
      }
    });

    // 4. Submit Question 1
    const textarea = page.locator("#ask-question-input");
    await textarea.fill("What are the payment terms?");
    const submitBtn = page.getByTestId("ask-submit-button");
    await submitBtn.click();

    // 5. Verify Turn 1 user message and assistant answer
    const userMsg0 = page.getByTestId("user-message-0");
    await expect(userMsg0).toBeVisible();
    await expect(userMsg0).toContainText("What are the payment terms?");

    const assistantMsg0 = page.getByTestId("assistant-message-1");
    await expect(assistantMsg0).toBeVisible();
    await expect(assistantMsg0).toContainText(
      "Customer agrees to pay all undisputed invoices within thirty (30) days of receipt."
    );
    await expect(assistantMsg0.getByText("Grounded in Evidence")).toBeVisible();

    // 6. Submit Turn 2 in the same thread
    await textarea.fill("What is the penalty for late payments?");
    await submitBtn.click();

    // 7. Verify Turn 2 is appended
    const userMsg1 = page.getByTestId("user-message-2");
    await expect(userMsg1).toBeVisible();
    await expect(userMsg1).toContainText("What is the penalty for late payments?");

    const assistantMsg1 = page.getByTestId("assistant-message-3");
    await expect(assistantMsg1).toBeVisible();
    await expect(assistantMsg1).toContainText(
      "Late payments accrue interest at 1.5% per month."
    );

    // 8. Test Citation Navigation on Turn 2
    const citationCard = assistantMsg1.getByTestId("citation-card-0");
    await expect(citationCard).toBeVisible();
    await expect(citationCard.getByText("Page 2")).toBeVisible();

    const viewInDocBtn = citationCard.getByTestId("citation-view-btn-0");
    await expect(viewInDocBtn).toBeVisible();
    await viewInDocBtn.click();

    // 9. Verify Document tab is active with Section 2
    await expect(documentTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("verbatim-document-panel")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Section 2: Fees, Invoicing, and Payment Terms" })
    ).toBeVisible();

    // 10. Switch back to Ask tab and create a new chat thread
    await askTab.click();
    await expect(newChatBtn).toBeVisible();
    await newChatBtn.click();

    // In a new conversation, previous messages are reset
    await expect(page.getByTestId("user-message-0")).not.toBeVisible();
    await expect(page.getByTestId("ask-empty-state")).toBeVisible();
  });
});

