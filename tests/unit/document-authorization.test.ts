/**
 * Unit Tests — API Routes Authorization & Cross-User Document Access
 *
 * Verifies that unauthorized users and cross-tenant requests
 * are safely blocked by our API endpoints, preventing data leakage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Auth & Services
// ---------------------------------------------------------------------------

const { mockSessionHolder, mockAnswerQuestion, MockDocumentAccessError } = vi.hoisted(() => {
  class MockDocumentAccessError extends Error {
    constructor(message = "Document not found or access denied") {
      super(message);
      this.name = "DocumentAccessError";
    }
  }

  return {
    mockSessionHolder: {
      session: null as { user: { id: string; email: string } } | null,
    },
    mockAnswerQuestion: vi.fn(),
    MockDocumentAccessError,
  };
});

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => mockSessionHolder.session),
}));

vi.mock("@/lib/services/qa-service", () => ({
  answerQuestion: mockAnswerQuestion,
  QaValidationError: class QaValidationError extends Error {},
}));

vi.mock("@/lib/services/retrieval-service", () => ({
  DocumentAccessError: MockDocumentAccessError,
}));

import { POST } from "@/app/api/documents/[documentId]/ask/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const OTHER_DOC_ID = "22222222-2222-4222-a222-222222222222";
const USER_ID = "user_owner_123";

function createAskRequest(body: unknown, docId: string): Request {
  return new Request(`http://localhost:3000/api/documents/${docId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/documents/[documentId]/ask (Cross-User Access Prevention)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionHolder.session = {
      user: { id: USER_ID, email: "owner@clausewise.test" },
    };
  });

  it("returns 401 Unauthorized when session is completely absent", async () => {
    mockSessionHolder.session = null;
    const request = createAskRequest({ question: "What is this?" }, VALID_DOC_ID);
    const response = await POST(request, {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(mockAnswerQuestion).not.toHaveBeenCalled();
  });

  it("returns 401 Unauthorized when session exists but has no user ID", async () => {
    // @ts-expect-error testing missing id
    mockSessionHolder.session = { user: { email: "owner@clausewise.test" } };
    const request = createAskRequest({ question: "What is this?" }, VALID_DOC_ID);
    const response = await POST(request, {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(mockAnswerQuestion).not.toHaveBeenCalled();
  });

  it("returns 404 anti-oracle when trying to access another user's document", async () => {
    mockAnswerQuestion.mockRejectedValueOnce(
      new MockDocumentAccessError("Document not found or access denied")
    );

    const request = createAskRequest({ question: "What is this?" }, OTHER_DOC_ID);
    const response = await POST(request, {
      params: Promise.resolve({ documentId: OTHER_DOC_ID }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Document not found or access denied");

    expect(mockAnswerQuestion).toHaveBeenCalledWith({
      documentId: OTHER_DOC_ID,
      userId: USER_ID,
      question: "What is this?",
    });
  });

  it("returns 200 when authenticated user accesses their own document", async () => {
    mockAnswerQuestion.mockResolvedValueOnce({
      answer: "This is a test document.",
      citations: [],
    });

    const request = createAskRequest({ question: "What is this?" }, VALID_DOC_ID);
    const response = await POST(request, {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.answer).toBe("This is a test document.");
  });
});
