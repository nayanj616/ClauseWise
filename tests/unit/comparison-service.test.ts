import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeTitle,
  normalizeContent,
  calculateJaccardSimilarity,
  alignDocumentSections,
  compareDocumentMetadata,
  compareDocuments,
  ComparisonValidationError,
  ComparisonAccessError,
  ComparisonReadinessError,
} from "@/lib/services/comparison-service";
import type { WorkspaceSection } from "@/lib/services/document-service";
import type { DocumentFinding } from "@/lib/db/schema";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/services/document-service", () => ({
  getDocumentWorkspaceData: vi.fn(),
  listUserDocuments: vi.fn(),
}));

vi.mock("@/lib/services/intelligence-service", () => ({
  getPersistedDocumentFindings: vi.fn(),
}));

import { getDocumentWorkspaceData } from "@/lib/services/document-service";
import { getPersistedDocumentFindings } from "@/lib/services/intelligence-service";

describe("Comparison Service — Text Normalization & Alignment", () => {
  it("normalizeTitle strips clause numbers, punctuation, and whitespace", () => {
    expect(normalizeTitle("Section 1: General Provisions")).toBe("general provisions");
    expect(normalizeTitle("1.0 Term and Termination")).toBe("term and termination");
    expect(normalizeTitle("Article IV - Confidentiality")).toBe("confidentiality");
    expect(normalizeTitle("Schedule A: Pricing")).toBe("pricing");
    expect(normalizeTitle("")).toBe("");
  });

  it("normalizeContent collapses extra whitespace and line breaks", () => {
    expect(normalizeContent("  Hello   World  \r\n\r\n Test  ")).toBe("Hello World \n Test");
    expect(normalizeContent("")).toBe("");
  });

  it("calculateJaccardSimilarity returns exact metric", () => {
    // Identical text
    expect(calculateJaccardSimilarity("Apple Banana Orange", "Apple Banana Orange")).toBe(1.0);

    // Completely disjoint
    expect(calculateJaccardSimilarity("Alpha Beta Gamma", "One Two Three")).toBe(0.0);

    // Partial overlap
    // Text A: "customer agrees to pay within thirty days" (tokens: customer, agrees, pay, within, thirty, days = 6)
    // Text B: "customer agrees to remit within forty days" (tokens: customer, agrees, remit, within, forty, days = 6)
    // Intersection: customer, agrees, within, days = 4
    // Union: customer, agrees, pay, within, thirty, days, remit, forty = 8
    // Jaccard: 4 / 8 = 0.5
    const sim = calculateJaccardSimilarity(
      "customer agrees to pay within thirty days",
      "customer agrees to remit within forty days"
    );
    expect(sim).toBe(0.5);
  });

  it("alignDocumentSections pairs exact normalized titles in Pass 1", () => {
    const secA: WorkspaceSection[] = [
      { id: "sec-a1", orderIndex: 0, sectionNumber: 1, title: "1. Term", content: "Initial term of 2 years.", pageStart: 1, pageEnd: 1 },
      { id: "sec-a2", orderIndex: 1, sectionNumber: 2, title: "2. Fees", content: "Monthly fee of $5,000.", pageStart: 2, pageEnd: 2 },
    ];
    const secB: WorkspaceSection[] = [
      { id: "sec-b2", orderIndex: 0, sectionNumber: 1, title: "Section 2: Fees", content: "Monthly fee of $6,000.", pageStart: 1, pageEnd: 1 },
      { id: "sec-b1", orderIndex: 1, sectionNumber: 2, title: "Section 1 - Term", content: "Initial term of 3 years.", pageStart: 2, pageEnd: 2 },
    ];

    const pairs = alignDocumentSections(secA, secB);
    expect(pairs).toHaveLength(2);

    const termPair = pairs.find((p) => p.secA?.id === "sec-a1");
    expect(termPair?.secB?.id).toBe("sec-b1");
    expect(termPair?.matchTier).toBe("exact_title");

    const feesPair = pairs.find((p) => p.secA?.id === "sec-a2");
    expect(feesPair?.secB?.id).toBe("sec-b2");
    expect(feesPair?.matchTier).toBe("exact_title");
  });

  it("alignDocumentSections pairs canonical provision keywords in Pass 2", () => {
    const secA: WorkspaceSection[] = [
      { id: "sec-a1", orderIndex: 0, sectionNumber: 1, title: "Proprietary Information", content: "All technical data is proprietary.", pageStart: 1, pageEnd: 1 },
    ];
    const secB: WorkspaceSection[] = [
      { id: "sec-b1", orderIndex: 0, sectionNumber: 1, title: "Confidentiality and Non-Disclosure", content: "All proprietary information shall remain confidential.", pageStart: 1, pageEnd: 1 },
    ];

    const pairs = alignDocumentSections(secA, secB);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].secA?.id).toBe("sec-a1");
    expect(pairs[0].secB?.id).toBe("sec-b1");
    expect(pairs[0].matchTier).toBe("canonical_topic");
  });

  it("alignDocumentSections enforces strictly 1:1 matching with deterministic tie-breaking in Pass 3", () => {
    // Sec A1 has similar wording to both B1 and B2, but B2 has higher similarity
    const secA: WorkspaceSection[] = [
      {
        id: "sec-a1",
        orderIndex: 0,
        sectionNumber: 1,
        title: "Clause Alpha",
        content: "Provider shall provide continuous service access with standard maintenance notice of twenty-four hours.",
        pageStart: 1,
        pageEnd: 1,
      },
    ];
    const secB: WorkspaceSection[] = [
      {
        id: "sec-b1",
        orderIndex: 0,
        sectionNumber: 1,
        title: "Clause Beta One",
        content: "Provider shall provide continuous service access and forty-eight hours maintenance notice.",
        pageStart: 1,
        pageEnd: 1,
      },
      {
        id: "sec-b2",
        orderIndex: 1,
        sectionNumber: 2,
        title: "Clause Beta Two",
        content: "Provider shall provide continuous service access with standard maintenance notice of twenty-four hours to customer.",
        pageStart: 2,
        pageEnd: 2,
      },
    ];

    const pairs = alignDocumentSections(secA, secB);
    // sec-a1 must match sec-b2 (higher similarity), and sec-b1 remains unmatched (Added)
    expect(pairs).toHaveLength(2);

    const matchedPair = pairs.find((p) => p.secA?.id === "sec-a1");
    expect(matchedPair?.secB?.id).toBe("sec-b2");
    expect(matchedPair?.matchTier).toBe("jaccard_content");

    const unmatchedBPair = pairs.find((p) => p.secB?.id === "sec-b1");
    expect(unmatchedBPair?.secA).toBeUndefined();
    expect(unmatchedBPair?.matchTier).toBe("unmatched");
  });

  it("alignDocumentSections leaves sections unmatched when below Jaccard threshold", () => {
    const secA: WorkspaceSection[] = [
      { id: "sec-a1", orderIndex: 0, sectionNumber: 1, title: "Custom Warranty", content: "Supplier warrants the goods are free from latent defects.", pageStart: 1, pageEnd: 1 },
    ];
    const secB: WorkspaceSection[] = [
      { id: "sec-b1", orderIndex: 0, sectionNumber: 1, title: "Export Controls", content: "Parties shall strictly comply with foreign trade regulations and sanctions.", pageStart: 1, pageEnd: 1 },
    ];

    const pairs = alignDocumentSections(secA, secB);
    expect(pairs).toHaveLength(2);

    const removed = pairs.find((p) => p.secA?.id === "sec-a1");
    expect(removed?.secB).toBeUndefined();

    const added = pairs.find((p) => p.secB?.id === "sec-b1");
    expect(added?.secA).toBeUndefined();
  });
});

