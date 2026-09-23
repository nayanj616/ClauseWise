/**
 * Unit Tests — Professional Prep Route Handler (Phase 8)
 *
 * GET /api/documents/[documentId]/prep
 *
 * Verifies:
 * 1. 401 Unauthorized for unauthenticated requests.
 * 2. 404 for malformed document UUIDs (anti-oracle protection).
 * 3. 404 anti-oracle when document belongs to another tenant or does not exist.
 * 4. 200 with complete ProfessionalPrepData on authorized access.
 * 5. 500 sanitized response on unexpected database or service failure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Auth & Services
// ---------------------------------------------------------------------------

const {
  mockSessionHolder,
  mockGetProfessionalPrepData,
  MockPrepAccessError,
  MockPrepValidationError,
} = vi.hoisted(() => {
  class MockPrepAccessError extends Error {
    constructor(message = "Document not found or access denied") {
      super(message);
      this.name = "PrepAccessError";
    }
  }

  class MockPrepValidationError extends Error {
    constructor(message = "Validation failed") {
      super(message);
      this.name = "PrepValidationError";
    }
  }

  return {
    mockSessionHolder: {
      session: null as { user: { id: string; email: string } } | null,
    },
    mockGetProfessionalPrepData: vi.fn(),
    MockPrepAccessError,
    MockPrepValidationError,
  };
});

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => mockSessionHolder.session),
}));

vi.mock("@/lib/services/preparation-service", () => ({
  getProfessionalPrepData: mockGetProfessionalPrepData,
  PrepAccessError: MockPrepAccessError,
  PrepValidationError: MockPrepValidationError,
}));

import { GET } from "@/app/api/documents/[documentId]/prep/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const OTHER_DOC_ID = "22222222-2222-4222-a222-222222222222";
const USER_ID = "user_owner_123";

const samplePrepData = {
  document: {
    id: VALID_DOC_ID,
    filename: "nda.pdf",
    documentType: "nda",
    isStatedType: true,
    parties: [{ name: "Acme", role: "Discloser" }],
    governingLaw: "Delaware",
    jurisdiction: "Delaware",
    pageCount: 3,
    fileSizeBytes: 10240,
    createdAt: new Date(),
    executiveSummary: "Summary text",
  },
  keyClauses: [],
  findingsSummary: {
    attentionItems: [],
    ambiguitiesAndInconsistencies: [],
    missingProvisions: [],
    obligationsAndTerms: [],
    totalFindingsCount: 0,
  },
  openActions: [],
  completedActionsCount: 0,
  userQuestions: [],
  clarificationQuestions: [],
  generatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/documents/[documentId]/prep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionHolder.session = {
      user: { id: USER_ID, email: "owner@clausewise.test" },
    };
  });

  it("returns 401 Unauthorized when session is absent", async () => {
    mockSessionHolder.session = null;

    const request = new Request(`http://localhost/api/documents/${VALID_DOC_ID}/prep`);
    const response = await GET(request, {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(mockGetProfessionalPrepData).not.toHaveBeenCalled();
  });

  it("returns 404 when documentId is not a valid UUID", async () => {
    const request = new Request("http://localhost/api/documents/invalid-uuid/prep");
    const response = await GET(request, {
      params: Promise.resolve({ documentId: "invalid-uuid" }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Document not found or access denied");
    expect(mockGetProfessionalPrepData).not.toHaveBeenCalled();
  });

  it("returns 404 anti-oracle when document belongs to another tenant or does not exist", async () => {
    mockGetProfessionalPrepData.mockRejectedValueOnce(
      new MockPrepAccessError("Document not found or access denied")
    );

    const request = new Request(`http://localhost/api/documents/${OTHER_DOC_ID}/prep`);
    const response = await GET(request, {
      params: Promise.resolve({ documentId: OTHER_DOC_ID }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Document not found or access denied");
    expect(mockGetProfessionalPrepData).toHaveBeenCalledWith(OTHER_DOC_ID, USER_ID);
  });

  it("returns 200 with professional prep data for authorized document", async () => {
    mockGetProfessionalPrepData.mockResolvedValueOnce(samplePrepData);

    const request = new Request(`http://localhost/api/documents/${VALID_DOC_ID}/prep`);
    const response = await GET(request, {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prep).toBeDefined();
    expect(body.prep.document.filename).toBe("nda.pdf");
    expect(mockGetProfessionalPrepData).toHaveBeenCalledWith(VALID_DOC_ID, USER_ID);
  });

  it("returns 500 with sanitized error when database or service throws unexpectedly", async () => {
    mockGetProfessionalPrepData.mockRejectedValueOnce(
      new Error("FATAL: connection terminated to postgres://secret:password@db:5432")
    );

    const request = new Request(`http://localhost/api/documents/${VALID_DOC_ID}/prep`);
    const response = await GET(request, {
      params: Promise.resolve({ documentId: VALID_DOC_ID }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to assemble professional prep data");
    // Ensure sensitive details are never leaked
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(JSON.stringify(body)).not.toContain("password");
  });
});

