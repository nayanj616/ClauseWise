/**
 * Unit Tests — Action Route Handlers (Phase 7)
 *
 * Covers:
 * 1. GET /api/actions:
 *    - 401 for unauthenticated request
 *    - 400 for invalid status query param
 *    - 404 for invalid documentId UUID or unauthorized document
 *    - 200 with actions list
 * 2. POST /api/actions:
 *    - 401 for unauthenticated request
 *    - 400 for missing title, overlong title, or invalid JSON
 *    - 404 anti-oracle when document or finding is unauthorized/mismatched
 *    - 201 with created action
 * 3. GET /api/actions/[actionId]:
 *    - 401 for unauthenticated request
 *    - 404 for invalid UUID or unauthorized action
 *    - 200 with action details
 * 4. PATCH /api/actions/[actionId]:
 *    - 401 for unauthenticated request
 *    - 400 for invalid status value
 *    - 404 anti-oracle when action is unauthorized
 *    - 200 with updated action
 * 5. DELETE /api/actions/[actionId]:
 *    - 401 for unauthenticated request
 *    - 404 anti-oracle when action is unauthorized
 *    - 200 with { success: true }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Auth & Services
// ---------------------------------------------------------------------------

const {
  mockSessionHolder,
  mockCreateAction,
  mockUpdateActionStatus,
  mockListActionsByUser,
  mockGetActionById,
  mockDeleteAction,
  MockActionAccessError,
  MockActionValidationError,
} = vi.hoisted(() => {
  class MockActionAccessError extends Error {
    constructor(message = "Action not found or access denied") {
      super(message);
      this.name = "ActionAccessError";
    }
  }

  class MockActionValidationError extends Error {
    constructor(message = "Validation failed") {
      super(message);
      this.name = "ActionValidationError";
    }
  }

  return {
    mockSessionHolder: {
      current: { user: { id: "user_test_123" } } as { user: { id: string } } | null,
    },
    mockCreateAction: vi.fn(),
    mockUpdateActionStatus: vi.fn(),
    mockListActionsByUser: vi.fn(),
    mockGetActionById: vi.fn(),
    mockDeleteAction: vi.fn(),
    MockActionAccessError,
    MockActionValidationError,
  };
});

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => mockSessionHolder.current),
}));

vi.mock("@/lib/services/action-service", () => ({
  createAction: mockCreateAction,
  updateActionStatus: mockUpdateActionStatus,
  listActionsByUser: mockListActionsByUser,
  getActionById: mockGetActionById,
  deleteAction: mockDeleteAction,
  ActionAccessError: MockActionAccessError,
  ActionValidationError: MockActionValidationError,
}));

import { GET as getActions, POST as createActionHandler } from "@/app/api/actions/route";
import {
  GET as getSingleAction,
  PATCH as updateActionHandler,
  DELETE as deleteActionHandler,
} from "@/app/api/actions/[actionId]/route";

// ---------------------------------------------------------------------------
// Test Data & Setup
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const VALID_FINDING_ID = "22222222-2222-4222-a222-222222222222";
const VALID_ACTION_ID = "33333333-3333-4333-a333-333333333333";

describe("Action Route Handlers (Phase 7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionHolder.current = { user: { id: "user_test_123" } };
  });

  // -------------------------------------------------------------------------
  // 1. GET /api/actions
  // -------------------------------------------------------------------------
  describe("GET /api/actions", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSessionHolder.current = null;
      const request = new Request("http://localhost/api/actions");

      const response = await getActions(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 400 when invalid status query parameter is passed", async () => {
      const request = new Request("http://localhost/api/actions?status=invalid_status");

      const response = await getActions(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("Invalid status query parameter");
    });

    it("returns 404 when documentId is not a valid UUID", async () => {
      const request = new Request("http://localhost/api/actions?documentId=not-uuid");

      const response = await getActions(request);
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe("Document not found or access denied");
    });

    it("returns 404 when listActionsByUser throws ActionAccessError", async () => {
      mockListActionsByUser.mockRejectedValue(
        new MockActionAccessError("Document not found or access denied")
      );
      const request = new Request(`http://localhost/api/actions?documentId=${VALID_DOC_ID}`);

      const response = await getActions(request);
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe("Document not found or access denied");
    });

    it("returns 200 with actions list on success", async () => {
      const mockList = [
        {
          id: VALID_ACTION_ID,
          title: "Confirm notice period",
          status: "open",
        },
      ];
      mockListActionsByUser.mockResolvedValue(mockList);

      const request = new Request("http://localhost/api/actions?status=open");
      const response = await getActions(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.actions).toEqual(mockList);
      expect(mockListActionsByUser).toHaveBeenCalledWith({
        userId: "user_test_123",
        documentId: undefined,
        status: "open",
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. POST /api/actions
  // -------------------------------------------------------------------------
  describe("POST /api/actions", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSessionHolder.current = null;
      const request = new Request("http://localhost/api/actions", {
        method: "POST",
        body: JSON.stringify({ documentId: VALID_DOC_ID, title: "Title" }),
      });

      const response = await createActionHandler(request);
      expect(response.status).toBe(401);
    });

    it("returns 400 on malformed JSON body", async () => {
      const request = new Request("http://localhost/api/actions", {
        method: "POST",
        body: "invalid-json{",
      });

      const response = await createActionHandler(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("Invalid JSON body");
    });

    it("returns 400 when title is empty", async () => {
      const request = new Request("http://localhost/api/actions", {
        method: "POST",
        body: JSON.stringify({ documentId: VALID_DOC_ID, title: "   " }),
      });

      const response = await createActionHandler(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("Title is required");
    });

    it("returns 400 when title exceeds 300 characters", async () => {
      const request = new Request("http://localhost/api/actions", {
        method: "POST",
        body: JSON.stringify({
          documentId: VALID_DOC_ID,
          title: "A".repeat(301),
        }),
      });

      const response = await createActionHandler(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("300 characters");
    });

    it("returns 404 anti-oracle when createAction throws ActionAccessError", async () => {
      mockCreateAction.mockRejectedValue(
        new MockActionAccessError("Document not found or access denied")
      );

      const request = new Request("http://localhost/api/actions", {
        method: "POST",
        body: JSON.stringify({
          documentId: VALID_DOC_ID,
          title: "Valid title",
        }),
      });

      const response = await createActionHandler(request);
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe("Document not found or access denied");
    });

    it("returns 201 with created action on success", async () => {
      const created = {
        id: VALID_ACTION_ID,
        documentId: VALID_DOC_ID,
        findingId: VALID_FINDING_ID,
        title: "Confirm notice period",
        description: "Check Section 8",
        status: "open",
      };
      mockCreateAction.mockResolvedValue(created);

      const request = new Request("http://localhost/api/actions", {
        method: "POST",
        body: JSON.stringify({
          documentId: VALID_DOC_ID,
          findingId: VALID_FINDING_ID,
          title: "Confirm notice period",
          description: "Check Section 8",
        }),
      });

      const response = await createActionHandler(request);
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.action).toEqual(created);
    });
  });

  // -------------------------------------------------------------------------
  // 3. GET /api/actions/[actionId]
  // -------------------------------------------------------------------------
  describe("GET /api/actions/[actionId]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSessionHolder.current = null;
      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`);

      const response = await getSingleAction(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(401);
    });

    it("returns 404 on malformed UUID", async () => {
      const request = new Request("http://localhost/api/actions/not-a-uuid");

      const response = await getSingleAction(request, {
        params: Promise.resolve({ actionId: "not-a-uuid" }),
      });
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe("Action not found or access denied");
    });

    it("returns 404 when action is not found or access denied", async () => {
      mockGetActionById.mockRejectedValue(
        new MockActionAccessError("Action not found or access denied")
      );
      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`);

      const response = await getSingleAction(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(404);
    });

    it("returns 200 with action details on success", async () => {
      const item = { id: VALID_ACTION_ID, title: "Item" };
      mockGetActionById.mockResolvedValue(item);
      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`);

      const response = await getSingleAction(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.action).toEqual(item);
    });
  });

  // -------------------------------------------------------------------------
  // 4. PATCH /api/actions/[actionId]
  // -------------------------------------------------------------------------
  describe("PATCH /api/actions/[actionId]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSessionHolder.current = null;
      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });

      const response = await updateActionHandler(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(401);
    });

    it("returns 400 on invalid status value", async () => {
      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress" }),
      });

      const response = await updateActionHandler(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("Status must be 'open' or 'completed'");
    });

    it("returns 404 anti-oracle when action is not found", async () => {
      mockUpdateActionStatus.mockRejectedValue(
        new MockActionAccessError("Action not found or access denied")
      );
      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });

      const response = await updateActionHandler(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(404);
    });

    it("returns 200 with updated action on status toggle", async () => {
      const updated = { id: VALID_ACTION_ID, status: "completed", completedAt: new Date() };
      mockUpdateActionStatus.mockResolvedValue(updated);

      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });

      const response = await updateActionHandler(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.action.status).toBe("completed");
    });
  });

  // -------------------------------------------------------------------------
  // 5. DELETE /api/actions/[actionId]
  // -------------------------------------------------------------------------
  describe("DELETE /api/actions/[actionId]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSessionHolder.current = null;
      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`, {
        method: "DELETE",
      });

      const response = await deleteActionHandler(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(401);
    });

    it("returns 404 when action is not owned / not found", async () => {
      mockDeleteAction.mockRejectedValue(
        new MockActionAccessError("Action not found or access denied")
      );
      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`, {
        method: "DELETE",
      });

      const response = await deleteActionHandler(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(404);
    });

    it("returns 200 with success on deletion", async () => {
      mockDeleteAction.mockResolvedValue(undefined);
      const request = new Request(`http://localhost/api/actions/${VALID_ACTION_ID}`, {
        method: "DELETE",
      });

      const response = await deleteActionHandler(request, {
        params: Promise.resolve({ actionId: VALID_ACTION_ID }),
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
    });
  });
});