describe("Comparison Service — Metadata Diffing", () => {
  it("detects differences and identical values across metadata fields", () => {
    const docA = {
      documentType: "Master Services Agreement",
      governingLaw: "State of New York",
      jurisdiction: "New York County",
      parties: [{ name: "Alpha Corp", role: "Customer" }, { name: "Omega LLC", role: "Provider" }],
    };
    const docB = {
      documentType: "Master Services Agreement",
      governingLaw: "State of Delaware",
      jurisdiction: "Wilmington, Delaware",
      parties: [{ name: "Alpha Corp", role: "Customer" }, { name: "Omega LLC", role: "Provider" }],
    };

    const diffs = compareDocumentMetadata(docA, docB);
    expect(diffs).toHaveLength(4);

    const typeDiff = diffs.find((d) => d.field === "document_type");
    expect(typeDiff?.isDifferent).toBe(false);

    const lawDiff = diffs.find((d) => d.field === "governing_law");
    expect(lawDiff?.isDifferent).toBe(true);
    expect(lawDiff?.valueA).toBe("State of New York");
    expect(lawDiff?.valueB).toBe("State of Delaware");

    const jurDiff = diffs.find((d) => d.field === "jurisdiction");
    expect(jurDiff?.isDifferent).toBe(true);

    const partiesDiff = diffs.find((d) => d.field === "parties");
    expect(partiesDiff?.isDifferent).toBe(false);
  });
});

