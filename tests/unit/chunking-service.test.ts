/**
 * Unit Tests — Chunking Domain Service (Phase 2, Slice 2.4)
 *
 * Tests:
 * 1. Chunk boundary & size rules:
 *    - Short section (<= maxChunkChars) produces exactly 1 chunk
 *    - Long multi-paragraph section splits at paragraph boundaries
 *    - Long single paragraph splits at sentence boundaries without splitting words
 *    - Long sentence splits at word boundaries without cutting words
 *    - Pathological long unbroken string splits without character loss
 *    - Custom maxChunkChars configuration is respected
 *
 * 2. Text integrity & preservation:
 *    - No substantive extracted text is lost or rewritten
 *    - Boundary whitespace is normalized cleanly
 *    - Concatenating normalized chunk content preserves all meaningful words
 *    - Unicode content (accents, symbols, non-Latin scripts) is preserved
 *
 * 3. Empty & defensive handling:
 *    - Empty string returns 0 chunks
 *    - Whitespace-only content returns 0 chunks
 *
 * 4. Metadata & indexing:
 *    - Deterministic, zero-based global chunkIndex across multiple sections
 *    - Correct documentId and sectionId propagation
 *    - Format-agnostic page number propagation (section.pageStart ?? null)
 *    - Approximate tokenCount metadata (Math.ceil(length / 4))
 *    - Repeated execution produces identical output (determinism)
 */

import { describe, it, expect } from "vitest";
import {
  chunkSection,
  chunkSections,
  DEFAULT_MAX_CHUNK_CHARS,
  type ChunkInputSection,
} from "@/lib/services/chunking-service";

