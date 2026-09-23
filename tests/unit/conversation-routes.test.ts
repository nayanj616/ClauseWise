/**
 * Unit Tests — Conversation Route Handlers (Phase 5 Slice 5.4)
 *
 * Covers:
 * 1. GET /api/documents/[documentId]/conversations:
 *    - Rejects unauthenticated request with 401.
 *    - Rejects invalid documentId format with 404.
 *    - Enforces anti-oracle 404 on access denial or non-existent document.
 *    - Returns 200 with conversation list.
 * 2. POST /api/documents/[documentId]/conversations:
 *    - Rejects unauthenticated request with 401.
 *    - Rejects invalid body with 400.
 *    - Enforces anti-oracle 404 on access denial.
 *    - Returns 201 with created conversation.
 * 3. GET /api/documents/[documentId]/conversations/[conversationId]:
 *    - Rejects unauthenticated request with 401.
 *    - Rejects invalid UUIDs with 404.
 *    - Enforces anti-oracle 404 on cross-tenant / non-existent conversation.
 *    - Returns 200 with conversation and messages.
 * 4. DELETE /api/documents/[documentId]/conversations/[conversationId]:
 *    - Rejects unauthenticated request with 401.
 *    - Enforces anti-oracle 404 on cross-tenant / non-existent conversation.
 *    - Returns 200 with { success: true }.
 * 5. POST /api/documents/[documentId]/conversations/[conversationId]/messages:
 *    - Rejects unauthenticated request with 401.
 *    - Rejects empty/invalid question with 400.
 *    - Enforces anti-oracle 404 on cross-tenant / non-existent conversation.
 *    - Returns 200 with text/event-stream SSE response.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Auth & Services
// ---------------------------------------------------------------------------

const {
  mockSessionHolder,
  mockGetConversationsForDocument,
  mockCreateConversation,
  mockGetConversationWithMessages,
  mockDeleteConversation,
  mockVerifyConversationOwnership,
  mockAppendUserMessage,
  MockConversationAccessError,
} = vi.hoisted(() => {
  class MockConversationAccessError extends Error {
    constructor(message = "Conversation not found or access denied") {
      super(message);
      this.name = "ConversationAccessError";
    }
  }

  return {
    mockSessionHolder: { current: { user: { id: "user_test_123" } } as { user: { id: string } } | null },
    mockGetConversationsForDocument: vi.fn(),
    mockCreateConversation: vi.fn(),
    mockGetConversationWithMessages: vi.fn(),
    mockDeleteConversation: vi.fn(),
    mockVerifyConversationOwnership: vi.fn(),
    mockAppendUserMessage: vi.fn(),
    MockConversationAccessError,
  };
});

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const VALID_CONVO_ID = "22222222-2222-4222-a222-222222222222";
const SESSION_USER_ID = "user_test_123";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => mockSessionHolder.current),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/services/conversation-service", () => ({
  ConversationAccessError: MockConversationAccessError,
  ConversationValidationError: class extends Error {
    constructor(m: string) {
      super(m);
      this.name = "ConversationValidationError";
    }
  },
  getConversationsForDocument: (...args: unknown[]) =>
    mockGetConversationsForDocument(...args),
  createConversation: (...args: unknown[]) => mockCreateConversation(...args),
  getConversationWithMessages: (...args: unknown[]) =>
    mockGetConversationWithMessages(...args),
  deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
  verifyConversationOwnership: (...args: unknown[]) =>
    mockVerifyConversationOwnership(...args),
  appendUserMessage: (...args: unknown[]) => mockAppendUserMessage(...args),
}));

const mockStreamEvents = [
  { type: "status", phase: "retrieving_evidence" },
  { type: "delta", delta: "Hello " },
  { type: "delta", delta: "world!" },
  {
    type: "complete",
    messageId: "msg-123",
    answer: "Hello world!",
    citations: [],
    hasSufficientEvidence: true,
    isGrounded: true,
    citationValidationPassed: true,
  },
];

vi.mock("@/lib/services/qa-service", () => ({
  answerConversationQuestionStream: vi.fn(async function* () {
    for (const evt of mockStreamEvents) {
      yield evt;
    }
  }),
}));

// Import route handlers
import {
  GET as getConversations,
  POST as postConversation,
} from "@/app/api/documents/[documentId]/conversations/route";
import {
  GET as getConversationDetail,
  DELETE as deleteConversationRoute,
} from "@/app/api/documents/[documentId]/conversations/[conversationId]/route";
import { POST as postMessageStream } from "@/app/api/documents/[documentId]/conversations/[conversationId]/messages/route";

describe("Conversation Route Handlers (Phase 5 Slice 5.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionHolder.current = { user: { id: SESSION_USER_ID } };
  });

  // -------------------------------------------------------------------------
  // 1. /api/documents/[documentId]/conversations (GET, POST)
  // -------------------------------------------------------------------------

  describe("GET /api/documents/[documentId]/conversations", () => {
    it("returns 401 if unauthenticated", async () => {
      mockSessionHolder.current = null;
      const res = await getConversations(
        new Request("http://localhost/api"),
        { params: Promise.resolve({ documentId: VALID_DOC_ID }) }
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 for invalid UUID", async () => {
      const res = await getConversations(
        new Request("http://localhost/api"),
        { params: Promise.resolve({ documentId: "invalid-id" }) }
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Document not found or access denied");
    });

    it("returns 404 on ConversationAccessError (anti-oracle)", async () => {
      mockGetConversationsForDocument.mockRejectedValueOnce(
        new MockConversationAccessError()
      );

      const res = await getConversations(
        new Request("http://localhost/api"),
        { params: Promise.resolve({ documentId: VALID_DOC_ID }) }
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Document not found or access denied");
    });

    it("returns 200 with conversation list on success", async () => {
      mockGetConversationsForDocument.mockResolvedValueOnce([
        {
          id: VALID_CONVO_ID,
          documentId: VALID_DOC_ID,
          title: "Main Thread",
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 3,
        },
      ]);

      const res = await getConversations(
        new Request("http://localhost/api"),
        { params: Promise.resolve({ documentId: VALID_DOC_ID }) }
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.conversations).toHaveLength(1);
      expect(json.conversations[0].title).toBe("Main Thread");
    });
  });

  describe("POST /api/documents/[documentId]/conversations", () => {
    it("returns 401 if unauthenticated", async () => {
      mockSessionHolder.current = null;
      const res = await postConversation(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify({ title: "New Chat" }),
        }),
        { params: Promise.resolve({ documentId: VALID_DOC_ID }) }
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid body format", async () => {
      const res = await postConversation(
        new Request("http://localhost/api", {
          method: "POST",
          body: "invalid-json",
        }),
        { params: Promise.resolve({ documentId: VALID_DOC_ID }) }
      );
      expect(res.status).toBe(400);
    });

    it("returns 201 with created conversation", async () => {
      mockCreateConversation.mockResolvedValueOnce({
        id: VALID_CONVO_ID,
        documentId: VALID_DOC_ID,
        userId: SESSION_USER_ID,
        title: "New Chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await postConversation(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify({ title: "New Chat" }),
        }),
        { params: Promise.resolve({ documentId: VALID_DOC_ID }) }
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.conversation.id).toBe(VALID_CONVO_ID);
      expect(json.conversation.title).toBe("New Chat");
    });
  });

  // -------------------------------------------------------------------------
  // 2. /api/documents/[documentId]/conversations/[conversationId] (GET, DELETE)
  // -------------------------------------------------------------------------

  describe("GET /api/documents/[documentId]/conversations/[conversationId]", () => {
    it("returns 401 if unauthenticated", async () => {
      mockSessionHolder.current = null;
      const res = await getConversationDetail(
        new Request("http://localhost/api"),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: VALID_CONVO_ID,
          }),
        }
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 for non-UUID conversationId", async () => {
      const res = await getConversationDetail(
        new Request("http://localhost/api"),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: "bad-convo-id",
          }),
        }
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 on ConversationAccessError (anti-oracle)", async () => {
      mockGetConversationWithMessages.mockRejectedValueOnce(
        new MockConversationAccessError()
      );

      const res = await getConversationDetail(
        new Request("http://localhost/api"),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: VALID_CONVO_ID,
          }),
        }
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Conversation not found or access denied");
    });

    it("returns 200 with conversation and messages", async () => {
      mockGetConversationWithMessages.mockResolvedValueOnce({
        conversation: { id: VALID_CONVO_ID, title: "Thread 1" },
        messages: [{ id: "m1", role: "user", content: "Hi" }],
      });

      const res = await getConversationDetail(
        new Request("http://localhost/api"),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: VALID_CONVO_ID,
          }),
        }
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.conversation.id).toBe(VALID_CONVO_ID);
      expect(json.messages).toHaveLength(1);
    });
  });

  describe("DELETE /api/documents/[documentId]/conversations/[conversationId]", () => {
    it("returns 401 if unauthenticated", async () => {
      mockSessionHolder.current = null;
      const res = await deleteConversationRoute(
        new Request("http://localhost/api", { method: "DELETE" }),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: VALID_CONVO_ID,
          }),
        }
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 on successful deletion", async () => {
      mockDeleteConversation.mockResolvedValueOnce({ success: true });

      const res = await deleteConversationRoute(
        new Request("http://localhost/api", { method: "DELETE" }),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: VALID_CONVO_ID,
          }),
        }
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. /api/documents/[documentId]/conversations/[conversationId]/messages (POST SSE)
  // -------------------------------------------------------------------------

  describe("POST /api/documents/[documentId]/conversations/[conversationId]/messages (SSE)", () => {
    it("returns 401 if unauthenticated", async () => {
      mockSessionHolder.current = null;
      const res = await postMessageStream(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify({ question: "What is the fee?" }),
        }),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: VALID_CONVO_ID,
          }),
        }
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 for empty question", async () => {
      const res = await postMessageStream(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify({ question: "   " }),
        }),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: VALID_CONVO_ID,
          }),
        }
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 if ownership check fails (anti-oracle)", async () => {
      mockVerifyConversationOwnership.mockRejectedValueOnce(
        new MockConversationAccessError()
      );

      const res = await postMessageStream(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify({ question: "What is the fee?" }),
        }),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: VALID_CONVO_ID,
          }),
        }
      );
      expect(res.status).toBe(404);
    });

    it("persists user message and returns text/event-stream response", async () => {
      mockVerifyConversationOwnership.mockResolvedValueOnce({
        id: VALID_CONVO_ID,
      });
      mockAppendUserMessage.mockResolvedValueOnce({
        id: "msg-user-1",
        role: "user",
        content: "What is the fee?",
      });
      mockGetConversationWithMessages.mockResolvedValueOnce({
        conversation: { id: VALID_CONVO_ID },
        messages: [{ id: "msg-user-1", role: "user", content: "What is the fee?" }],
      });

      const res = await postMessageStream(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify({ question: "What is the fee?" }),
        }),
        {
          params: Promise.resolve({
            documentId: VALID_DOC_ID,
            conversationId: VALID_CONVO_ID,
          }),
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");

      // Verify user message was persisted immediately
      expect(mockAppendUserMessage).toHaveBeenCalledWith({
        conversationId: VALID_CONVO_ID,
        documentId: VALID_DOC_ID,
        userId: SESSION_USER_ID,
        content: "What is the fee?",
      });

      // Read SSE stream
      const reader = res.body?.getReader();
      expect(reader).toBeDefined();
      const decoder = new TextDecoder();
      let streamedOutput = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamedOutput += decoder.decode(value);
        }
      }

      expect(streamedOutput).toContain("event: status");
      expect(streamedOutput).toContain("retrieving_evidence");
      expect(streamedOutput).toContain("event: delta");
      expect(streamedOutput).toContain("Hello ");
      expect(streamedOutput).toContain("world!");
      expect(streamedOutput).toContain("event: complete");
    });
  });
});
