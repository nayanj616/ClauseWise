import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  persistDocumentIntelligence,
  processDocumentIntelligence,
  IntelligencePersistenceError,
} from "@/lib/services/intelligence-persistence-service";
import { db } from "@/lib/db";
import type { ValidatedIntelligenceResult } from "@/lib/intelligence/types";

// Mock intelligence-service to prevent loading raw OpenAI client and env checks in unit tests
const mockAnalyzeDocumentIntelligence = vi.fn();
vi.mock("@/lib/services/intelligence-service", () => ({
  analyzeDocumentIntelligence: (...args: unknown[]) => mockAnalyzeDocumentIntelligence(...args),
  IntelligenceError: class IntelligenceError extends Error {},
  IntelligenceDocumentNotFoundError: class IntelligenceDocumentNotFoundError extends Error {},
  IntelligenceValidationError: class IntelligenceValidationError extends Error {},
  OpenAiInferenceError: class OpenAiInferenceError extends Error {},
}));

// Mock database
vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

describe("Intelligence Persistence Domain Service — Phase 3", () => {
  const mockDocId = "22222222-2222-4222-a222-222222222222";

  const mockValidatedResult: ValidatedIntelligenceResult = {
    documentId: mockDocId,
    classification: {
      documentType: "nda",
      isStatedInText: true,
      sourceText: "Non-Disclosure Agreement",
      sectionId: "sec-0",
      sectionOrderIndex: 0,
      inferenceReason: null,
    },
    parties: [
      {
        name: "Acme Corp",
        role: "Discloser",
        sourceText: "Acme Corp",
        sectionId: "sec-0",
        sectionOrderIndex: 0,
      },
    ],
    governingLaw: {
      law: "Laws of New York",
      sourceText: "Laws of New York",
      sectionId: "sec-1",
      sectionOrderIndex: 1,
    },
    jurisdiction: null,
    executiveSummary: "Executive summary text.",
    importantSections: [
      {
        sectionId: "sec-1",
        sectionOrderIndex: 1,
        title: "Governing Law",
        reason: "States New York jurisdiction",
      },
    ],
    findings: [
      {
        documentId: mockDocId,
        sectionId: "sec-0",
        chunkId: "chk-0",
        findingType: "key_term",
        importance: "informational",
        label: "Party Term",
        summary: "Defines Acme Corp.",
        sourceText: "Acme Corp",
        pageNumber: 1,
        metadata: null,
      },
    ],
    rejectedFindingsCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists findings and updates document metadata inside a single atomic transaction", async () => {
    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: mockDocId, status: "analyzing" }]),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: "finding-1", documentId: mockDocId, label: "Party Term" },
          ]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: mockDocId,
                status: "ready",
                documentType: "nda",
                governingLaw: "Laws of New York",
              },
            ]),
          }),
        }),
      }),
    };

    (db.transaction as any).mockImplementationOnce(async (callback: any) => {
      return await callback(mockTx);
    });

    const result = await persistDocumentIntelligence(mockValidatedResult);

    expect(result.document.status).toBe("ready");
    expect(result.findings).toHaveLength(1);
    expect(mockTx.delete).toHaveBeenCalledTimes(1); // Deletes prior findings (idempotent)
    expect(mockTx.insert).toHaveBeenCalledTimes(1);
    expect(mockTx.update).toHaveBeenCalledTimes(1);
  });

  it("handles empty findings gracefully and updates document status to ready", async () => {
    const emptyFindingsResult: ValidatedIntelligenceResult = {
      ...mockValidatedResult,
      findings: [],
    };

    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: mockDocId }]),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
      insert: vi.fn(),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: mockDocId, status: "ready" }]),
          }),
        }),
      }),
    };

    (db.transaction as any).mockImplementationOnce(async (callback: any) => {
      return await callback(mockTx);
    });

    const result = await persistDocumentIntelligence(emptyFindingsResult);

    expect(result.document.status).toBe("ready");
    expect(result.findings).toHaveLength(0);
    expect(mockTx.insert).not.toHaveBeenCalled(); // No empty insert
  });

  it("records error status safely outside transaction when database persistence fails", async () => {
    (db.transaction as any).mockRejectedValueOnce(
      new Error("PostgreSQL foreign key violation")
    );

    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    (db.update as any) = mockUpdate;

    await expect(persistDocumentIntelligence(mockValidatedResult)).rejects.toThrow(
      IntelligencePersistenceError
    );

    // Fallback status update was invoked to set status='error' safely
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("orchestrates processDocumentIntelligence setting status to analyzing then ready", async () => {
    // 1. db.update() for setting status: 'analyzing'
    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    (db.update as any) = mockUpdate;

    // 2. Mock analyzeDocumentIntelligence
    mockAnalyzeDocumentIntelligence.mockResolvedValueOnce(mockValidatedResult);

    // 3. Mock transaction
    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: mockDocId }]),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "finding-1" }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: mockDocId, status: "ready" }]),
          }),
        }),
      }),
    };

    (db.transaction as any).mockImplementationOnce(async (callback: any) => {
      return await callback(mockTx);
    });

    const result = await processDocumentIntelligence(mockDocId);

    expect(result.document.status).toBe("ready");
    expect(result.findings).toHaveLength(1);
    expect(mockUpdate).toHaveBeenCalledWith(expect.anything());
  });
});
