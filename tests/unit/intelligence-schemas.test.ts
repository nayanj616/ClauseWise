import { describe, it, expect } from "vitest";
import {
  RawAiFindingSchema,
  SubstantiveAiFindingSchema,
  MissingInfoAiFindingSchema,
  RawAiPartySchema,
  RawAiGoverningLawSchema,
  RawAiJurisdictionSchema,
  RawAiImportantSectionSchema,
  RawAiClassificationSchema,
  RawAiIntelligenceResponseSchema,
} from "@/lib/intelligence/schemas";

describe("Intelligence Schemas — Phase 3", () => {
  describe("RawAiFindingSchema (Discriminated Union)", () => {
    it("parses valid substantive findings with verbatim sourceText and sectionOrderIndex", () => {
      const validFinding = {
        findingType: "obligation",
        importance: "needs_attention",
        label: "Confidentiality Obligation",
        summary: "Recipient must hold all proprietary information in strict confidence.",
        sourceText: "Recipient agrees to maintain in confidence all Confidential Information.",
        sectionOrderIndex: 2,
        metadata: {
          party: "Recipient",
          amount: null,
          currency: null,
          frequency: null,
          dateValue: null,
          dateDescription: null,
          conflictingSectionOrderIndex: null,
          conflictingSourceText: null,
          expectedTopic: null,
          ruleBasis: null,
        },
      };

      const result = RawAiFindingSchema.safeParse(validFinding);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.findingType).toBe("obligation");
        expect(result.data.sourceText).toBe(validFinding.sourceText);
      }
    });

    it("rejects substantive findings when sourceText is empty or null", () => {
      const nullSource = {
        findingType: "obligation",
        importance: "important",
        label: "Unsubstantiated Obligation",
        summary: "An obligation without text.",
        sourceText: null,
        sectionOrderIndex: 1,
        metadata: null,
      };
      expect(RawAiFindingSchema.safeParse(nullSource).success).toBe(false);

      const emptySource = {
        findingType: "obligation",
        importance: "important",
        label: "Empty Source",
        summary: "An obligation with empty text.",
        sourceText: "",
        sectionOrderIndex: 1,
        metadata: null,
      };
      expect(RawAiFindingSchema.safeParse(emptySource).success).toBe(false);
    });

    it("rejects substantive findings when sectionOrderIndex is missing or negative", () => {
      const negativeIndex = {
        findingType: "key_term",
        importance: "informational",
        label: "Term",
        summary: "A term",
        sourceText: "Defined Term means...",
        sectionOrderIndex: -1,
        metadata: null,
      };
      expect(RawAiFindingSchema.safeParse(negativeIndex).success).toBe(false);

      const missingIndex = {
        findingType: "key_term",
        importance: "informational",
        label: "Term",
        summary: "A term",
        sourceText: "Defined Term means...",
        metadata: null,
      };
      expect(RawAiFindingSchema.safeParse(missingIndex).success).toBe(false);
    });

    it("parses valid missing_information findings with null sourceText and catalog topic", () => {
      const missingFinding = {
        findingType: "missing_information",
        importance: "needs_attention",
        label: "Missing Confidentiality Term",
        summary: "The agreement does not specify an expiration for the confidentiality obligations.",
        sourceText: null,
        sectionOrderIndex: null,
        expectedTopic: "confidentiality_duration_or_term",
        ruleBasis: "Standard commercial NDAs define the duration of confidentiality protection.",
        metadata: null,
      };

      const result = RawAiFindingSchema.safeParse(missingFinding);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.findingType).toBe("missing_information");
        expect(result.data.sourceText).toBeNull();
      }
    });

    it("rejects missing_information findings if expectedTopic or ruleBasis is missing", () => {
      const invalidMissing = {
        findingType: "missing_information",
        importance: "important",
        label: "Missing Item",
        summary: "Something is missing",
        sourceText: null,
        sectionOrderIndex: null,
        metadata: null,
      };
      expect(RawAiFindingSchema.safeParse(invalidMissing).success).toBe(false);
    });

    it("strictly rejects numerical risk scores or unknown fields in findings", () => {
      const findingWithRiskScore = {
        findingType: "obligation",
        importance: "needs_attention",
        label: "High Risk Clause",
        summary: "Very risky clause.",
        sourceText: "Indemnity clause...",
        sectionOrderIndex: 3,
        riskScore: 85, // Disallowed!
        metadata: null,
      };

      expect(RawAiFindingSchema.safeParse(findingWithRiskScore).success).toBe(false);
    });
  });

  describe("Metadata Evidence Schemas", () => {
    it("validates party schema requiring non-empty sourceText and sectionOrderIndex", () => {
      const validParty = {
        name: "Acme Corporation",
        role: "Disclosing Party",
        sourceText: 'between Acme Corporation ("Disclosing Party") and...',
        sectionOrderIndex: 0,
      };
      expect(RawAiPartySchema.safeParse(validParty).success).toBe(true);

      const invalidParty = {
        name: "Acme Corporation",
        role: "Disclosing Party",
        sourceText: "", // Empty source text
        sectionOrderIndex: 0,
      };
      expect(RawAiPartySchema.safeParse(invalidParty).success).toBe(false);
    });

    it("validates governing law and jurisdiction schemas with evidence", () => {
      const validLaw = {
        law: "Laws of the State of Delaware",
        sourceText: "This Agreement shall be governed by the Laws of the State of Delaware.",
        sectionOrderIndex: 5,
      };
      expect(RawAiGoverningLawSchema.safeParse(validLaw).success).toBe(true);

      const validJurisdiction = {
        jurisdiction: "Courts of New Castle County, Delaware",
        sourceText: "Jurisdiction shall lie exclusively with the Courts of New Castle County.",
        sectionOrderIndex: 5,
      };
      expect(RawAiJurisdictionSchema.safeParse(validJurisdiction).success).toBe(true);
    });

    it("validates document classification provenance (stated in text vs inferred)", () => {
      const statedClassification = {
        documentType: "nda",
        isStatedInText: true,
        sourceText: "MUTUAL NON-DISCLOSURE AGREEMENT",
        sectionOrderIndex: 0,
        inferenceReason: null,
      };
      expect(RawAiClassificationSchema.safeParse(statedClassification).success).toBe(true);

      const inferredClassification = {
        documentType: "service_agreement",
        isStatedInText: false,
        sourceText: null,
        sectionOrderIndex: null,
        inferenceReason: "Contains statement of work, milestone payments, and service deliverable clauses.",
      };
      expect(RawAiClassificationSchema.safeParse(inferredClassification).success).toBe(true);

      // Stated in text without source text should fail refinement
      const invalidStated = {
        documentType: "nda",
        isStatedInText: true,
        sourceText: null,
        sectionOrderIndex: null,
        inferenceReason: null,
      };
      expect(RawAiClassificationSchema.safeParse(invalidStated).success).toBe(false);
    });
  });

  describe("Complete RawAiIntelligenceResponseSchema", () => {
    it("validates full structured response and rejects numerical risk scores at top level", () => {
      const fullResponse = {
        classification: {
          documentType: "nda",
          isStatedInText: true,
          sourceText: "NON-DISCLOSURE AGREEMENT",
          sectionOrderIndex: 0,
          inferenceReason: null,
        },
        parties: [
          {
            name: "Alpha Corp",
            role: "Disclosing Party",
            sourceText: 'Alpha Corp ("Discloser")',
            sectionOrderIndex: 0,
          },
        ],
        governingLaw: {
          law: "Laws of California",
          sourceText: "Governed by the laws of California",
          sectionOrderIndex: 4,
        },
        jurisdiction: null,
        executiveSummary:
          "This is a standard mutual non-disclosure agreement governing proprietary information exchange.",
        importantSections: [
          {
            sectionOrderIndex: 2,
            title: "Confidentiality Obligations",
            reason: "Defines the standard of care required.",
          },
        ],
        findings: [
          {
            findingType: "key_term",
            importance: "informational",
            label: "Confidential Information",
            summary: "Defines confidential materials.",
            sourceText: 'Confidential Information shall mean...',
            sectionOrderIndex: 1,
            metadata: null,
          },
        ],
      };

      expect(RawAiIntelligenceResponseSchema.safeParse(fullResponse).success).toBe(true);

      // Top level numerical score must be rejected
      const responseWithScore = {
        ...fullResponse,
        riskScore: 42,
      };
      expect(RawAiIntelligenceResponseSchema.safeParse(responseWithScore).success).toBe(false);
    });
  });
});

