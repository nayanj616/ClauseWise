import { describe, it, expect } from "vitest";
import {
  isExcerptInContent,
  normalizeWhitespace,
  validateIntelligenceEvidence,
} from "@/lib/intelligence/evidence-validator";
import type {
  IntelligenceInputPayload,
  IntelligenceInputSection,
  IntelligenceInputChunk,
} from "@/lib/intelligence/types";
import type { RawAiIntelligenceResponse } from "@/lib/intelligence/schemas";

describe("Evidence Validator — Phase 3", () => {
  describe("Text Grounding Helpers", () => {
    it("matches exact substrings in content", () => {
      const content = "This Agreement is entered into between Acme Corp and Beta LLC.";
      expect(isExcerptInContent(content, "Acme Corp and Beta LLC")).toBe(true);
      expect(isExcerptInContent(content, "Gamma Inc")).toBe(false);
    });

    it("matches normalized whitespace across newlines and irregular spacing", () => {
      const content = "Section 1. Confidentiality.\n  The recipient\n  shall not disclose.";
      const excerpt = "The recipient shall not disclose.";
      expect(isExcerptInContent(content, excerpt)).toBe(true);
    });

    it("rejects empty or whitespace-only queries", () => {
      expect(isExcerptInContent("Some text", "")).toBe(false);
      expect(isExcerptInContent("Some text", "   ")).toBe(false);
      expect(isExcerptInContent("", "Some query")).toBe(false);
    });
  });

  describe("validateIntelligenceEvidence()", () => {
    const mockSections: IntelligenceInputSection[] = [
      {
        id: "sec-0",
        orderIndex: 0,
        title: "Preamble",
        content: 'This Non-Disclosure Agreement is made by and between TechCorp ("Disclosing Party") and DevCo ("Recipient").',
        pageStart: 1,
        pageEnd: 1,
      },
      {
        id: "sec-1",
        orderIndex: 1,
        title: "Confidentiality Obligations",
        content: "Recipient shall hold all Proprietary Information in strict confidence for a period of 3 years.",
        pageStart: 2,
        pageEnd: 2,
      },
      {
        id: "sec-2",
        orderIndex: 2,
        title: "Governing Law",
        content: "This Agreement shall be governed by the laws of the State of New York. Exclusive jurisdiction in Manhattan courts.",
        pageStart: 3,
        pageEnd: 3,
      },
    ];

    const mockChunks: IntelligenceInputChunk[] = [
      {
        id: "chk-0",
        sectionId: "sec-0",
        chunkIndex: 0,
        content: mockSections[0].content,
        pageNumber: 1,
      },
      {
        id: "chk-1",
        sectionId: "sec-1",
        chunkIndex: 1,
        content: mockSections[1].content,
        pageNumber: 2,
      },
      {
        id: "chk-2",
        sectionId: "sec-2",
        chunkIndex: 2,
        content: mockSections[2].content,
        pageNumber: 3,
      },
    ];

    const mockPayload: IntelligenceInputPayload = {
      documentId: "doc-123",
      filename: "TechCorp_NDA.pdf",
      mimeType: "application/pdf",
      pageCount: 3,
      sections: mockSections,
      chunks: mockChunks,
    };

    it("verifies grounded findings and attaches persisted sectionId, chunkId, and pageNumber", () => {
      const rawAiResponse: RawAiIntelligenceResponse = {
        classification: {
          documentType: "nda",
          isStatedInText: true,
          sourceText: "Non-Disclosure Agreement",
          sectionOrderIndex: 0,
          inferenceReason: null,
        },
        parties: [
          {
            name: "TechCorp",
            role: "Disclosing Party",
            sourceText: 'TechCorp ("Disclosing Party")',
            sectionOrderIndex: 0,
          },
        ],
        governingLaw: {
          law: "laws of the State of New York",
          sourceText: "governed by the laws of the State of New York",
          sectionOrderIndex: 2,
        },
        jurisdiction: {
          jurisdiction: "Manhattan courts",
          sourceText: "Exclusive jurisdiction in Manhattan courts",
          sectionOrderIndex: 2,
        },
        executiveSummary: "A mutual NDA protecting proprietary information for 3 years under New York law.",
        importantSections: [
          {
            sectionOrderIndex: 1,
            title: "Confidentiality Obligations",
            reason: "Core obligation terms",
          },
        ],
        findings: [
          {
            findingType: "obligation",
            importance: "needs_attention",
            label: "3-Year Confidentiality Term",
            summary: "Recipient must keep information confidential for 3 years.",
            sourceText: "hold all Proprietary Information in strict confidence for a period of 3 years",
            sectionOrderIndex: 1,
            metadata: null,
          },
        ],
      };

      const validated = validateIntelligenceEvidence(rawAiResponse, mockPayload);

      expect(validated.documentId).toBe("doc-123");
      expect(validated.rejectedFindingsCount).toBe(0);
      expect(validated.findings).toHaveLength(1);

      const finding = validated.findings[0];
      expect(finding.sectionId).toBe("sec-1");
      expect(finding.chunkId).toBe("chk-1");
      expect(finding.pageNumber).toBe(2);
      expect(finding.sourceText).toContain("period of 3 years");

      // Verify metadata evidence
      expect(validated.parties).toHaveLength(1);
      expect(validated.parties[0].sectionId).toBe("sec-0");
      expect(validated.governingLaw?.law).toBe("laws of the State of New York");
      expect(validated.governingLaw?.sectionId).toBe("sec-2");
      expect(validated.jurisdiction?.sectionId).toBe("sec-2");
      expect(validated.classification.isStatedInText).toBe(true);
      expect(validated.classification.sectionId).toBe("sec-0");
    });

    it("rejects candidate findings whose sourceText is hallucinated and not in the section", () => {
      const rawAiResponse: RawAiIntelligenceResponse = {
        classification: {
          documentType: "nda",
          isStatedInText: false,
          sourceText: null,
          sectionOrderIndex: null,
          inferenceReason: "Inferred from obligations.",
        },
        parties: [],
        governingLaw: null,
        jurisdiction: null,
        executiveSummary: "Summary.",
        importantSections: [],
        findings: [
          {
            findingType: "obligation",
            importance: "needs_attention",
            label: "Hallucinated Penalty",
            summary: "Claims a 50,000 dollar penalty exists.",
            sourceText: "The penalty for breach shall be $50,000.", // Not in text!
            sectionOrderIndex: 1,
            metadata: null,
          },
        ],
      };

      const validated = validateIntelligenceEvidence(rawAiResponse, mockPayload);

      expect(validated.findings).toHaveLength(0);
      expect(validated.rejectedFindingsCount).toBe(1);
    });

    it("rejects candidate findings pointing to an out-of-bounds sectionOrderIndex", () => {
      const rawAiResponse: RawAiIntelligenceResponse = {
        classification: {
          documentType: "general",
          isStatedInText: false,
          sourceText: null,
          sectionOrderIndex: null,
          inferenceReason: "General contract.",
        },
        parties: [],
        governingLaw: null,
        jurisdiction: null,
        executiveSummary: "Summary.",
        importantSections: [],
        findings: [
          {
            findingType: "key_term",
            importance: "informational",
            label: "Invalid Section",
            summary: "Points to section 99.",
            sourceText: "Some text",
            sectionOrderIndex: 99, // Out of bounds!
            metadata: null,
          },
        ],
      };

      const validated = validateIntelligenceEvidence(rawAiResponse, mockPayload);

      expect(validated.findings).toHaveLength(0);
      expect(validated.rejectedFindingsCount).toBe(1);
    });

    it("validates missing_information findings against catalog and rejects invented topics", () => {
      const rawAiResponse: RawAiIntelligenceResponse = {
        classification: {
          documentType: "nda",
          isStatedInText: false,
          sourceText: null,
          sectionOrderIndex: null,
          inferenceReason: "NDA.",
        },
        parties: [],
        governingLaw: null,
        jurisdiction: null,
        executiveSummary: "Summary.",
        importantSections: [],
        findings: [
          {
            findingType: "missing_information",
            importance: "important",
            label: "Missing Standard Exclusions",
            summary: "Standard exclusions (public domain, prior knowledge) are missing.",
            sourceText: null,
            sectionOrderIndex: null,
            expectedTopic: "standard_exclusions_to_confidentiality", // Allowed!
            ruleBasis: "Core provision catalog for NDAs requires standard exclusions.",
            metadata: null,
          },
          {
            findingType: "missing_information",
            importance: "important",
            label: "Invented Missing Provision",
            summary: "Contract lacks a clause about company dog policies.",
            sourceText: null,
            sectionOrderIndex: null,
            expectedTopic: "pet_allowance_clause", // Disallowed!
            ruleBasis: "Invented rule.",
            metadata: null,
          },
        ],
      };

      const validated = validateIntelligenceEvidence(rawAiResponse, mockPayload);

      // Allowed topic is kept; invented topic is dropped
      expect(validated.findings).toHaveLength(1);
      expect(validated.findings[0].label).toBe("Missing Standard Exclusions");
      expect(validated.findings[0].findingType).toBe("missing_information");
      expect(validated.rejectedFindingsCount).toBe(1);
    });

    it("downgrades classification to inference if stated sourceText is not found in section", () => {
      const rawAiResponse: RawAiIntelligenceResponse = {
        classification: {
          documentType: "employment_agreement",
          isStatedInText: true,
          sourceText: "EXECUTIVE EMPLOYMENT AGREEMENT", // Does not exist in section 0
          sectionOrderIndex: 0,
          inferenceReason: null,
        },
        parties: [],
        governingLaw: null,
        jurisdiction: null,
        executiveSummary: "Summary.",
        importantSections: [],
        findings: [],
      };

      const validated = validateIntelligenceEvidence(rawAiResponse, mockPayload);

      // Downgraded to inference with fallback reason
      expect(validated.classification.isStatedInText).toBe(false);
      expect(validated.classification.sourceText).toBeNull();
      expect(validated.classification.sectionId).toBeNull();
      expect(validated.classification.inferenceReason).toBeTruthy();
    });

    it("drops ungrounded governing law or jurisdiction claims without failing whole result", () => {
      const rawAiResponse: RawAiIntelligenceResponse = {
        classification: {
          documentType: "general",
          isStatedInText: false,
          sourceText: null,
          sectionOrderIndex: null,
          inferenceReason: "General contract.",
        },
        parties: [],
        governingLaw: {
          law: "Laws of England and Wales",
          sourceText: "governed by the laws of England and Wales", // Not in section 0!
          sectionOrderIndex: 0,
        },
        jurisdiction: null,
        executiveSummary: "Summary.",
        importantSections: [],
        findings: [],
      };

      const validated = validateIntelligenceEvidence(rawAiResponse, mockPayload);

      expect(validated.governingLaw).toBeNull();
    });
  });
});

