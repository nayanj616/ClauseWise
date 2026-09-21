import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  analyzeDocumentIntelligence,
  IntelligenceDocumentNotFoundError,
  IntelligenceValidationError,
  OpenAiInferenceError,
} from "@/lib/services/intelligence-service";
import { openaiClient } from "@/lib/ai/openai-client";
import { db } from "@/lib/db";
import { formatSectionsForIntelligence } from "@/lib/intelligence/prompts";

// Mock database
vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn(),
    },
  };
});

// Mock OpenAI client
vi.mock("@/lib/ai/openai-client", () => {
  const mockParse = vi.fn();
  return {
    openaiClient: {
      beta: {
        chat: {
          completions: {
            parse: mockParse,
          },
        },
      },
    },
    generateStructuredOutput: vi.fn(async (options: any) => {
      const completion = await mockParse(options);
      const choice = completion?.choices?.[0];
      if (!choice) {
        throw new Error("OpenAI returned an empty choices array.");
      }
      if (choice.message?.refusal) {
        throw new Error(
          `OpenAI refused to analyze the document: ${choice.message.refusal}`
        );
      }
      if (!choice.message?.parsed) {
        throw new Error(
          "OpenAI completed without a valid parsed intelligence structure."
        );
      }
      return choice.message.parsed;
    }),
    MODELS: {
      CHAT: "gpt-4o",
    },
    TEMPERATURES: {
      ANALYSIS: 0.1,
    },
    AI_LIMITS: {
      MAX_COMPLETION_TOKENS: 4096,
      DEFAULT_TIMEOUT_MS: 60000,
      MAX_RETRIES: 2,
    },
  };
});

