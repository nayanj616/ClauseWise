/**
 * Unit Tests — Document Extraction Infrastructure (Phase 2, Slice 2.1)
 *
 * Tests:
 * 1. Valid TXT extraction
 * 2. Valid DOCX extraction
 * 3. Valid PDF extraction
 * 4. Multi-page PDF extraction with page boundaries
 * 5. Unsupported format rejection
 * 6. Malformed input rejection
 * 7. Format conflict rejection (non-authoritative hints vs detectable structure)
 * 8. Empty document rejection
 * 9. Unicode text preservation
 * 10. Preservation of document text and reading order
 * 11. Section detection heuristics (numbered, explicit, roman, uppercase, preamble, fallback)
 * 12. Safe error messages (no stack traces or internals exposed)
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  extractDocumentText,
  resolveCandidateFormat,
  validateAndVerifyFormat,
} from "@/lib/services/extraction-service";
import {
  DocumentExtractionError,
  EmptyContentError,
  ExtractionErrorCode,
  MalformedDocumentError,
  UnreadableDocumentError,
  UnsupportedFormatError,
} from "@/lib/extraction/errors";
import { detectSections } from "@/lib/extraction/section-detector";

// ---------------------------------------------------------------------------
// Fixture Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a syntactically valid PDF buffer containing the specified pages of text.
 */
function createPdfBuffer(pages: string[]): Buffer {
  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];
  let objCount = 3; // 1: Catalog, 2: Pages, 3: Font

  const objects: string[] = [];
  objects.push("1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj");
  objects.push("3 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj");

  for (let i = 0; i < pages.length; i++) {
    const pageId = ++objCount;
    const contentId = ++objCount;
    pageObjIds.push(pageId);
    contentObjIds.push(contentId);

    const text = pages[i] || "";
    // Standard PDF text stream
    const escapedText = text.replace(/([()\\])/g, "\\$1");
    const stream = `BT\n/F1 12 Tf\n50 750 Td\n(${escapedText}) Tj\nET`;
    objects.push(
      `${contentId} 0 obj\n<</Length ${stream.length}>>\nstream\n${stream}\nendstream\nendobj`
    );
    objects.push(
      `${pageId} 0 obj\n<</Type /Page /Parent 2 0 R /Resources <</Font <</F1 3 0 R>>>> /MediaBox [0 0 612 792] /Contents ${contentId} 0 R>>\nendobj`
    );
  }

  const kids = pageObjIds.map((id) => `${id} 0 R`).join(" ");
  objects.splice(
    1,
    0,
    `2 0 obj\n<</Type /Pages /Kids [${kids}] /Count ${pages.length}>>\nendobj`
  );

  objects.sort((a, b) => {
    const idA = parseInt(a.split(" ")[0]!, 10);
    const idB = parseInt(b.split(" ")[0]!, 10);
    return idA - idB;
  });

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(body.length);
    body += `${obj}\n`;
  }

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    const offStr = String(offsets[i]).padStart(10, "0");
    body += `${offStr} 00000 n \n`;
  }
  body += `trailer\n<</Size ${objects.length + 1} /Root 1 0 R>>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, "latin1");
}

/**
 * Builds a syntactically valid DOCX buffer containing the specified paragraphs.
 */
async function createDocxBuffer(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    '  <Default Extension="xml" ContentType="application/xml"/>\n' +
    '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n' +
    "</Types>";

  const relsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n' +
    "</Relationships>";

  const paragraphsXml = paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t>${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</w:t></w:r></w:p>`
    )
    .join("\n");

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
    `  <w:body>\n${paragraphsXml}\n  </w:body>\n` +
    "</w:document>";

  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("_rels/.rels", relsXml);
  zip.file("word/document.xml", documentXml);

  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Builds a generic ZIP buffer that is NOT a DOCX document.
 */
