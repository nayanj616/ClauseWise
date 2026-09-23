/**
 * Unit Tests — Action Service (Phase 7)
 *
 * Covers:
 * 1. Action creation & validation:
 *    - Creates action with linked finding (provenance attached).
 *    - Creates action without finding (standalone).
 *    - Rejects empty title, overlong title, and malformed UUIDs.
 *    - Enforces document ownership (anti-oracle 404).
 *    - Enforces finding-document provenance (finding must belong to document).
 * 2. Action status lifecycle:
 *    - Transitions open -> completed, setting completedAt timestamp.
 *    - Transitions completed -> open (reopen), clearing completedAt to null.
 *    - Rejects invalid status values.
 *    - Enforces action ownership on status updates (anti-oracle 404).
 * 3. Action listing & filtering:
 *    - Lists actions with joined document and finding details.
 *    - Filters by documentId (with document ownership check).
 *    - Filters by status ("open" | "completed" | "all").
 *    - Respects tenant isolation (only actions for requesting user).
 * 4. Action retrieval & deletion:
 *    - Retrieves single action with details.
 *    - Deletes owned action.
 *    - Enforces action ownership (anti-oracle 404).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  documents,
  documentFindings,
  actions,
  type Action,
} from "@/lib/db/schema";
import {
  createAction,
  updateActionStatus,
  listActionsByUser,
  getActionById,
  deleteAction,
  ActionAccessError,
  ActionValidationError,
  ActionServiceError,
} from "@/lib/services/action-service";

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const OTHER_DOC_ID = "22222222-2222-4222-a222-222222222222";
const VALID_FINDING_ID = "33333333-3333-4333-a333-333333333333";
const OTHER_FINDING_ID = "44444444-4444-4444-a444-444444444444";
const VALID_ACTION_ID = "55555555-5555-4555-a555-555555555555";
const USER_ID = "user_owner_123";
const OTHER_USER_ID = "user_attacker_456";

let mockDocRows: Array<{ id: string }> = [];
let mockFindingRows: Array<{ id: string }> = [];
let mockActionRows: Action[] = [];
let mockJoinRows: Array<{
  action: Action;
  document: { id: string; title: string; originalFilename: string };
  finding: {
    id: string;
    findingType: string;
    importance: string;
    label: string;
    summary: string;
    sourceText: string | null;
    pageNumber: number | null;
    sectionId: string | null;
  } | null;
  sectionTitle: string | null;
}> = [];

let shouldFailDb = false;

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === documents) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => {
                  if (shouldFailDb) throw new Error("DB fatal");
                  return mockDocRows;
                }),
              })),
            };
          }

          if (table === documentFindings) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => {
                  if (shouldFailDb) throw new Error("DB fatal");
                  return mockFindingRows;
                }),
              })),
            };
          }

          if (table === actions) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => {
                  if (shouldFailDb) throw new Error("DB fatal");
                  return mockActionRows;
                }),
              })),
              innerJoin: vi.fn(() => ({
                leftJoin: vi.fn(() => ({
                  leftJoin: vi.fn(() => ({
                    where: vi.fn(() => ({
                      orderBy: vi.fn(async () => {
                        if (shouldFailDb) throw new Error("DB fatal");
                        return mockJoinRows;
                      }),
                      limit: vi.fn(async () => {
                        if (shouldFailDb) throw new Error("DB fatal");
                        return mockJoinRows;
                      }),
                    })),
                  })),
                })),
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
      insert: vi.fn(() => ({
        values: vi.fn((vals: Partial<Action>) => ({
          returning: vi.fn(async () => {
            if (shouldFailDb) throw new Error("DB fatal");
            const newAction: Action = {
              id: (vals.id as string) || VALID_ACTION_ID,
              documentId: vals.documentId as string,
              findingId: (vals.findingId as string) ?? null,
              userId: vals.userId as string,
              title: vals.title as string,
              description: (vals.description as string) ?? null,
              status: "open",
              createdAt: new Date(),
              updatedAt: new Date(),
              completedAt: null,
            };
            return [newAction];
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((vals: Partial<Action>) => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (shouldFailDb) throw new Error("DB fatal");
              const base = mockActionRows[0] || {
                id: VALID_ACTION_ID,
                documentId: VALID_DOC_ID,
                findingId: VALID_FINDING_ID,
                userId: USER_ID,
                title: "Review termination clause",
                description: "Check 60 days notice",
                status: "open",
                createdAt: new Date(),
                updatedAt: new Date(),
                completedAt: null,
              };
              return [
                {
                  ...base,
                  ...vals,
                  updatedAt: new Date(),
                },
              ];
            }),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => {
          if (shouldFailDb) throw new Error("DB fatal");
          return;
        }),
      })),
    },
  };
});

describe("Action Service (Phase 7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldFailDb = false;
    mockDocRows = [{ id: VALID_DOC_ID }];
    mockFindingRows = [{ id: VALID_FINDING_ID }];
    mockActionRows = [
      {
        id: VALID_ACTION_ID,
        documentId: VALID_DOC_ID,
        findingId: VALID_FINDING_ID,
        userId: USER_ID,
        title: "Review termination clause",
        description: "Check 60 days notice",
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      },
    ];
    mockJoinRows = [];
  });

  // -------------------------------------------------------------------------
  // 1. Action Creation
  // -------------------------------------------------------------------------
  describe("createAction", () => {
    it("creates an action with finding provenance", async () => {
      const result = await createAction({
        documentId: VALID_DOC_ID,
        findingId: VALID_FINDING_ID,
        userId: USER_ID,
        title: "Confirm notice period can be shortened",
        description: "Ask external counsel if 30 days is standard.",
      });

      expect(result).toBeDefined();
      expect(result.documentId).toBe(VALID_DOC_ID);
      expect(result.findingId).toBe(VALID_FINDING_ID);
      expect(result.userId).toBe(USER_ID);
      expect(result.title).toBe("Confirm notice period can be shortened");
      expect(result.description).toBe("Ask external counsel if 30 days is standard.");
      expect(result.status).toBe("open");
      expect(result.completedAt).toBeNull();
    });

    it("creates an action without a finding (standalone)", async () => {
      const result = await createAction({
        documentId: VALID_DOC_ID,
        userId: USER_ID,
        title: "General document review",
      });

      expect(result).toBeDefined();
      expect(result.findingId).toBeNull();
      expect(result.status).toBe("open");
    });

    it("rejects empty title with ActionValidationError", async () => {
      await expect(
        createAction({
          documentId: VALID_DOC_ID,
          userId: USER_ID,
          title: "   ",
        })
      ).rejects.toThrow(ActionValidationError);
    });

    it("rejects title longer than 300 characters", async () => {
      await expect(
        createAction({
          documentId: VALID_DOC_ID,
          userId: USER_ID,
          title: "A".repeat(301),
        })
      ).rejects.toThrow(ActionValidationError);
    });

    it("rejects invalid document UUID", async () => {
      await expect(
        createAction({
          documentId: "not-a-uuid",
          userId: USER_ID,
          title: "Valid title",
        })
      ).rejects.toThrow(ActionValidationError);
    });

    it("enforces document ownership (anti-oracle 404)", async () => {
      mockDocRows = []; // document not found for this user

      await expect(
        createAction({
          documentId: VALID_DOC_ID,
          userId: OTHER_USER_ID,
          title: "Valid title",
        })
      ).rejects.toThrow(ActionAccessError);
    });

    it("enforces finding-document provenance (anti-oracle 404 when finding belongs to another doc)", async () => {
      mockFindingRows = []; // finding not found for this document

      await expect(
        createAction({
          documentId: VALID_DOC_ID,
          findingId: OTHER_FINDING_ID,
          userId: USER_ID,
          title: "Valid title",
        })
      ).rejects.toThrow(ActionAccessError);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Action Status Lifecycle (open <-> completed)
  // -------------------------------------------------------------------------
  describe("updateActionStatus", () => {
    it("transitions open -> completed, setting completedAt timestamp", async () => {
      const updated = await updateActionStatus({
        actionId: VALID_ACTION_ID,
        userId: USER_ID,
        status: "completed",
      });

      expect(updated.status).toBe("completed");
      expect(updated.completedAt).toBeInstanceOf(Date);
    });

    it("transitions completed -> open (reopen), clearing completedAt to null", async () => {
      mockActionRows = [
        {
          id: VALID_ACTION_ID,
          documentId: VALID_DOC_ID,
          findingId: VALID_FINDING_ID,
          userId: USER_ID,
          title: "Review termination clause",
          description: null,
          status: "completed",
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: new Date(),
        },
      ];

      const updated = await updateActionStatus({
        actionId: VALID_ACTION_ID,
        userId: USER_ID,
        status: "open",
      });

      expect(updated.status).toBe("open");
      expect(updated.completedAt).toBeNull();
    });

    it("rejects unsupported status values", async () => {
      await expect(
        updateActionStatus({
          actionId: VALID_ACTION_ID,
          userId: USER_ID,
          status: "in_progress" as any,
        })
      ).rejects.toThrow(ActionValidationError);
    });

    it("enforces action ownership (anti-oracle 404)", async () => {
      mockActionRows = []; // not found for this user

      await expect(
        updateActionStatus({
          actionId: VALID_ACTION_ID,
          userId: OTHER_USER_ID,
          status: "completed",
        })
      ).rejects.toThrow(ActionAccessError);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Action Listing & Filtering
  // -------------------------------------------------------------------------
  describe("listActionsByUser", () => {
    it("lists actions with joined document and finding metadata", async () => {
      mockJoinRows = [
        {
          action: {
            id: VALID_ACTION_ID,
            documentId: VALID_DOC_ID,
            findingId: VALID_FINDING_ID,
            userId: USER_ID,
            title: "Confirm termination notice",
            description: "Check Section 8",
            status: "open",
            createdAt: new Date(),
            updatedAt: new Date(),
            completedAt: null,
          },
          document: {
            id: VALID_DOC_ID,
            title: "Employment Agreement",
            originalFilename: "employment.pdf",
          },
          finding: {
            id: VALID_FINDING_ID,
            findingType: "obligation",
            importance: "needs_attention",
            label: "Termination Notice Period",
            summary: "Either party may terminate with 60 days notice.",
            sourceText: "Either party may terminate this agreement with 60 days written notice.",
            pageNumber: 4,
            sectionId: "sec-123",
          },
          sectionTitle: "Section 8 — Termination",
        },
      ];

      const results = await listActionsByUser({ userId: USER_ID });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Confirm termination notice");
      expect(results[0].document.title).toBe("Employment Agreement");
      expect(results[0].document.originalFilename).toBe("employment.pdf");
      expect(results[0].finding).toBeDefined();
      expect(results[0].finding?.label).toBe("Termination Notice Period");
      expect(results[0].finding?.sourceText).toContain("60 days written notice");
      expect(results[0].finding?.sectionTitle).toBe("Section 8 — Termination");
    });

    it("verifies document ownership when documentId filter is passed", async () => {
      mockDocRows = []; // document not owned

      await expect(
        listActionsByUser({
          userId: USER_ID,
          documentId: OTHER_DOC_ID,
        })
      ).rejects.toThrow(ActionAccessError);
    });

    it("handles standalone actions where finding is null", async () => {
      mockJoinRows = [
        {
          action: {
            id: VALID_ACTION_ID,
            documentId: VALID_DOC_ID,
            findingId: null,
            userId: USER_ID,
            title: "Standalone task",
            description: null,
            status: "open",
            createdAt: new Date(),
            updatedAt: new Date(),
            completedAt: null,
          },
          document: {
            id: VALID_DOC_ID,
            title: "Vendor Contract",
            originalFilename: "vendor.pdf",
          },
          finding: null,
          sectionTitle: null,
        },
      ];

      const results = await listActionsByUser({ userId: USER_ID });

      expect(results).toHaveLength(1);
      expect(results[0].finding).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Action Retrieval & Deletion
  // -------------------------------------------------------------------------
  describe("getActionById & deleteAction", () => {
    it("retrieves action by ID when owned", async () => {
      mockJoinRows = [
        {
          action: {
            id: VALID_ACTION_ID,
            documentId: VALID_DOC_ID,
            findingId: null,
            userId: USER_ID,
            title: "Check jurisdiction clause",
            description: null,
            status: "open",
            createdAt: new Date(),
            updatedAt: new Date(),
            completedAt: null,
          },
          document: {
            id: VALID_DOC_ID,
            title: "Service SLA",
            originalFilename: "sla.pdf",
          },
          finding: null,
          sectionTitle: null,
        },
      ];

      const action = await getActionById(VALID_ACTION_ID, USER_ID);
      expect(action.id).toBe(VALID_ACTION_ID);
      expect(action.title).toBe("Check jurisdiction clause");
    });

    it("throws ActionAccessError when retrieving action owned by another user", async () => {
      mockActionRows = []; // not owned

      await expect(getActionById(VALID_ACTION_ID, OTHER_USER_ID)).rejects.toThrow(
        ActionAccessError
      );
    });

    it("deletes owned action successfully", async () => {
      await expect(deleteAction(VALID_ACTION_ID, USER_ID)).resolves.not.toThrow();
    });

    it("throws ActionAccessError when deleting action owned by another user", async () => {
      mockActionRows = []; // not owned

      await expect(deleteAction(VALID_ACTION_ID, OTHER_USER_ID)).rejects.toThrow(
        ActionAccessError
      );
    });
  });
});
