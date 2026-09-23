/**
 * Unit Tests — Professional Prep Service (Phase 8)
 *
 * Verifies:
 * 1. Ownership & Tenant Isolation:
 *    - Throws PrepAccessError when document does not exist or belongs to another user (anti-oracle).
 *    - Validates UUIDs and input strings.
 * 2. Deterministic Assembly:
 *    - Assembles complete briefing data from verified document metadata, sections, findings, actions, and user questions.
 *    - Correctly maps key clauses from importantSections metadata.
 *    - Correctly groups findings into attentionItems, ambiguities, missingProvisions, and obligations.
 *    - Correctly counts open vs completed actions.
 *    - Handles sparse documents (zero findings, actions, questions) gracefully without throwing.
 * 3. Discussion-Framed Clarification Prompts (Checkpoint 1):
 *    - Questions are strictly objective inquiry prompts ("Discuss...", "Clarify...", "Review...").
 *    - Never outputs legal recommendations, directives, or numerical risk scores.
 *    - Correctly assigns categories and retains provenance coordinates.
 * 4. Markdown Briefing Export:
 *    - Produces clean, well-formatted Markdown with disclaimer notices and section headings.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProfessionalPrepData,
  deriveClarificationQuestions,
  formatBriefingAsMarkdown,
  verifyDocumentOwnership,
  PrepAccessError,
  PrepServiceError,
  type ProfessionalPrepData,
} from "@/lib/services/preparation-service";
import type { DocumentFinding, WorkspaceSection, ActionWithDetails } from "@/types";

// ---------------------------------------------------------------------------
// Test Constants & Fixtures
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const OTHER_DOC_ID = "22222222-2222-4222-a222-222222222222";
const USER_ID = "user_owner_123";
const OTHER_USER_ID = "user_attacker_456";

const SEC_1_ID = "sec-1111-1111";
const SEC_2_ID = "sec-2222-2222";

const mockSections: WorkspaceSection[] = [
  {
    id: SEC_1_ID,
    orderIndex: 0,
    sectionNumber: 1,
    title: "1. Term and Termination",
    content: "This agreement may be terminated by either party with 30 days notice.",
    pageStart: 1,
    pageEnd: 1,
  },
  {
    id: SEC_2_ID,
    orderIndex: 1,
    sectionNumber: 2,
    title: "2. Confidentiality",
    content: "Recipient shall use reasonable efforts to protect proprietary information indefinitely.",
    pageStart: 2,
    pageEnd: 2,
  },
];

const mockSectionsById = new Map<string, WorkspaceSection>([
  [SEC_1_ID, mockSections[0]],
  [SEC_2_ID, mockSections[1]],
]);

const mockFindings: DocumentFinding[] = [
  {
    id: "f-1",
    documentId: VALID_DOC_ID,
    sectionId: SEC_1_ID,
    chunkId: null,
    findingType: "attention",
    importance: "needs_attention",
    label: "Immediate Termination Risk",
    summary: "Termination right is asymmetrical and lacks clear cure period.",
    sourceText: "This agreement may be terminated by either party with 30 days notice.",
    pageNumber: 1,
    metadata: null,
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  },
  {
    id: "f-2",
    documentId: VALID_DOC_ID,
    sectionId: SEC_2_ID,
    chunkId: null,
    findingType: "ambiguity",
    importance: "important",
    label: "Vague Standard for Reasonable Efforts",
    summary: "Scope of reasonable efforts is undefined and indefinite.",
    sourceText: "use reasonable efforts to protect proprietary information indefinitely",
    pageNumber: 2,
    metadata: null,
    createdAt: new Date("2026-09-02"),
    updatedAt: new Date("2026-09-02"),
  },
  {
    id: "f-3",
    documentId: VALID_DOC_ID,
    sectionId: null,
    chunkId: null,
    findingType: "missing_information",
    importance: "needs_attention",
    label: "Missing Governing Law Provision",
    summary: "The agreement does not identify any governing jurisdiction or applicable state law.",
    sourceText: null,
    pageNumber: null,
    metadata: { expectedTopic: "Governing Law" },
    createdAt: new Date("2026-09-03"),
    updatedAt: new Date("2026-09-03"),
  },
  {
    id: "f-4",
    documentId: VALID_DOC_ID,
    sectionId: SEC_1_ID,
    chunkId: null,
    findingType: "inconsistency",
    importance: "important",
    label: "Conflicting Notice Days",
    summary: "Section 1 mentions 30 days while Section 4 references 60 days.",
    sourceText: "30 days notice",
    pageNumber: 1,
    metadata: null,
    createdAt: new Date("2026-09-04"),
    updatedAt: new Date("2026-09-04"),
  },
  {
    id: "f-5",
    documentId: VALID_DOC_ID,
    sectionId: SEC_2_ID,
    chunkId: null,
    findingType: "obligation",
    importance: "informational",
    label: "Non-Disclosure Obligation",
    summary: "Standard obligation to preserve proprietary information.",
    sourceText: "Recipient shall use reasonable efforts",
    pageNumber: 2,
    metadata: null,
    createdAt: new Date("2026-09-05"),
    updatedAt: new Date("2026-09-05"),
  },
];

const mockActions: ActionWithDetails[] = [
  {
    id: "act-1",
    documentId: VALID_DOC_ID,
    findingId: "f-1",
    userId: USER_ID,
    title: "Clarify termination notice with counsel",
    description: "Discuss whether cure period should be 60 days instead of 30.",
    status: "open",
    createdAt: new Date("2026-09-10"),
    updatedAt: new Date("2026-09-10"),
    completedAt: null,
    document: { id: VALID_DOC_ID, title: "Test NDA", originalFilename: "test-nda.pdf" },
    finding: {
      id: "f-1",
      findingType: "attention",
      importance: "needs_attention",
      label: "Immediate Termination Risk",
      summary: "Termination right is asymmetrical.",
      sourceText: "This agreement may be terminated by either party with 30 days notice.",
      pageNumber: 1,
      sectionId: SEC_1_ID,
      sectionTitle: "1. Term and Termination",
    },
  },
  {
    id: "act-2",
    documentId: VALID_DOC_ID,
    findingId: null,
    userId: USER_ID,
    title: "Verify corporate signature authorization",
    description: "Confirm signatory authority for both entities.",
    status: "completed",
    createdAt: new Date("2026-09-11"),
    updatedAt: new Date("2026-09-12"),
    completedAt: new Date("2026-09-12"),
    document: { id: VALID_DOC_ID, title: "Test NDA", originalFilename: "test-nda.pdf" },
    finding: null,
  },
];

const mockUserQuestions = [
  {
    id: "msg-1",
    conversationId: "convo-1",
    question: "Can they terminate without cause?",
    createdAt: new Date("2026-09-05T10:00:00Z"),
  },
  {
    id: "msg-2",
    conversationId: "convo-1",
    question: "What is the penalty for disclosure?",
    createdAt: new Date("2026-09-05T10:05:00Z"),
  },
];

// ---------------------------------------------------------------------------
// Service Mocks Setup
// ---------------------------------------------------------------------------

let mockOwnershipValid = true;

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (!mockOwnershipValid) return [];
              return [{ id: VALID_DOC_ID }];
            }),
          })),
        })),
      })),
    },
  };
});

vi.mock("@/lib/services/document-service", () => {
  return {
    getDocumentWorkspaceData: vi.fn(async (docId: string, userId: string) => {
      if (docId !== VALID_DOC_ID || userId !== USER_ID) return null;
      return {
        document: {
          id: VALID_DOC_ID,
          filename: "test-nda.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 20480,
          documentType: "nda",
          status: "ready",
          pageCount: 2,
          createdAt: new Date("2026-09-01"),
          updatedAt: new Date("2026-09-01"),
          errorMessage: null,
          governingLaw: "State of Delaware",
          jurisdiction: "Chancery Court of Delaware",
          parties: [
            { name: "Acme Corp", role: "Disclosing Party" },
            { name: "Beta LLC", role: "Receiving Party" },
          ],
          metadata: {
            classification: { isStatedInText: true },
            executiveSummary: "Mutual confidentiality agreement governing preliminary discussions.",
            importantSections: [
              {
                sectionId: SEC_1_ID,
                sectionOrderIndex: 0,
                title: "1. Term and Termination",
                reason: "Defines duration of obligations and notice periods.",
              },
            ],
          },
        },
        sections: mockSections,
      };
    }),
  };
});

vi.mock("@/lib/services/intelligence-service", () => {
  return {
    getPersistedDocumentFindings: vi.fn(async (docId: string) => {
      if (docId !== VALID_DOC_ID) return [];
      return mockFindings;
    }),
  };
});

vi.mock("@/lib/services/action-service", () => {
  return {
    listActionsByUser: vi.fn(async (input: { userId: string; documentId?: string }) => {
      if (input.userId !== USER_ID || input.documentId !== VALID_DOC_ID) return [];
      return mockActions;
    }),
  };
});

vi.mock("@/lib/services/conversation-service", () => {
  return {
    getUserQuestionsForDocument: vi.fn(async (input: { documentId: string; userId: string }) => {
      if (input.documentId !== VALID_DOC_ID || input.userId !== USER_ID) return [];
      return mockUserQuestions;
    }),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Professional Prep Domain Service", () => {
  beforeEach(() => {
    mockOwnershipValid = true;
    vi.clearAllMocks();
  });

  describe("Ownership & Anti-Oracle Security", () => {
    it("successfully verifies document ownership for authorized user", async () => {
      const res = await verifyDocumentOwnership(VALID_DOC_ID, USER_ID);
      expect(res.id).toBe(VALID_DOC_ID);
    });

    it("throws PrepAccessError when document does not exist or belongs to another tenant", async () => {
      mockOwnershipValid = false;
      await expect(verifyDocumentOwnership(OTHER_DOC_ID, OTHER_USER_ID)).rejects.toThrow(
        PrepAccessError
      );
    });

    it("throws PrepValidationError when documentId is not a valid UUID", async () => {
      await expect(getProfessionalPrepData("invalid-uuid", USER_ID)).rejects.toThrow();
    });

    it("throws PrepValidationError when userId is empty", async () => {
      await expect(getProfessionalPrepData(VALID_DOC_ID, "   ")).rejects.toThrow();
    });
  });

  describe("Clarification Questions Derivation (Checkpoint 1)", () => {
    it("derives objective discussion prompts rather than legal advice or directives", () => {
      const questions = deriveClarificationQuestions(mockFindings, mockSectionsById);

      expect(questions.length).toBeGreaterThanOrEqual(4);

      // Verify that every question is framed as a discussion prompt
      for (const q of questions) {
        expect(
          q.question.startsWith("Discuss with counsel") ||
          q.question.startsWith("Clarify") ||
          q.question.startsWith("Review with counsel") ||
          q.question.startsWith("Review the obligations")
        ).toBe(true);

        // Never assert directives or conclusions
        expect(q.question).not.toContain("must be changed");
        expect(q.question).not.toContain("is invalid");
        expect(q.question).not.toContain("should be deleted");
      }
    });

    it("categorizes missing provisions, ambiguities, inconsistencies, and attention items correctly", () => {
      const questions = deriveClarificationQuestions(mockFindings, mockSectionsById);

      const missingQ = questions.find((q) => q.category === "missing_provision");
      expect(missingQ).toBeDefined();
      expect(missingQ?.question).toContain("Governing Law");
      expect(missingQ?.catalogTopic).toBe("Governing Law");

      const ambiguityQ = questions.find((q) => q.category === "ambiguity");
      expect(ambiguityQ).toBeDefined();
      expect(ambiguityQ?.question).toContain("Vague Standard for Reasonable Efforts");
      expect(ambiguityQ?.sourceText).toContain("reasonable efforts");

      const inconsistencyQ = questions.find((q) => q.category === "inconsistency");
      expect(inconsistencyQ).toBeDefined();
      expect(inconsistencyQ?.question).toContain("Conflicting Notice Days");

      const attentionQ = questions.find((q) => q.category === "attention_item");
      expect(attentionQ).toBeDefined();
      expect(attentionQ?.question).toContain("Immediate Termination Risk");
    });

    it("deduplicates identical clarification prompts", () => {
      const duplicateFindings = [mockFindings[0], { ...mockFindings[0], id: "f-dup" }];
      const questions = deriveClarificationQuestions(duplicateFindings, mockSectionsById);
      expect(questions.length).toBe(1);
    });
  });

  describe("Briefing Assembly (getProfessionalPrepData)", () => {
    it("assembles complete ProfessionalPrepData with all structures populated", async () => {
      const data = await getProfessionalPrepData(VALID_DOC_ID, USER_ID);

      // 1. Document Profile
      expect(data.document.id).toBe(VALID_DOC_ID);
      expect(data.document.filename).toBe("test-nda.pdf");
      expect(data.document.documentType).toBe("nda");
      expect(data.document.isStatedType).toBe(true);
      expect(data.document.parties).toHaveLength(2);
      expect(data.document.governingLaw).toBe("State of Delaware");
      expect(data.document.jurisdiction).toBe("Chancery Court of Delaware");
      expect(data.document.executiveSummary).toContain("Mutual confidentiality");

      // 2. Key Clauses
      expect(data.keyClauses).toHaveLength(1);
      expect(data.keyClauses[0].title).toBe("1. Term and Termination");
      expect(data.keyClauses[0].importanceReason).toContain("duration");

      // 3. Findings Summary
      expect(data.findingsSummary.attentionItems).toHaveLength(1);
      expect(data.findingsSummary.ambiguitiesAndInconsistencies).toHaveLength(2);
      expect(data.findingsSummary.missingProvisions).toHaveLength(1);
      expect(data.findingsSummary.obligationsAndTerms).toHaveLength(1);
      expect(data.findingsSummary.totalFindingsCount).toBe(5);

      // 4. Open Actions & Completed Count
      expect(data.openActions).toHaveLength(1);
      expect(data.openActions[0].id).toBe("act-1");
      expect(data.completedActionsCount).toBe(1);

      // 5. User Questions from Q&A
      expect(data.userQuestions).toHaveLength(2);
      expect(data.userQuestions[0].question).toBe("Can they terminate without cause?");

      // 6. Clarification Questions
      expect(data.clarificationQuestions.length).toBeGreaterThan(0);
    });

    it("handles sparse documents cleanly without throwing", async () => {
      const { getDocumentWorkspaceData } = await import("@/lib/services/document-service");
      const { getPersistedDocumentFindings } = await import("@/lib/services/intelligence-service");
      const { listActionsByUser } = await import("@/lib/services/action-service");
      const { getUserQuestionsForDocument } = await import("@/lib/services/conversation-service");

      vi.mocked(getDocumentWorkspaceData).mockResolvedValueOnce({
        document: {
          id: VALID_DOC_ID,
          filename: "empty.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 100,
          documentType: null,
          status: "ready",
          pageCount: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          errorMessage: null,
          governingLaw: null,
          jurisdiction: null,
          parties: null,
          metadata: null,
        },
        sections: [],
      });
      vi.mocked(getPersistedDocumentFindings).mockResolvedValueOnce([]);
      vi.mocked(listActionsByUser).mockResolvedValueOnce([]);
      vi.mocked(getUserQuestionsForDocument).mockResolvedValueOnce([]);

      const data = await getProfessionalPrepData(VALID_DOC_ID, USER_ID);

      expect(data.document.filename).toBe("empty.pdf");
      expect(data.keyClauses).toHaveLength(0);
      expect(data.findingsSummary.totalFindingsCount).toBe(0);
      expect(data.openActions).toHaveLength(0);
      expect(data.completedActionsCount).toBe(0);
      expect(data.userQuestions).toHaveLength(0);
      expect(data.clarificationQuestions).toHaveLength(0);
    });
  });

  describe("Markdown Briefing Formatter", () => {
    it("generates structured markdown with disclaimers, sections, and excerpts", async () => {
      const data = await getProfessionalPrepData(VALID_DOC_ID, USER_ID);
      const markdown = formatBriefingAsMarkdown(data);

      // Header & Disclaimer
      expect(markdown).toContain("# Legal Consultation Briefing: test-nda.pdf");
      expect(markdown).toContain("> **NOTICE**:");
      expect(markdown).toContain("does not constitute legal advice");

      // Document Profile
      expect(markdown).toContain("## 1. Document Overview");
      expect(markdown).toContain("Acme Corp (Disclosing Party)");
      expect(markdown).toContain("State of Delaware");

      // Key Clauses
      expect(markdown).toContain("## 2. Key Clauses & Important Sections");
      expect(markdown).toContain("1. Term and Termination");

      // Findings & Ambiguities
      expect(markdown).toContain("## 3. Items Requiring Special Attention");
      expect(markdown).toContain("Immediate Termination Risk");
      expect(markdown).toContain("## 4. Potential Ambiguities & Absent Provisions");
      expect(markdown).toContain("Missing Governing Law Provision");

      // Actions
      expect(markdown).toContain("## 5. Open Review Checklist Items");
      expect(markdown).toContain("Clarify termination notice with counsel");

      // Counsel Questions
      expect(markdown).toContain("## 6. Suggested Questions for Counsel");

      // User Inquiries
      expect(markdown).toContain("## 7. Inquiries Explored During Review");
      expect(markdown).toContain("Can they terminate without cause?");

      // Footer disclaimer
      expect(markdown).toContain("not a substitute for professional legal advice");
    });
  });
});

