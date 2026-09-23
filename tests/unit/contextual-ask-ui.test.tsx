/**
 * Unit Tests — Phase 6 Contextual Ask UI Components
 *
 * Tests the AskPanel and contextual UI extensions:
 * 1. Active Section Context Banner:
 *    - Renders active section title and page badge when sectionId is active.
 *    - Renders clear context button.
 *    - Uses contextual placeholder for question input.
 *    - Displays contextual starter questions in empty state.
 * 2. Scope Selector:
 *    - Renders dropdown with all document sections and "Whole Document".
 * 3. User Message Context Badge:
 *    - Displays context badge when message has sectionId in metadata.
 * 4. Fallback Provenance Notice:
 *    - Displays provenance notice when fallbackUsed is true in message metadata or initialResult.
 *    - Does NOT display notice when direct section evidence was used.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { AskPanel } from "@/components/workspace/AskPanel";
import type { WorkspaceSection, Message, AnswerQuestionResult } from "@/types";

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";

const mockSections: WorkspaceSection[] = [
  {
    id: "sec-1",
    orderIndex: 0,
    title: "1. Term and Scope",
    content: "This Agreement shall commence on September 30, 2026.",
    pageStart: 1,
    pageEnd: 1,
  },
  {
    id: "sec-2",
    orderIndex: 1,
    title: "8. Termination and Remedies",
    content: "Either party may terminate with 60 days written notice.",
    pageStart: 4,
    pageEnd: 5,
  },
  {
    id: "sec-3",
    orderIndex: 2,
    title: "11. Confidentiality",
    content: "Confidential Information shall be protected for 5 years.",
    pageStart: 8,
    pageEnd: 9,
  },
];

const mockSectionsById = new Map<string, WorkspaceSection>(
  mockSections.map((s) => [s.id, s])
);

describe("Phase 6 — Contextual Ask UI (AskPanel)", () => {
  // -------------------------------------------------------------------------
  // 1. Active Section Context Banner & Scope Selector
  // -------------------------------------------------------------------------
  describe("1. Active Section Context Banner & Scope Selector", () => {
    it("renders active section context banner and contextual starter questions when section is selected", () => {
      const html = renderToString(
        <AskPanel
          documentId={VALID_DOC_ID}
          sections={mockSections}
          sectionsById={mockSectionsById}
          activeSectionId="sec-2"
        />
      );

      // Active Section Context Banner must be present
      expect(html).toContain('data-testid="active-section-context-banner"');
      expect(html).toContain("8. Termination and Remedies");
      expect(html).toContain("Page 4");
      expect(html).toContain('data-testid="clear-section-context-button"');

      // Scope Selector must be present with options
      expect(html).toContain('data-testid="section-context-selector"');
      expect(html).toContain("Whole Document (Entire Scope)");
      expect(html).toContain("1. Term and Scope");
      expect(html).toContain("8. Termination and Remedies");
      expect(html).toContain("11. Confidentiality");

      // Contextual placeholder must be set
      expect(html).toContain('placeholder="Ask a question about 8. Termination and Remedies..."');

      // Contextual starter questions must be present
      expect(html).toContain("What are the core obligations and commitments in this section?");
      expect(html).toContain("Are there any deadlines, notice periods, or timing rules here?");
    });

    it("renders general state when no section is selected", () => {
      const html = renderToString(
        <AskPanel
          documentId={VALID_DOC_ID}
          sections={mockSections}
          sectionsById={mockSectionsById}
          activeSectionId={null}
        />
      );

      // Active Section Context Banner must NOT be present
      expect(html).not.toContain('data-testid="active-section-context-banner"');

      // Scope selector must still be present
      expect(html).toContain('data-testid="section-context-selector"');

      // General placeholder
      expect(html).toContain('placeholder="Ask a question about terms, deadlines, obligations, or provisions..."');

      // General starter questions
      expect(html).toContain("What are the termination conditions and notice periods?");
    });
  });

  // -------------------------------------------------------------------------
  // 2. User Message Context Badge
  // -------------------------------------------------------------------------
  describe("2. User Message Context Badge", () => {
    it("renders context badge for user messages with sectionId in metadata", () => {
      const messages: Message[] = [
        {
          id: "msg-user-1",
          conversationId: "convo-1",
          role: "user",
          content: "Can either party terminate immediately?",
          citations: null,
          hasSufficientEvidence: null,
          isGrounded: null,
          citationValidationPassed: null,
          metadata: { sectionId: "sec-2" },
          createdAt: new Date(),
        },
      ];

      const html = renderToString(
        <AskPanel
          documentId={VALID_DOC_ID}
          sections={mockSections}
          sectionsById={mockSectionsById}
          initialMessages={messages}
          initialConversationId="convo-1"
        />
      );

      expect(html).toContain('data-testid="user-message-0"');
      expect(html).toContain('data-testid="user-message-context-badge"');
      expect(html).toContain("Focused on:");
      expect(html).toContain("8. Termination and Remedies");
    });

    it("does not render context badge for user messages without sectionId metadata", () => {
      const messages: Message[] = [
        {
          id: "msg-user-1",
          conversationId: "convo-1",
          role: "user",
          content: "What is this agreement?",
          citations: null,
          hasSufficientEvidence: null,
          isGrounded: null,
          citationValidationPassed: null,
          metadata: null,
          createdAt: new Date(),
        },
      ];

      const html = renderToString(
        <AskPanel
          documentId={VALID_DOC_ID}
          sections={mockSections}
          sectionsById={mockSectionsById}
          initialMessages={messages}
          initialConversationId="convo-1"
        />
      );

      expect(html).toContain('data-testid="user-message-0"');
      expect(html).not.toContain('data-testid="user-message-context-badge"');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Fallback Provenance Notice
  // -------------------------------------------------------------------------
  describe("3. Fallback Provenance Notice", () => {
    it("renders fallback provenance notice when fallbackUsed is true in assistant message", () => {
      const messages: Message[] = [
        {
          id: "msg-user-1",
          conversationId: "convo-1",
          role: "user",
          content: "What are the remedies?",
          citations: null,
          hasSufficientEvidence: null,
          isGrounded: null,
          citationValidationPassed: null,
          metadata: { sectionId: "sec-1" },
          createdAt: new Date(),
        },
        {
          id: "msg-asst-1",
          conversationId: "convo-1",
          role: "assistant",
          content: "Remedies include injunction and damages as specified in Section 8.",
          citations: [
            {
              chunkId: "chunk-8",
              sectionId: "sec-2",
              sourceText: "Either party may seek injunctive relief.",
              pageNumber: 4,
            },
          ],
          hasSufficientEvidence: true,
          isGrounded: true,
          citationValidationPassed: true,
          metadata: { sectionId: "sec-1", fallbackUsed: true },
          createdAt: new Date(),
        },
      ];

      const html = renderToString(
        <AskPanel
          documentId={VALID_DOC_ID}
          sections={mockSections}
          sectionsById={mockSectionsById}
          initialMessages={messages}
          initialConversationId="convo-1"
        />
      );

      expect(html).toContain('data-testid="fallback-provenance-notice"');
      expect(html).toContain("Same-Document Fallback Used");
      expect(html).toContain("Direct evidence was not found in the selected section.");
      expect(html).toContain("This answer incorporates relevant provisions found elsewhere in the document.");
    });

    it("does not render fallback notice when fallbackUsed is false", () => {
      const messages: Message[] = [
        {
          id: "msg-user-1",
          conversationId: "convo-1",
          role: "user",
          content: "Can either party terminate?",
          citations: null,
          hasSufficientEvidence: null,
          isGrounded: null,
          citationValidationPassed: null,
          metadata: { sectionId: "sec-2" },
          createdAt: new Date(),
        },
        {
          id: "msg-asst-1",
          conversationId: "convo-1",
          role: "assistant",
          content: "Either party may terminate with 60 days written notice.",
          citations: [
            {
              chunkId: "chunk-8",
              sectionId: "sec-2",
              sourceText: "Either party may terminate with 60 days written notice.",
              pageNumber: 4,
            },
          ],
          hasSufficientEvidence: true,
          isGrounded: true,
          citationValidationPassed: true,
          metadata: { sectionId: "sec-2", fallbackUsed: false },
          createdAt: new Date(),
        },
      ];

      const html = renderToString(
        <AskPanel
          documentId={VALID_DOC_ID}
          sections={mockSections}
          sectionsById={mockSectionsById}
          initialMessages={messages}
          initialConversationId="convo-1"
        />
      );

      expect(html).not.toContain('data-testid="fallback-provenance-notice"');
      expect(html).toContain("Grounded in Evidence");
    });

    it("renders fallback provenance notice in single-turn initialResult when fallbackUsed is true", () => {
      const singleTurnResult: AnswerQuestionResult = {
        answer: "General remedies apply across the agreement.",
        hasSufficientEvidence: true,
        isGrounded: true,
        citationValidationPassed: true,
        citations: [
          {
            chunkId: "chunk-8",
            sectionId: "sec-2",
            sourceText: "Either party may seek injunctive relief.",
            pageNumber: 4,
          },
        ],
        evidenceUsed: [],
        documentId: VALID_DOC_ID,
        question: "What are the remedies?",
        sectionId: "sec-1",
        fallbackUsed: true,
      };

      const html = renderToString(
        <AskPanel
          documentId={VALID_DOC_ID}
          sections={mockSections}
          sectionsById={mockSectionsById}
          initialResult={singleTurnResult}
        />
      );

      expect(html).toContain('data-testid="fallback-provenance-notice"');
      expect(html).toContain("Same-Document Fallback Used");
    });
  });
});