describe("Chunking Domain Service (Slice 2.4)", () => {
  const DOC_ID = "11111111-1111-4111-a111-111111111111";
  const SEC_ID = "22222222-2222-4222-a222-222222222222";

  function createSection(overrides?: Partial<ChunkInputSection>): ChunkInputSection {
    return {
      id: SEC_ID,
      documentId: DOC_ID,
      content: "This is standard legal contract content for testing.",
      orderIndex: 0,
      pageStart: 1,
      pageEnd: 1,
      ...overrides,
    };
  }

  // =========================================================================
  // 1. Chunk Boundary & Size Rules
  // =========================================================================
  describe("1. Chunk Boundary & Size Rules", () => {
    it("produces exactly one chunk when section content fits within maxChunkChars", () => {
      const section = createSection({
        content: "Short clause fits easily within standard limits.",
      });

      const chunks = chunkSection(section, 0);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[0].content).toBe("Short clause fits easily within standard limits.");
      expect(chunks[0].characterCount).toBe(chunks[0].content.length);
      expect(chunks[0].sectionId).toBe(SEC_ID);
      expect(chunks[0].documentId).toBe(DOC_ID);
    });

    it("splits long multi-paragraph section at paragraph boundaries", () => {
      const p1 = "Paragraph 1: The recipient agrees to maintain strict confidentiality of all proprietary data.".repeat(3); // ~285 chars
      const p2 = "Paragraph 2: The receiving party shall restrict access to employees on a strict need-to-know basis.".repeat(3); // ~297 chars
      const p3 = "Paragraph 3: All confidential documents shall be returned or destroyed within thirty days of notice.".repeat(3); // ~303 chars

      const section = createSection({
        content: `${p1}\n\n${p2}\n\n${p3}`,
      });

      // Set maxChunkChars to ~400 so each paragraph becomes its own chunk
      const chunks = chunkSection(section, 0, { maxChunkChars: 400 });

      expect(chunks.length).toBeGreaterThanOrEqual(3);
      for (const chunk of chunks) {
        expect(chunk.characterCount).toBeLessThanOrEqual(400);
      }
      expect(chunks[0].content).toBe(p1);
      expect(chunks[1].content).toBe(p2);
      expect(chunks[2].content).toBe(p3);
    });

    it("splits a long single paragraph at sentence boundaries without splitting words", () => {
      const s1 = "This is the first sentence regarding indemnification obligations.";
      const s2 = "The indemnifying party shall defend and hold harmless the other party from all claims.";
      const s3 = "Any settlement requiring monetary payment shall require prior written consent.";
      const longPara = `${s1} ${s2} ${s3}`;

      const section = createSection({ content: longPara });

      // Max size large enough for s1 + s2 (~155 chars) but not s3
      const chunks = chunkSection(section, 0, { maxChunkChars: 160 });

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe(`${s1} ${s2}`);
      expect(chunks[1].content).toBe(s3);

      // Verify no words are split
      expect(chunks[0].content.endsWith(".")).toBe(true);
      expect(chunks[1].content.startsWith("Any")).toBe(true);
    });

    it("splits a long sentence at word boundaries without cutting words", () => {
      const words = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa"];
      const longSentence = words.join(" ") + ".";

      const section = createSection({ content: longSentence });
      const chunks = chunkSection(section, 0, { maxChunkChars: 30 });

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.characterCount).toBeLessThanOrEqual(30);
        // Verify chunk doesn't cut mid-word (no partial words from the list)
        const chunkWords = chunk.content.replace(".", "").split(" ");
        for (const w of chunkWords) {
          expect(words).toContain(w);
        }
      }
    });

    it("splits a pathological unbroken string exceeding maxChunkChars without dropping characters", () => {
      const unbrokenString = "A".repeat(250);
      const section = createSection({ content: unbrokenString });

      const chunks = chunkSection(section, 0, { maxChunkChars: 100 });

      expect(chunks).toHaveLength(3);
      expect(chunks[0].characterCount).toBe(100);
      expect(chunks[1].characterCount).toBe(100);
      expect(chunks[2].characterCount).toBe(50);

      // Verify all characters are preserved
      const reconstructed = chunks.map((c) => c.content).join("");
      expect(reconstructed).toBe(unbrokenString);
    });

    it("respects default DEFAULT_MAX_CHUNK_CHARS limit (1500 chars)", () => {
      expect(DEFAULT_MAX_CHUNK_CHARS).toBe(1500);

      const underLimit = "Word ".repeat(250); // ~1250 chars
      const section = createSection({ content: underLimit });
      const chunks = chunkSection(section, 0);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].characterCount).toBeLessThanOrEqual(DEFAULT_MAX_CHUNK_CHARS);
    });
  });

  // =========================================================================
  // 2. Text Integrity & Preservation
  // =========================================================================
  describe("2. Text Integrity & Preservation", () => {
    it("preserves all substantive extracted text across chunks", () => {
      const paragraph1 = "Article 1: Scope of Engagement and Deliverables under this Master Agreement.";
      const paragraph2 = "Article 2: Fees, Invoicing Schedules, and Reimbursable Out-of-Pocket Expenses.";
      const paragraph3 = "Article 3: Intellectual Property Assignment and Retained Proprietary Rights.";

      const originalText = `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}`;
      const section = createSection({ content: originalText });

      const chunks = chunkSection(section, 0, { maxChunkChars: 100 });

      // Verify that all substantive clauses appear intact
      const joined = chunks.map((c) => c.content).join("\n\n");
      expect(joined).toContain("Article 1: Scope of Engagement");
      expect(joined).toContain("Article 2: Fees, Invoicing Schedules");
      expect(joined).toContain("Article 3: Intellectual Property Assignment");
    });

    it("normalizes boundary whitespace without losing meaningful words", () => {
      const messyText = "   \n\n  Section 1.  Definitions of key terms.  \n\n\n\n  Section 2.  Obligations.   \n\n ";
      const section = createSection({ content: messyText });

      const chunks = chunkSection(section, 0);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toContain("Section 1.  Definitions of key terms.");
      expect(chunks[0].content).toContain("Section 2.  Obligations.");
      expect(chunks[0].content.startsWith("Section 1")).toBe(true);
      expect(chunks[0].content.endsWith("Obligations.")).toBe(true);
      expect(chunks[0].content).not.toMatch(/\n{3,}/);
    });

    it("preserves Unicode, legal symbols, currency, and multi-lingual characters", () => {
      const legalUnicodeText =
        "Accord de Confidentialité © 2026. Frais de résiliation: 50 000 € ou 45 000 £. Voir § 14.2(b). Соглашение о неразглашении. 商业秘密保护条款。";
      const section = createSection({ content: legalUnicodeText });

      const chunks = chunkSection(section, 0);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toContain("© 2026");
      expect(chunks[0].content).toContain("50 000 €");
      expect(chunks[0].content).toContain("45 000 £");
      expect(chunks[0].content).toContain("§ 14.2(b)");
      expect(chunks[0].content).toContain("Соглашение о неразглашении");
      expect(chunks[0].content).toContain("商业秘密保护条款");
    });
  });

  // =========================================================================
  // 3. Empty & Defensive Handling
  // =========================================================================
  describe("3. Empty & Defensive Handling", () => {
    it("returns an empty array for empty string content", () => {
      const section = createSection({ content: "" });
      const chunks = chunkSection(section, 0);
      expect(chunks).toEqual([]);
    });

    it("returns an empty array for whitespace-only content", () => {
      const section = createSection({ content: "   \n\t  \r\n  " });
      const chunks = chunkSection(section, 0);
      expect(chunks).toEqual([]);
    });
  });

  // =========================================================================
  // 4. Metadata & Indexing
  // =========================================================================
  describe("4. Metadata & Indexing", () => {
    it("assigns continuous zero-based global chunkIndex across multiple sections", () => {
      const sections: ChunkInputSection[] = [
        {
          id: "sec-1",
          documentId: DOC_ID,
          content: "Section 1 Para A\n\nSection 1 Para B",
          orderIndex: 0,
          pageStart: 1,
        },
        {
          id: "sec-2",
          documentId: DOC_ID,
          content: "Section 2 Single Para",
          orderIndex: 1,
          pageStart: 2,
        },
        {
          id: "sec-3",
          documentId: DOC_ID,
          content: "Section 3 Para X\n\nSection 3 Para Y",
          orderIndex: 2,
          pageStart: 3,
        },
      ];

      // Use maxChunkChars so multi-paragraph sections split into 2 chunks each
      const chunks = chunkSections(sections, { maxChunkChars: 25 });

      expect(chunks).toHaveLength(5); // 2 + 1 + 2 = 5
      expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2, 3, 4]);

      // Verify sectionId linkage
      expect(chunks[0].sectionId).toBe("sec-1");
      expect(chunks[1].sectionId).toBe("sec-1");
      expect(chunks[2].sectionId).toBe("sec-2");
      expect(chunks[3].sectionId).toBe("sec-3");
      expect(chunks[4].sectionId).toBe("sec-3");

      // Verify documentId linkage
      for (const chunk of chunks) {
        expect(chunk.documentId).toBe(DOC_ID);
      }
    });

    it("propagates pageNumber format-agnostically from section.pageStart", () => {
      // PDF section with pageStart: 5
      const pdfSection = createSection({
        pageStart: 5,
        pageEnd: 6,
      });
      const pdfChunks = chunkSection(pdfSection, 0);
      expect(pdfChunks[0].pageNumber).toBe(5);

      // DOCX/TXT section with null or undefined pageStart
      const docxSection = createSection({
        pageStart: null,
        pageEnd: null,
      });
      const docxChunks = chunkSection(docxSection, 0);
      expect(docxChunks[0].pageNumber).toBeNull();

      const txtSection = createSection({
        pageStart: undefined,
        pageEnd: undefined,
      });
      const txtChunks = chunkSection(txtSection, 0);
      expect(txtChunks[0].pageNumber).toBeNull();
    });

    it("calculates approximate tokenCount metadata (Math.ceil(length / 4))", () => {
      const text = "123456789012"; // 12 characters -> Math.ceil(12 / 4) = 3 tokens
      const section = createSection({ content: text });

      const chunks = chunkSection(section, 0);

      expect(chunks[0].characterCount).toBe(12);
      expect(chunks[0].tokenCount).toBe(3);
    });

    it("produces identical deterministic output across repeated executions", () => {
      const text =
        "The confidentiality obligations set forth in this Article 5 shall survive termination of this Agreement for a period of five (5) years.\n\nNotwithstanding the foregoing, trade secrets shall be held in confidence in perpetuity or until they become public knowledge through no fault of the recipient.";
      const section = createSection({ content: text });

      const run1 = chunkSection(section, 0, { maxChunkChars: 120 });
      const run2 = chunkSection(section, 0, { maxChunkChars: 120 });

      expect(run1).toEqual(run2);
    });
  });
});