describe("Comparison Service — compareDocuments Domain Service", () => {
  const validUser = "00000000-0000-4000-a000-000000000001";
  const docAId = "11111111-1111-4111-a111-111111111111";
  const docBId = "22222222-2222-4222-a222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws ComparisonValidationError when document IDs are malformed or missing", async () => {
    await expect(
      compareDocuments({ documentAId: "", documentBId: docBId, userId: validUser })
    ).rejects.toThrow(ComparisonValidationError);

    await expect(
      compareDocuments({ documentAId: "invalid-uuid", documentBId: docBId, userId: validUser })
    ).rejects.toThrow(ComparisonValidationError);
  });

  it("throws ComparisonValidationError on self-comparison", async () => {
    await expect(
      compareDocuments({ documentAId: docAId, documentBId: docAId, userId: validUser })
    ).rejects.toThrow("Cannot compare a document with itself");
  });

  it("throws ComparisonAccessError when either document is not found or access denied (anti-oracle)", async () => {
    vi.mocked(getDocumentWorkspaceData).mockResolvedValueOnce(null);

    await expect(
      compareDocuments({ documentAId: docAId, documentBId: docBId, userId: validUser })
    ).rejects.toThrow(ComparisonAccessError);
  });

  it("throws ComparisonReadinessError when either document is not in ready status", async () => {
    vi.mocked(getDocumentWorkspaceData)
      .mockResolvedValueOnce({
        document: {
          id: docAId,
          filename: "Contract_A.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 1000,
          status: "extracting",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        sections: [],
      })
      .mockResolvedValueOnce({
        document: {
          id: docBId,
          filename: "Contract_B.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 1000,
          status: "ready",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        sections: [],
      });

    await expect(
      compareDocuments({ documentAId: docAId, documentBId: docBId, userId: validUser })
    ).rejects.toThrow(ComparisonReadinessError);
  });

  it("assembles complete comparison result with added, removed, modified, and unchanged sections", async () => {
    vi.mocked(getDocumentWorkspaceData)
      .mockResolvedValueOnce({
        document: {
          id: docAId,
          filename: "Agreement_v1.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 2000,
          documentType: "Non-Disclosure Agreement",
          governingLaw: "State of New York",
          jurisdiction: "New York County",
          parties: [{ name: "Alpha Inc", role: "Disclosing Party" }],
          pageCount: 2,
          status: "ready",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        sections: [
          {
            id: "sec-a1",
            orderIndex: 0,
            sectionNumber: 1,
            title: "1. Term",
            content: "This Agreement shall remain in effect for two (2) years.",
            pageStart: 1,
            pageEnd: 1,
          },
          {
            id: "sec-a2",
            orderIndex: 1,
            sectionNumber: 2,
            title: "2. Confidentiality",
            content: "Recipient agrees not to disclose Confidential Information to third parties.",
            pageStart: 2,
            pageEnd: 2,
          },
          {
            id: "sec-a3",
            orderIndex: 2,
            sectionNumber: 3,
            title: "3. Severability",
            content: "If any provision is held unenforceable, the remainder shall continue in effect.",
            pageStart: 2,
            pageEnd: 2,
          },
        ],
      })
      .mockResolvedValueOnce({
        document: {
          id: docBId,
          filename: "Agreement_v2.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 2500,
          documentType: "Non-Disclosure Agreement",
          governingLaw: "State of California",
          jurisdiction: "San Francisco County",
          parties: [{ name: "Alpha Inc", role: "Disclosing Party" }],
          pageCount: 3,
          status: "ready",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        sections: [
          {
            id: "sec-b1",
            orderIndex: 0,
            sectionNumber: 1,
            title: "Section 1: Term",
            content: "This Agreement shall remain in effect for three (3) years.", // Modified duration
            pageStart: 1,
            pageEnd: 1,
          },
          {
            id: "sec-b2",
            orderIndex: 1,
            sectionNumber: 2,
            title: "Section 2: Confidentiality",
            content: "Recipient agrees not to disclose Confidential Information to third parties.", // Unchanged
            pageStart: 2,
            pageEnd: 2,
          },
          {
            id: "sec-b4",
            orderIndex: 2,
            sectionNumber: 3,
            title: "Section 3: Non-Solicitation", // Added in B
            content: "Recipient agrees not to solicit employees of Disclosing Party.",
            pageStart: 3,
            pageEnd: 3,
          },
        ],
      });

    vi.mocked(getPersistedDocumentFindings).mockResolvedValue([]);

    const result = await compareDocuments({
      documentAId: docAId,
      documentBId: docBId,
      userId: validUser,
    });

    expect(result.documentA.filename).toBe("Agreement_v1.pdf");
    expect(result.documentB.filename).toBe("Agreement_v2.pdf");

    // Summary counts
    expect(result.summary.modifiedCount).toBe(1); // Term modified
    expect(result.summary.unchangedCount).toBe(1); // Confidentiality unchanged
    expect(result.summary.removedCount).toBe(1); // Severability removed from B
    expect(result.summary.addedCount).toBe(1); // Non-Solicitation added in B
    expect(result.summary.totalDifferences).toBe(3); // modified + removed + added

    // Metadata difference check
    const lawDiff = result.metadataDifferences.find((d) => d.field === "governing_law");
    expect(lawDiff?.isDifferent).toBe(true);
    expect(lawDiff?.valueA).toBe("State of New York");
    expect(lawDiff?.valueB).toBe("State of California");
  });
});
