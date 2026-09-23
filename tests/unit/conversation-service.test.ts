/**
 * Unit Tests — Conversation Service (Phase 5 Slice 5.4)
 *
 * Covers:
 * 1. Conversation creation & title defaulting:
 *    - Creates conversation with provided title.
 *    - Defaults to "New Conversation" when title is omitted or blank.
 *    - Enforces document existence and ownership.
 * 2. Conversation listing:
 *    - Returns conversation summaries with message counts.
 *    - Enforces document ownership.
 * 3. Conversation & message retrieval:
 *    - Returns conversation with ordered messages.
 *    - Enforces ORDER BY createdAt ASC, id ASC.
 *    - Enforces both documentId and userId ownership (anti-oracle).
 * 4. Conversation deletion:
 *    - Successfully deletes thread for owned document.
 *    - Blocks cross-tenant / cross-document deletion attempts.
 * 5. Message persistence semantics:
 *    - User messages: strictly null for citations, hasSufficientEvidence, isGrounded, citationValidationPassed.
 *    - Empty user message validation.
 *    - Assistant messages: persists authoritative citations, hasSufficientEvidence, isGrounded, citationValidationPassed.
 * 6. Anti-oracle protection & error sanitization:
 *    - Throws uniform ConversationAccessError for not found or cross-tenant documents/conversations.
 *    - Throws sanitized ConversationServiceError on unexpected database failures.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { documents, conversations, messages, type Conversation, type Message } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Mock State & Setup
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const OTHER_DOC_ID = "22222222-2222-4222-a222-222222222222";
const OWNER_USER_ID = "user_owner_123";
const OTHER_USER_ID = "user_attacker_456";

const CONVO_ID_1 = "33333333-3333-4333-a333-333333333333";
const CONVO_ID_2 = "44444444-4444-4444-a444-444444444444";
const MSG_ID_1 = "55555555-5555-4555-a555-555555555555";
const MSG_ID_2 = "66666666-6666-4666-a666-666666666666";

let mockDocRows: Array<{ id: string }> = [];
let mockConvoRows: Conversation[] = [];
let mockMsgRows: Message[] = [];
let mockListRows: Array<{
  id: string;
  documentId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}> = [];

let shouldFailDb = false;

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn((fields?: unknown) => ({
        from: vi.fn((table: unknown) => {
          if (table === documents) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => {
                  if (shouldFailDb) {
                    throw new Error("DB fatal: postgres://user:secret@db.internal:5432");
                  }
                  return mockDocRows;
                }),
              })),
            };
          }

          if (table === conversations) {
            return {
              leftJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  groupBy: vi.fn(() => ({
                    orderBy: vi.fn(async () => {
                      if (shouldFailDb) {
                        throw new Error("DB query failed: postgres://user:secret@db.internal:5432");
                      }
                      return mockListRows;
                    }),
                  })),
                })),
              })),
              where: vi.fn(() => ({
                limit: vi.fn(async () => {
                  if (shouldFailDb) {
                    throw new Error("DB fatal: postgres://user:secret@db.internal:5432");
                  }
                  return mockConvoRows;
                }),
              })),
            };
          }

          if (table === messages) {
            return {
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => {
                  if (shouldFailDb) {
                    throw new Error("DB query failed: postgres://user:secret@db.internal:5432");
                  }
                  return mockMsgRows;
                }),
              })),
            };
          }

          return {
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          };
        }),
      })),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((vals: Record<string, unknown>) => ({
          returning: vi.fn(async () => {
            if (shouldFailDb) {
              throw new Error("Insert failed: postgres://user:secret@db.internal:5432");
            }
            if (table === conversations) {
              const now = new Date();
              return [
                {
                  id: CONVO_ID_1,
                  documentId: vals.documentId,
                  userId: vals.userId,
                  title: vals.title,
                  createdAt: now,
                  updatedAt: now,
                },
              ];
            }
            if (table === messages) {
              const now = new Date();
              return [
                {
                  id: MSG_ID_1,
                  conversationId: vals.conversationId,
                  role: vals.role,
                  content: vals.content,
                  citations: vals.citations ?? null,
                  hasSufficientEvidence: vals.hasSufficientEvidence ?? null,
                  isGrounded: vals.isGrounded ?? null,
                  citationValidationPassed: vals.citationValidationPassed ?? null,
                  metadata: vals.metadata ?? null,
                  createdAt: now,
                },
              ];
            }
            return [vals];
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => {
            if (shouldFailDb) {
              throw new Error("Update failed: postgres://user:secret@db.internal:5432");
            }
          }),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => {
          if (shouldFailDb) {
            throw new Error("Delete failed: postgres://user:secret@db.internal:5432");
          }
        }),
      })),
    },
  };
});

import {
  createConversation,
  getConversationsForDocument,
  getConversationWithMessages,
  deleteConversation,
  appendUserMessage,
  appendAssistantMessage,
  verifyDocumentOwnership,
  verifyConversationOwnership,
  ConversationAccessError,
  ConversationValidationError,
  ConversationServiceError,
} from "@/lib/services/conversation-service";

describe("Conversation Domain Service (Phase 5 Slice 5.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldFailDb = false;
    mockDocRows = [{ id: VALID_DOC_ID }];
    mockConvoRows = [
      {
        id: CONVO_ID_1,
        documentId: VALID_DOC_ID,
        userId: OWNER_USER_ID,
        title: "Initial Thread",
        createdAt: new Date("2026-09-20T10:00:00Z"),
        updatedAt: new Date("2026-09-20T10:00:00Z"),
      },
    ];
    mockMsgRows = [];
    mockListRows = [
      {
        id: CONVO_ID_1,
        documentId: VALID_DOC_ID,
        title: "Initial Thread",
        createdAt: new Date("2026-09-20T10:00:00Z"),
        updatedAt: new Date("2026-09-20T10:00:00Z"),
        messageCount: 2,
      },
    ];
  });

  // ---------------------------------------------------------------------------
  // 1. Ownership & Anti-Oracle Checks
  // ---------------------------------------------------------------------------

  describe("Ownership verification", () => {
    it("verifies document ownership successfully for owner", async () => {
      const doc = await verifyDocumentOwnership(VALID_DOC_ID, OWNER_USER_ID);
      expect(doc.id).toBe(VALID_DOC_ID);
    });

    it("throws ConversationAccessError if document is not found or not owned", async () => {
      mockDocRows = [];
      await expect(
        verifyDocumentOwnership(VALID_DOC_ID, OTHER_USER_ID)
      ).rejects.toThrow(ConversationAccessError);
    });

    it("throws ConversationAccessError with uniform message for non-existent document", async () => {
      mockDocRows = [];
      await expect(
        verifyDocumentOwnership("00000000-0000-0000-0000-000000000000", OWNER_USER_ID)
      ).rejects.toThrow("Document not found or access denied");
    });

    it("verifies conversation ownership successfully when documentId and userId match", async () => {
      const convo = await verifyConversationOwnership(CONVO_ID_1, VALID_DOC_ID, OWNER_USER_ID);
      expect(convo.id).toBe(CONVO_ID_1);
      expect(convo.documentId).toBe(VALID_DOC_ID);
    });

    it("throws ConversationAccessError if conversation does not match userId or documentId", async () => {
      mockConvoRows = [];
      await expect(
        verifyConversationOwnership(CONVO_ID_1, OTHER_DOC_ID, OWNER_USER_ID)
      ).rejects.toThrow(ConversationAccessError);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Conversation Creation & Title
  // ---------------------------------------------------------------------------

  describe("createConversation", () => {
    it("creates a conversation with provided title", async () => {
      const result = await createConversation({
        documentId: VALID_DOC_ID,
        userId: OWNER_USER_ID,
        title: "Termination Analysis",
      });

      expect(result.id).toBe(CONVO_ID_1);
      expect(result.title).toBe("Termination Analysis");
    });

    it("defaults title to 'New Conversation' when omitted or whitespace", async () => {
      const result = await createConversation({
        documentId: VALID_DOC_ID,
        userId: OWNER_USER_ID,
        title: "   ",
      });

      expect(result.title).toBe("New Conversation");
    });

    it("rejects creation if user does not own document", async () => {
      mockDocRows = [];
      await expect(
        createConversation({
          documentId: VALID_DOC_ID,
          userId: OTHER_USER_ID,
        })
      ).rejects.toThrow(ConversationAccessError);
    });

    it("rejects invalid UUID documentId", async () => {
      await expect(
        createConversation({
          documentId: "not-a-uuid",
          userId: OWNER_USER_ID,
        })
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Conversation Listing
  // ---------------------------------------------------------------------------

  describe("getConversationsForDocument", () => {
    it("returns list of conversation summaries for document", async () => {
      const list = await getConversationsForDocument({
        documentId: VALID_DOC_ID,
        userId: OWNER_USER_ID,
      });

      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(CONVO_ID_1);
      expect(list[0].messageCount).toBe(2);
    });

    it("throws ConversationAccessError if user does not own document", async () => {
      mockDocRows = [];
      await expect(
        getConversationsForDocument({
          documentId: VALID_DOC_ID,
          userId: OTHER_USER_ID,
        })
      ).rejects.toThrow(ConversationAccessError);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Conversation & Messages Detail
  // ---------------------------------------------------------------------------

  describe("getConversationWithMessages", () => {
    it("returns conversation and its messages", async () => {
      const now = new Date();
      mockMsgRows = [
        {
          id: MSG_ID_1,
          conversationId: CONVO_ID_1,
          role: "user",
          content: "What is the notice period?",
          citations: null,
          hasSufficientEvidence: null,
          isGrounded: null,
          citationValidationPassed: null,
          metadata: null,
          createdAt: new Date(now.getTime() - 60000),
        },
        {
          id: MSG_ID_2,
          conversationId: CONVO_ID_1,
          role: "assistant",
          content: "The notice period is 30 days.",
          citations: [],
          hasSufficientEvidence: true,
          isGrounded: true,
          citationValidationPassed: true,
          metadata: null,
          createdAt: now,
        },
      ];

      const result = await getConversationWithMessages({
        conversationId: CONVO_ID_1,
        documentId: VALID_DOC_ID,
        userId: OWNER_USER_ID,
      });

      expect(result.conversation.id).toBe(CONVO_ID_1);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[1].role).toBe("assistant");
    });

    it("enforces cross-tenant protection for conversation detail", async () => {
      mockConvoRows = [];
      await expect(
        getConversationWithMessages({
          conversationId: CONVO_ID_1,
          documentId: VALID_DOC_ID,
          userId: OTHER_USER_ID,
        })
      ).rejects.toThrow(ConversationAccessError);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Deletion
  // ---------------------------------------------------------------------------

  describe("deleteConversation", () => {
    it("deletes owned conversation successfully", async () => {
      const res = await deleteConversation({
        conversationId: CONVO_ID_1,
        documentId: VALID_DOC_ID,
        userId: OWNER_USER_ID,
      });

      expect(res.success).toBe(true);
    });

    it("rejects deletion if ownership mismatch", async () => {
      mockConvoRows = [];
      await expect(
        deleteConversation({
          conversationId: CONVO_ID_1,
          documentId: VALID_DOC_ID,
          userId: OTHER_USER_ID,
        })
      ).rejects.toThrow(ConversationAccessError);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Message Persistence & Semantics
  // ---------------------------------------------------------------------------

  describe("appendUserMessage", () => {
    it("persists user message with strictly null citation and grounding flags", async () => {
      const msg = await appendUserMessage({
        conversationId: CONVO_ID_1,
        documentId: VALID_DOC_ID,
        userId: OWNER_USER_ID,
        content: "What are the payment terms?",
      });

      expect(msg.role).toBe("user");
      expect(msg.content).toBe("What are the payment terms?");
      expect(msg.citations).toBeNull();
      expect(msg.hasSufficientEvidence).toBeNull();
      expect(msg.isGrounded).toBeNull();
      expect(msg.citationValidationPassed).toBeNull();
    });

    it("rejects empty user message with ConversationValidationError", async () => {
      await expect(
        appendUserMessage({
          conversationId: CONVO_ID_1,
          documentId: VALID_DOC_ID,
          userId: OWNER_USER_ID,
          content: "   ",
        })
      ).rejects.toThrow(ConversationValidationError);
    });

    it("rejects message append if user does not own conversation", async () => {
      mockConvoRows = [];
      await expect(
        appendUserMessage({
          conversationId: CONVO_ID_1,
          documentId: VALID_DOC_ID,
          userId: OTHER_USER_ID,
          content: "Hello",
        })
      ).rejects.toThrow(ConversationAccessError);
    });
  });

  describe("appendAssistantMessage", () => {
    it("persists assistant message with authoritative citations and grounding flags", async () => {
      const mockCitations = [
        {
          citationId: "cit-1",
          chunkId: "chunk-1",
          documentId: VALID_DOC_ID,
          sectionId: "sec-1",
          pageNumber: 2,
          sourceText: "Payment terms are net 30 days.",
          similarity: 0.95,
        },
      ];

      const msg = await appendAssistantMessage({
        conversationId: CONVO_ID_1,
        documentId: VALID_DOC_ID,
        userId: OWNER_USER_ID,
        content: "The payment terms are net 30 days.",
        citations: mockCitations,
        hasSufficientEvidence: true,
        isGrounded: true,
        citationValidationPassed: true,
        metadata: { turn: 1 },
      });

      expect(msg.role).toBe("assistant");
      expect(msg.content).toBe("The payment terms are net 30 days.");
      expect(msg.hasSufficientEvidence).toBe(true);
      expect(msg.isGrounded).toBe(true);
      expect(msg.citationValidationPassed).toBe(true);
      expect(msg.citations).toEqual(mockCitations);
      expect(msg.metadata).toEqual({ turn: 1 });
    });

    it("rejects assistant message append if ownership check fails", async () => {
      mockConvoRows = [];
      await expect(
        appendAssistantMessage({
          conversationId: CONVO_ID_1,
          documentId: VALID_DOC_ID,
          userId: OTHER_USER_ID,
          content: "Answer",
          citations: null,
          hasSufficientEvidence: false,
          isGrounded: false,
          citationValidationPassed: false,
        })
      ).rejects.toThrow(ConversationAccessError);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Database Error Handling & Sanitization
  // ---------------------------------------------------------------------------

  describe("Database Error Sanitization", () => {
    it("sanitizes unexpected database errors and wraps in ConversationServiceError", async () => {
      shouldFailDb = true;
      try {
        await getConversationsForDocument({
          documentId: VALID_DOC_ID,
          userId: OWNER_USER_ID,
        });
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConversationServiceError);
        const serviceErr = err as ConversationServiceError;
        // Verify no credentials leaked in message
        expect(serviceErr.message).not.toContain("postgres://");
        expect(serviceErr.message).not.toContain("secret");
      }
    });
  });
});