async function createGenericZipBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("notes.txt", "This is just a regular archive with a text file.");
  return zip.generateAsync({ type: "nodebuffer" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Document Extraction Infrastructure (Slice 2.1)", () => {
  // =========================================================================
  // 1. Valid TXT Extraction
  // =========================================================================
  describe("1. Valid TXT extraction", () => {
    it("extracts text, sections, and metadata from a plain text document", async () => {
      const textContent =
        "CONFIDENTIALITY AGREEMENT\n\n" +
        "1. Definitions\nProprietary Information means all non-public data.\n\n" +
        "2. Obligations\nThe receiving party shall protect all confidential items.\n\n" +
        "3. Governing Law\nThis Agreement is governed by the laws of New York.";

      const buffer = Buffer.from(textContent, "utf8");

      const result = await extractDocumentText({
        buffer,
        filename: "nda.txt",
        mimeType: "text/plain",
      });

      expect(result.format).toBe("txt");
      expect(result.text).toContain("CONFIDENTIALITY AGREEMENT");
      expect(result.text).toContain("Proprietary Information means");

      // Critical constraint: true page boundaries do not exist for TXT -> do NOT fabricate
      expect(result.pages).toBeUndefined();
      expect(result.pageCount).toBeUndefined();

      // Section information
      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.sections.some((s) => s.title.includes("1. Definitions"))).toBe(true);

      // Metadata metrics
      expect(result.metadata.characterCount).toBe(result.text.length);
      expect(result.metadata.wordCount).toBeGreaterThan(15);
      expect(result.metadata.lineCount).toBeGreaterThan(5);
    });

    it("normalizes CRLF and CR line breaks into standard LF", async () => {
      const crlfText = "Section 1. Terms\r\nLine 1\r\nLine 2\r\nSection 2. End\r\nDone";
      const buffer = Buffer.from(crlfText, "utf8");

      const result = await extractDocumentText({ buffer, format: "txt" });
      expect(result.text).not.toContain("\r");
      expect(result.text).toContain("Section 1. Terms\nLine 1");
    });
  });

  // =========================================================================
  // 2. Valid DOCX Extraction
  // =========================================================================
  describe("2. Valid DOCX extraction", () => {
    it("extracts text preserving paragraph breaks and reading order", async () => {
      const paragraphs = [
        "EMPLOYMENT AGREEMENT",
        "Section 1: Position and Duties",
        "Employee shall serve as Senior Legal Counsel.",
        "Section 2: Compensation",
        "Base salary shall be paid semi-monthly.",
      ];

      const buffer = await createDocxBuffer(paragraphs);

      const result = await extractDocumentText({
        buffer,
        filename: "employment.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      expect(result.format).toBe("docx");
      expect(result.text).toContain("EMPLOYMENT AGREEMENT");
      expect(result.text).toContain("Senior Legal Counsel");

      // Critical constraint: DOCX does not fabricate page numbers
      expect(result.pages).toBeUndefined();
      expect(result.pageCount).toBeUndefined();

      // Reading order preservation
      const posA = result.text.indexOf("Position and Duties");
      const posB = result.text.indexOf("Compensation");
      expect(posA).toBeLessThan(posB);

      // Sections
      expect(result.sections.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 3. Valid PDF Extraction (Single Page)
  // =========================================================================
  describe("3. Valid single-page PDF extraction", () => {
    it("extracts text with page boundary and metadata from a 1-page PDF", async () => {
      const buffer = createPdfBuffer([
        "Section 1: Confidentiality Agreement. All secrets are protected.",
      ]);

      const result = await extractDocumentText({
        buffer,
        filename: "contract.pdf",
        mimeType: "application/pdf",
      });

      expect(result.format).toBe("pdf");
      expect(result.text).toContain("Section 1: Confidentiality Agreement");
      expect(result.pageCount).toBe(1);

      // Pages must be present for PDF
      expect(result.pages).toBeDefined();
      expect(result.pages?.length).toBe(1);
      expect(result.pages?.[0]?.pageNumber).toBe(1);
      expect(result.pages?.[0]?.text).toContain("Confidentiality Agreement");

      // Sections should map to pageStart = 1, pageEnd = 1
      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.sections[0]?.pageStart).toBe(1);
      expect(result.sections[0]?.pageEnd).toBe(1);
    });
  });

  // =========================================================================
  // 4. Multi-Page PDF Extraction
  // =========================================================================
  describe("4. Multi-page PDF extraction with page boundaries", () => {
    it("preserves exact page boundaries across a multi-page PDF", async () => {
      const page1Content = "Article I: Definitions\nClause 1.1 First term on page one.";
      const page2Content = "Article II: Term and Termination\nClause 2.1 This clause is on page two.";
      const page3Content = "Article III: Signatures\nSigned and delivered on page three.";

      const buffer = createPdfBuffer([page1Content, page2Content, page3Content]);

      const result = await extractDocumentText({
        buffer,
        format: "pdf",
      });

      expect(result.format).toBe("pdf");
      expect(result.pageCount).toBe(3);
      expect(result.pages).toHaveLength(3);

      expect(result.pages?.[0]?.pageNumber).toBe(1);
      expect(result.pages?.[0]?.text).toContain("Article I: Definitions");
      expect(result.pages?.[0]?.text).not.toContain("Article II");

      expect(result.pages?.[1]?.pageNumber).toBe(2);
      expect(result.pages?.[1]?.text).toContain("Article II: Term and Termination");
      expect(result.pages?.[1]?.text).not.toContain("Article III");

      expect(result.pages?.[2]?.pageNumber).toBe(3);
      expect(result.pages?.[2]?.text).toContain("Article III: Signatures");

      // Verify sections mapped to correct pages
      const sec1 = result.sections.find((s) => s.title.includes("Article I"));
      const sec2 = result.sections.find((s) => s.title.includes("Article II"));
      const sec3 = result.sections.find((s) => s.title.includes("Article III"));

      expect(sec1?.pageStart).toBe(1);
      expect(sec2?.pageStart).toBe(2);
      expect(sec3?.pageStart).toBe(3);
    });
  });

  // =========================================================================
  // 5. Unsupported Format Rejection
  // =========================================================================
  describe("5. Unsupported format rejection", () => {
    it("rejects unsupported extensions (.exe, .png, .zip)", async () => {
      const buffer = Buffer.from("arbitrary content");

      await expect(
        extractDocumentText({ buffer, filename: "payload.exe" })
      ).rejects.toThrow(UnsupportedFormatError);

      await expect(
        extractDocumentText({ buffer, filename: "photo.png" })
      ).rejects.toThrow(UnsupportedFormatError);

      await expect(
        extractDocumentText({ buffer, filename: "archive.zip" })
      ).rejects.toThrow(UnsupportedFormatError);
    });

    it("rejects unsupported MIME types", async () => {
      const buffer = Buffer.from("some content");

      await expect(
        extractDocumentText({
          buffer,
          mimeType: "application/x-msdownload",
        })
      ).rejects.toThrow(UnsupportedFormatError);

      await expect(
        extractDocumentText({
          buffer,
          mimeType: "image/jpeg",
        })
      ).rejects.toThrow(UnsupportedFormatError);
    });

    it("rejects unsupported explicit format strings", async () => {
      const buffer = Buffer.from("some text");
      // @ts-expect-error testing invalid runtime format
      await expect(extractDocumentText({ buffer, format: "rtf" })).rejects.toThrow(
        UnsupportedFormatError
      );
    });
  });

  // =========================================================================
  // 6. Malformed Input Rejection
  // =========================================================================
  describe("6. Malformed input rejection", () => {
    it("rejects corrupt PDF without %%EOF marker", async () => {
      const corruptPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\nTruncated stream without trailer"
      );

      await expect(
        extractDocumentText({ buffer: corruptPdf, format: "pdf" })
      ).rejects.toThrow(MalformedDocumentError);
    });

    it("rejects corrupt DOCX buffer (invalid zip)", async () => {
      const corruptDocx = Buffer.from("PK\x03\x04 corrupt zip payload not real ooxml");

      await expect(
        extractDocumentText({ buffer: corruptDocx, format: "docx" })
      ).rejects.toThrow(MalformedDocumentError);
    });

    it("rejects unreadable text with invalid character encoding", async () => {
      // High-byte sequence that is illegal in UTF-8
      const invalidUtf8 = Buffer.from([0xc0, 0xaf, 0xff, 0xfe]);

      await expect(
        extractDocumentText({ buffer: invalidUtf8, format: "txt" })
      ).rejects.toThrow(DocumentExtractionError);
    });
  });

  // =========================================================================
  // 7. Format Conflict Rejection (Explicit User Requirement)
  // =========================================================================
  describe("7. Format conflict rejection (detectable structure vs declared hints)", () => {
    it("rejects PDF buffer declared as TXT (or with .txt filename)", async () => {
      const realPdfBuffer = createPdfBuffer(["Real PDF text content"]);

      // Declared as .txt or text/plain
      await expect(
        extractDocumentText({
          buffer: realPdfBuffer,
          filename: "disguised.txt",
          mimeType: "text/plain",
        })
      ).rejects.toThrow(MalformedDocumentError);

      await expect(
        extractDocumentText({
          buffer: realPdfBuffer,
          format: "txt",
        })
      ).rejects.toThrow(/conflicts with actual file content/);
    });

    it("rejects DOCX ZIP buffer declared as PDF", async () => {
      const docxBuffer = await createDocxBuffer(["Real DOCX content"]);

      await expect(
        extractDocumentText({
          buffer: docxBuffer,
          filename: "disguised.pdf",
          mimeType: "application/pdf",
        })
      ).rejects.toThrow(MalformedDocumentError);
    });

    it("rejects plain text buffer declared as DOCX", async () => {
      const textBuffer = Buffer.from("Just plain text with a docx extension");

      await expect(
        extractDocumentText({
          buffer: textBuffer,
          filename: "fake.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      ).rejects.toThrow(MalformedDocumentError);
    });

    it("rejects arbitrary generic ZIP renamed as .docx", async () => {
      const genericZip = await createGenericZipBuffer();

      await expect(
        extractDocumentText({
          buffer: genericZip,
          filename: "archive.docx",
          format: "docx",
        })
      ).rejects.toThrow(MalformedDocumentError);
    });

    it("rejects Windows PE executable buffer (MZ) declared as TXT", async () => {
      const peBuffer = Buffer.from(
        "MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00PE binary payload"
      );

      await expect(
        extractDocumentText({
          buffer: peBuffer,
          filename: "malware.txt",
          mimeType: "text/plain",
        })
      ).rejects.toThrow(MalformedDocumentError);
    });

    it("rejects binary files containing null bytes declared as TXT", async () => {
      const binaryWithNulls = Buffer.from("Hello\x00World\x00Payload\x00\x00");

      await expect(
        extractDocumentText({
          buffer: binaryWithNulls,
          format: "txt",
        })
      ).rejects.toThrow(MalformedDocumentError);
    });
  });

  // =========================================================================
  // 8. Empty Document Rejection
  // =========================================================================
  describe("8. Empty document rejection", () => {
    it("rejects 0-byte buffer with EmptyContentError", async () => {
      const emptyBuffer = Buffer.alloc(0);

      await expect(
        extractDocumentText({ buffer: emptyBuffer, format: "txt" })
      ).rejects.toThrow(EmptyContentError);

      await expect(
        extractDocumentText({ buffer: emptyBuffer, format: "pdf" })
      ).rejects.toThrow(EmptyContentError);

      await expect(
        extractDocumentText({ buffer: emptyBuffer, format: "docx" })
      ).rejects.toThrow(EmptyContentError);
    });

    it("rejects whitespace-only TXT with EmptyContentError", async () => {
      const whitespaceBuffer = Buffer.from("   \n\n\t\t   \r\n   ");

      await expect(
        extractDocumentText({ buffer: whitespaceBuffer, format: "txt" })
      ).rejects.toThrow(EmptyContentError);
    });

    it("rejects blank PDF with EmptyContentError", async () => {
      const blankPdf = createPdfBuffer(["   "]);

      await expect(
        extractDocumentText({ buffer: blankPdf, format: "pdf" })
      ).rejects.toThrow(EmptyContentError);
    });
  });

  // =========================================================================
  // 9. Unicode Text Preservation
  // =========================================================================
  describe("9. Unicode text preservation", () => {
    const unicodeLegalText =
      "CONFIDENTIALITÉ ET PROPRIÉTÉ INTELLECTUELLE\n\n" +
      "1. Mentions Légales\n" +
      "Société Générale S.A. © 2026. Tous droits réservés ®.\n" +
      "Le montant payable est de 50 000 € ou 45 000 £.\n" +
      "Conformément à l'Article § 42(a) du Code de Commerce.\n" +
      "Соглашение о конфиденциальности и защите информации.";

    it("preserves Unicode legal symbols and foreign scripts in TXT (UTF-8)", async () => {
      const buffer = Buffer.from(unicodeLegalText, "utf8");

      const result = await extractDocumentText({ buffer, format: "txt" });

      expect(result.text).toContain("CONFIDENTIALITÉ ET PROPRIÉTÉ");
      expect(result.text).toContain("© 2026");
      expect(result.text).toContain("50 000 €");
      expect(result.text).toContain("45 000 £");
      expect(result.text).toContain("§ 42(a)");
      expect(result.text).toContain("Соглашение о конфиденциальности");
    });

    it("preserves Unicode in TXT with UTF-8 BOM", async () => {
      const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const content = Buffer.from("Clause 1. Special €500 fee applies.", "utf8");
      const buffer = Buffer.concat([utf8Bom, content]);

      const result = await extractDocumentText({ buffer, format: "txt" });
      expect(result.text).toContain("€500 fee applies");
      // BOM should be stripped from text content
      expect(result.text.charCodeAt(0)).not.toBe(0xfeff);
    });

    it("preserves Unicode in TXT with UTF-16LE BOM", async () => {
      const bom = Buffer.from([0xff, 0xfe]);
      const content = Buffer.from("Section 1: UTF-16 Legal Terms § 10.", "utf16le");
      const buffer = Buffer.concat([bom, content]);

      const result = await extractDocumentText({ buffer, format: "txt" });
      expect(result.text).toContain("UTF-16 Legal Terms § 10");
    });

    it("preserves Unicode in DOCX documents", async () => {
      const paragraphs = [
        "ACCORD DE CONFIDENTIALITÉ",
        "Section 1: Propriété",
        "Société ClauseWise SAS © 2026. Clause § 12.3: Montant total 100 000 €.",
      ];

      const buffer = await createDocxBuffer(paragraphs);
      const result = await extractDocumentText({ buffer, format: "docx" });

      expect(result.text).toContain("ACCORD DE CONFIDENTIALITÉ");
      expect(result.text).toContain("© 2026");
      expect(result.text).toContain("§ 12.3");
      expect(result.text).toContain("100 000 €");
    });
  });

  // =========================================================================
  // 10. Preservation of Document Text and Reading Order
  // =========================================================================
  describe("10. Preservation of document text and reading order", () => {
    it("preserves exact wording and sequential clause order across paragraphs", async () => {
      const paragraphs = [
        "1. DEFINITIONS",
        "Alpha means the first variable.",
        "2. COVENANTS",
        "Beta means the second variable.",
        "3. INDEMNIFICATION",
        "Gamma means the third variable.",
      ];

      const buffer = await createDocxBuffer(paragraphs);
      const result = await extractDocumentText({ buffer, format: "docx" });

      const idxAlpha = result.text.indexOf("Alpha means");
      const idxBeta = result.text.indexOf("Beta means");
      const idxGamma = result.text.indexOf("Gamma means");

      expect(idxAlpha).toBeGreaterThan(-1);
      expect(idxBeta).toBeGreaterThan(idxAlpha);
      expect(idxGamma).toBeGreaterThan(idxBeta);

      expect(result.sections).toHaveLength(3);
      expect(result.sections[0]?.title).toContain("1. DEFINITIONS");
      expect(result.sections[1]?.title).toContain("2. COVENANTS");
      expect(result.sections[2]?.title).toContain("3. INDEMNIFICATION");
    });
  });

  // =========================================================================
  // 11. Section Detection Heuristics
  // =========================================================================
  describe("11. Section detection heuristics", () => {
    it("extracts preamble before the first numbered heading", () => {
      const text =
        "This Non-Disclosure Agreement is made by and between Party A and Party B.\n\n" +
        "1. Definitions\nHere are the terms.\n\n" +
        "2. Obligations\nHere are the obligations.";

      const sections = detectSections(text);

      expect(sections).toHaveLength(3);
      expect(sections[0]?.orderIndex).toBe(0);
      expect(sections[0]?.title).toBe("Preamble");
      expect(sections[0]?.text).toContain("Party A and Party B");

      expect(sections[1]?.orderIndex).toBe(1);
      expect(sections[1]?.title).toBe("1. Definitions");

      expect(sections[2]?.orderIndex).toBe(2);
      expect(sections[2]?.title).toBe("2. Obligations");
    });

    it("detects explicit Section / Article / Clause labels", () => {
      const text =
        "Section 1: Scope of Work\nThe contractor shall provide services.\n\n" +
        "Article II. Term and Renewal\nAgreement automatically renews annually.\n\n" +
        "Clause 3.1. Termination for Cause\nImmediate notice required.";

      const sections = detectSections(text);

      expect(sections).toHaveLength(3);
      expect(sections[0]?.title).toBe("Section 1: Scope of Work");
      expect(sections[1]?.title).toBe("Article II. Term and Renewal");
      expect(sections[2]?.title).toBe("Clause 3.1. Termination for Cause");
    });

    it("detects Roman numeral headings", () => {
      const text =
        "I. Recitals\nWhereas the parties desire to collaborate.\n\n" +
        "II. Covenants\nThe parties agree as follows.\n\n" +
        "III. Miscellaneous\nStandard boilerplate provisions.";

      const sections = detectSections(text);

      expect(sections).toHaveLength(3);
      expect(sections[0]?.title).toBe("I. Recitals");
      expect(sections[1]?.title).toBe("II. Covenants");
      expect(sections[2]?.title).toBe("III. Miscellaneous");
    });

    it("detects standalone uppercase headings", () => {
      const text =
        "RECITALS\nThe parties enter into this agreement.\n\n" +
        "TERMS OF PAYMENT\nInvoices are payable net 30 days.\n\n" +
        "GOVERNING LAW\nLaws of England and Wales apply.";

      const sections = detectSections(text);

      expect(sections).toHaveLength(3);
      expect(sections[0]?.title).toBe("RECITALS");
      expect(sections[1]?.title).toBe("TERMS OF PAYMENT");
      expect(sections[2]?.title).toBe("GOVERNING LAW");
    });

    it("falls back to a single Document Content section when no headings exist (no invented semantics)", () => {
      const unformattedText =
        "This is a general paragraph describing an informal memorandum between two parties without any headings or numbered clauses.";

      const sections = detectSections(unformattedText);

      expect(sections).toHaveLength(1);
      expect(sections[0]?.orderIndex).toBe(0);
      expect(sections[0]?.title).toBe("Document Content");
      expect(sections[0]?.text).toBe(unformattedText);
    });
  });

  // =========================================================================
  // 12. Security and Error Safety
  // =========================================================================
  describe("12. Security and error safety", () => {
    it("provides safe userMessage without exposing stack traces or server paths", async () => {
      const peBuffer = Buffer.from("MZ\x90\x00fake pe executable");

      try {
        await extractDocumentText({ buffer: peBuffer, format: "txt" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DocumentExtractionError);
        const extractionErr = err as DocumentExtractionError;

        expect(extractionErr.code).toBe(ExtractionErrorCode.MALFORMED_FILE);
        expect(extractionErr.userMessage).toBeDefined();
        // userMessage must not leak internal paths or stack traces
        expect(extractionErr.userMessage).not.toContain("Error:");
        expect(extractionErr.userMessage).not.toContain("at ");
        expect(extractionErr.userMessage).not.toContain("node_modules");
        expect(extractionErr.userMessage).not.toContain("c:\\");
      }
    });

    it("throws when neither buffer nor file is provided", async () => {
      await expect(extractDocumentText({})).rejects.toThrow(
        /No buffer or file provided/
      );
    });
  });

  // =========================================================================
  // 13. Candidate Format Resolution
  // =========================================================================
  describe("13. Candidate format resolution", () => {
    it("resolves from explicit format option", () => {
      expect(resolveCandidateFormat({ format: "pdf" })).toBe("pdf");
      expect(resolveCandidateFormat({ format: "docx" })).toBe("docx");
      expect(resolveCandidateFormat({ format: "txt" })).toBe("txt");
    });

    it("resolves from MIME type", () => {
      expect(
        resolveCandidateFormat({ mimeType: "application/pdf" })
      ).toBe("pdf");
      expect(
        resolveCandidateFormat({
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      ).toBe("docx");
      expect(resolveCandidateFormat({ mimeType: "text/plain" })).toBe("txt");
    });

    it("resolves from filename extension", () => {
      expect(resolveCandidateFormat({ filename: "contract.pdf" })).toBe("pdf");
      expect(resolveCandidateFormat({ filename: "doc.docx" })).toBe("docx");
      expect(resolveCandidateFormat({ filename: "notes.txt" })).toBe("txt");
    });

    it("resolves from magic bytes when hints are absent", () => {
      const pdfBytes = Buffer.from("%PDF-1.4\nsomething\n%%EOF\n");
      expect(resolveCandidateFormat({}, pdfBytes)).toBe("pdf");

      const docxBytes = Buffer.from("PK\x03\x04something");
      expect(resolveCandidateFormat({}, docxBytes)).toBe("docx");

      const txtBytes = Buffer.from("Pure text content");
      expect(resolveCandidateFormat({}, txtBytes)).toBe("txt");
    });
  });
});

