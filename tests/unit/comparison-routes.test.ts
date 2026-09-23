import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Auth & Services
// ---------------------------------------------------------------------------

const {
  mockSessionHolder,
  mockCompareDocuments,
  MockComparisonAccessError,
  MockComparisonValidationError,
  MockComparisonReadinessError,
} = vi.hoisted(() => {
  class MockComparisonAccessError extends Error {
    constructor(msg = "Document not found or access denied") {
      super(msg);
      this.name = "ComparisonAccessError";
    }
  }

  class MockComparisonValidationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "ComparisonValidationError";
    }
  }

  class MockComparisonReadinessError extends Error {
    readonly documentId: string;
    readonly status: string;
    constructor(docId: string, status: string) {
      super(`Document ${docId} is not ready`);
      this.name = "ComparisonReadinessError";
      this.documentId = docId;
      this.status = status;
    }
  }

  return {
    mockSessionHolder: {
      session: null as { user: { id: string } } | null,
    },
    mockCompareDocuments: vi.fn(),
    MockComparisonAccessError,
    MockComparisonValidationError,
    MockComparisonReadinessError,
  };
});

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => mockSessionHolder.session),
}));

vi.mock("@/lib/services/comparison-service", () => ({
  compareDocuments: mockCompareDocuments,
  ComparisonAccessError: MockComparisonAccessError,
  ComparisonValidationError: MockComparisonValidationError,
  ComparisonReadinessError: MockComparisonReadinessError,
}));

import { GET } from "@/app/api/documents/compare/route";

describe("GET /api/documents/compare", () => {
  const validUser = "00000000-0000-4000-a000-000000000001";
  const docAId = "11111111-1111-4111-a111-111111111111";
  const docBId = "22222222-2222-4222-a222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionHolder.session = null;
  });

  it("returns 401 Unauthorized when session is missing", async () => {
    mockSessionHolder.session = null;

    const req = new Request(`http://localhost:3000/api/documents/compare?docA=${docAId}&docB=${docBId}`);
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 Bad Request when docA or docB query param is missing", async () => {
    mockSessionHolder.session = {
      user: { id: validUser },
    };

    const req = new Request(`http://localhost:3000/api/documents/compare?docA=${docAId}`);
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Both docA and docB query parameters are required");
  });

  it("returns 400 Bad Request when docA or docB is not a valid UUID", async () => {
    mockSessionHolder.session = {
      user: { id: validUser },
    };

    const req = new Request(`http://localhost:3000/api/documents/compare?docA=invalid-uuid&docB=${docBId}`);
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid document ID format");
  });

  it("returns 400 Bad Request on self-comparison", async () => {
    mockSessionHolder.session = {
      user: { id: validUser },
    };

    const req = new Request(`http://localhost:3000/api/documents/compare?docA=${docAId}&docB=${docAId}`);
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Cannot compare a document with itself");
  });

  it("returns 404 Not Found when either document is inaccessible (anti-oracle)", async () => {
    mockSessionHolder.session = {
      user: { id: validUser },
    };

    mockCompareDocuments.mockRejectedValueOnce(
      new MockComparisonAccessError("Document not found or access denied")
    );

    const req = new Request(`http://localhost:3000/api/documents/compare?docA=${docAId}&docB=${docBId}`);
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Document not found or access denied");
  });

  it("returns 422 Unprocessable Entity when either document is unready", async () => {
    mockSessionHolder.session = {
      user: { id: validUser },
    };

    mockCompareDocuments.mockRejectedValueOnce(
      new MockComparisonReadinessError(docAId, "extracting")
    );

    const req = new Request(`http://localhost:3000/api/documents/compare?docA=${docAId}&docB=${docBId}`);
    const res = await GET(req);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.status).toBe("extracting");
  });

  it("returns 200 OK with comparison result when request is valid", async () => {
    mockSessionHolder.session = {
      user: { id: validUser },
    };

    const mockResult = {
      documentA: { id: docAId, title: "Doc A", filename: "DocA.pdf", documentType: "NDA", pageCount: 2, governingLaw: null, jurisdiction: null, parties: null },
      documentB: { id: docBId, title: "Doc B", filename: "DocB.pdf", documentType: "NDA", pageCount: 2, governingLaw: null, jurisdiction: null, parties: null },
      metadataDifferences: [],
      differences: [],
      summary: { totalDifferences: 0, addedCount: 0, removedCount: 0, modifiedCount: 0, unchangedCount: 0 },
      comparedAt: new Date(),
    };

    mockCompareDocuments.mockResolvedValueOnce(mockResult);

    const req = new Request(`http://localhost:3000/api/documents/compare?docA=${docAId}&docB=${docBId}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documentA.id).toBe(docAId);
    expect(body.documentB.id).toBe(docBId);
  });

  it("returns 500 Internal Server Error with sanitized error on unexpected failure", async () => {
    mockSessionHolder.session = {
      user: { id: validUser },
    };

    mockCompareDocuments.mockRejectedValueOnce(
      new Error("FATAL: connection terminated to postgres://secret:password@db:5432")
    );

    const req = new Request(`http://localhost:3000/api/documents/compare?docA=${docAId}&docB=${docBId}`);
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to compare documents due to an unexpected error");
    expect(body.error).not.toContain("password");
  });
});