describe("Intelligence Domain Service — Phase 3", () => {
  const mockDocId = "11111111-1111-4111-a111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws IntelligenceDocumentNotFoundError if document does not exist", async () => {
    // Mock db.select().from().where().limit() -> []
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await expect(analyzeDocumentIntelligence(mockDocId)).rejects.toThrow(
      IntelligenceDocumentNotFoundError
    );
  });

  it("throws IntelligenceValidationError if document has no extracted sections", async () => {
    // 1. Doc found
    const mockDoc = {
      id: mockDocId,
      originalFilename: "Contract.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
    };

    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockDoc]),
        }),
      }),
    });

    // 2. Sections query -> []
    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await expect(analyzeDocumentIntelligence(mockDocId)).rejects.toThrow(
      IntelligenceValidationError
    );
  });

  it("successfully orchestrates OpenAI call, evidence validation, and returns validated result", async () => {
    const mockDoc = {
      id: mockDocId,
      originalFilename: "NDA.pdf",
      mimeType: "application/pdf",
      pageCount: 2,
    };

    const mockSections = [
      {
        id: "sec-0",
        orderIndex: 0,
        title: "Title",
        content: "MUTUAL NON-DISCLOSURE AGREEMENT by and between Acme Corp and Beta LLC.",
        pageStart: 1,
        pageEnd: 1,
      },
      {
        id: "sec-1",
        orderIndex: 1,
        title: "Obligations",
        content: "Both parties agree to hold confidential information in strict confidence for 2 years.",
        pageStart: 2,
        pageEnd: 2,
      },
    ];

    const mockChunks = [
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
    ];

    // DB mocks
    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockDoc]),
        }),
      }),
    });

    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockSections),
        }),
      }),
    });

    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockChunks),
        }),
      }),
    });

    // OpenAI mock
    const mockAiParsed = {
      classification: {
        documentType: "nda",
        isStatedInText: true,
        sourceText: "MUTUAL NON-DISCLOSURE AGREEMENT",
        sectionOrderIndex: 0,
        inferenceReason: null,
      },
      parties: [
        {
          name: "Acme Corp",
          role: "Party",
          sourceText: "between Acme Corp and Beta LLC",
          sectionOrderIndex: 0,
        },
      ],
      governingLaw: null,
      jurisdiction: null,
      executiveSummary: "A mutual NDA between Acme Corp and Beta LLC.",
      importantSections: [
        {
          sectionOrderIndex: 1,
          title: "Obligations",
          reason: "Defines confidentiality terms.",
        },
      ],
      findings: [
        {
          findingType: "obligation",
          importance: "needs_attention",
          label: "2-Year Confidentiality Term",
          summary: "Both parties must hold information for 2 years.",
          sourceText: "hold confidential information in strict confidence for 2 years",
          sectionOrderIndex: 1,
          metadata: null,
        },
      ],
    };

    (openaiClient.beta.chat.completions.parse as any).mockResolvedValueOnce({
      choices: [
        {
          message: {
            parsed: mockAiParsed,
            refusal: null,
          },
        },
      ],
    });

    const result = await analyzeDocumentIntelligence(mockDocId);

    expect(result.documentId).toBe(mockDocId);
    expect(result.classification.documentType).toBe("nda");
    expect(result.parties).toHaveLength(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].sectionId).toBe("sec-1");
    expect(result.findings[0].chunkId).toBe("chk-1");
  });

  it("throws OpenAiInferenceError when OpenAI API encounters an error or refusal", async () => {
    const mockDoc = {
      id: mockDocId,
      originalFilename: "Contract.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
    };
    const mockSections = [
      {
        id: "sec-0",
        orderIndex: 0,
        title: "Title",
        content: "Sample text content that is substantive.",
        pageStart: 1,
        pageEnd: 1,
      },
    ];

    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockDoc]),
        }),
      }),
    });

    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockSections),
        }),
      }),
    });

    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    (openaiClient.beta.chat.completions.parse as any).mockRejectedValueOnce(
      new Error("Rate limit exceeded 429")
    );

    await expect(analyzeDocumentIntelligence(mockDocId)).rejects.toThrow(
      OpenAiInferenceError
    );
  });

  it("enforces Material Failure Guard: fails if 100% of candidate findings are rejected on substantive document", async () => {
    const mockDoc = {
      id: mockDocId,
      originalFilename: "Contract.pdf",
      mimeType: "application/pdf",
      pageCount: 3,
    };

    // Substantive document with >500 chars and 2 sections
    const mockSections = [
      {
        id: "sec-0",
        orderIndex: 0,
        title: "Section 1",
        content: "A".repeat(400),
        pageStart: 1,
        pageEnd: 1,
      },
      {
        id: "sec-1",
        orderIndex: 1,
        title: "Section 2",
        content: "B".repeat(400),
        pageStart: 2,
        pageEnd: 2,
      },
    ];

    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockDoc]),
        }),
      }),
    });

    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockSections),
        }),
      }),
    });

    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Model returns findings with hallucinated sourceText not in sections
    const mockAiParsed = {
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
          findingType: "obligation",
          importance: "important",
          label: "Hallucinated Finding",
          summary: "Unsubstantiated text.",
          sourceText: "This text does not exist anywhere in A or B.",
          sectionOrderIndex: 0,
          metadata: null,
        },
      ],
    };

    (openaiClient.beta.chat.completions.parse as any).mockResolvedValueOnce({
      choices: [
        {
          message: {
            parsed: mockAiParsed,
            refusal: null,
          },
        },
      ],
    });

    // All findings rejected -> Material Failure Guard triggers!
    await expect(analyzeDocumentIntelligence(mockDocId)).rejects.toThrow(
      IntelligenceValidationError
    );
  });

  it("deterministically bounds oversized documents to 240,000 characters with telemetry", () => {
    // Create 30 sections with 15,000 chars each = 450,000 chars (> 240,000)
    const largeSections = Array.from({ length: 30 }, (_, i) => ({
      id: `sec-${i}`,
      orderIndex: i,
      title: `Section ${i}`,
      content: `Section ${i} Content: `.padEnd(15000, "x"),
      pageStart: i + 1,
      pageEnd: i + 1,
    }));

    const { formattedText, inputBounding } = formatSectionsForIntelligence(largeSections);

    expect(inputBounding).toBeDefined();
    expect(inputBounding?.wasBounded).toBe(true);
    expect(inputBounding?.totalSections).toBe(30);
    expect(inputBounding?.includedSections).toBeLessThan(30);

    // Verify preamble/first section and closing/last section are preserved
    expect(formattedText).toContain('Section 0: "Section 0"');
    expect(formattedText).toContain('Section 29: "Section 29"');
  });
});

