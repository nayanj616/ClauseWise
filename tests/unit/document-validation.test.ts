/**
 * Unit Tests — Document Validation and Sanitization
 *
 * Tests:
 * - Valid PDF files
 * - Valid DOCX files (inspecting ZIP / OOXML structure)
 * - Invalid MIME types rejected
 * - Invalid extensions rejected
 * - Invalid/malformed file signatures rejected
 * - Files exceeding 10 MB rejected
 * - Empty files (0 bytes) rejected
 * - Filename sanitization (path traversal, control characters, double extensions)
 * - Server-controlled storage path generation and path confinement
 */

import { describe, it, expect } from "vitest";
import {
  validateDocumentUpload,
  sanitizeFilename,
  generateStoragePath,
  inspectPdf,
  inspectDocxZip,
  DocumentValidationError,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/validation/document-validation";

// ---------------------------------------------------------------------------
// Helpers to build valid and invalid test buffers
// ---------------------------------------------------------------------------

function createValidPdfBuffer(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
  );
}

function createZipBuffer(entries: { name: string; content?: string }[]): Buffer {
  const parts: Buffer[] = [];
  const cdEntries: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const dataBuf = Buffer.from(entry.content || "", "utf8");

    // Local file header (30 bytes + nameBuf.length + dataBuf.length)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(0, 8); // compression = store
    lfh.writeUInt16LE(0, 10); // mod time
    lfh.writeUInt16LE(0, 12); // mod date
    lfh.writeUInt32LE(0, 14); // crc32 (placeholder)
    lfh.writeUInt32LE(dataBuf.length, 18); // compressed size
    lfh.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    lfh.writeUInt16LE(nameBuf.length, 26); // filename length
    lfh.writeUInt16LE(0, 28); // extra field length

    parts.push(lfh, nameBuf, dataBuf);

    // Central directory file header (46 bytes + nameBuf.length)
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(0, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(0, 16);
    cdh.writeUInt32LE(dataBuf.length, 20);
    cdh.writeUInt32LE(dataBuf.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42); // offset of local header

    cdEntries.push(cdh, nameBuf);

    offset += 30 + nameBuf.length + dataBuf.length;
  }

  const cdStart = offset;
  const cdSize = cdEntries.reduce((acc, b) => acc + b.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4); // disk num
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12); // cd size
  eocd.writeUInt32LE(cdStart, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...parts, ...cdEntries, eocd]);
}

function createValidDocxBuffer(): Buffer {
  return createZipBuffer([
    { name: "[Content_Types].xml", content: "<Types></Types>" },
    { name: "word/document.xml", content: "<w:document></w:document>" },
  ]);
}

function createMockFile(
  name: string,
  type: string,
  buffer: Buffer
): { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> } {
  return {
    name,
    type,
    size: buffer.length,
    arrayBuffer: async () =>
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer,
  };
}

const TEST_USER_ID = "11111111-1111-4111-a111-111111111111";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("inspectPdf", () => {
  it("accepts a valid PDF with %PDF- header and %%EOF marker", () => {
    const buffer = createValidPdfBuffer();
    const result = inspectPdf(buffer);
    expect(result.isValid).toBe(true);
  });

  it("rejects buffer smaller than 32 bytes", () => {
    const buffer = Buffer.from("%PDF-1.4");
    const result = inspectPdf(buffer);
    expect(result.isValid).toBe(false);
  });

  it("rejects buffer without %PDF- header", () => {
    const buffer = Buffer.from("NOT_A_PDF_HEADER_AT_ALL_SOMETHING_ELSE_HERE_%%EOF");
    const result = inspectPdf(buffer);
    expect(result.isValid).toBe(false);
  });

  it("rejects buffer without %%EOF marker", () => {
    const buffer = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<<>>\nendobj\nno trailer or end marker"
    );
    const result = inspectPdf(buffer);
    expect(result.isValid).toBe(false);
  });
});

describe("inspectDocxZip", () => {
  it("accepts a valid DOCX with [Content_Types].xml and word/ parts", () => {
    const buffer = createValidDocxBuffer();
    const result = inspectDocxZip(buffer);
    expect(result.isValid).toBe(true);
    expect(result.entries).toContain("[Content_Types].xml");
    expect(result.entries).toContain("word/document.xml");
  });

  it("rejects non-zip files", () => {
    const buffer = Buffer.from("plain text not a zip file header");
    const result = inspectDocxZip(buffer);
    expect(result.isValid).toBe(false);
  });

  it("rejects a generic ZIP file that has PK\\x03\\x04 but lacks [Content_Types].xml", () => {
    const buffer = createZipBuffer([
      { name: "random.txt", content: "hello world" },
    ]);
    const result = inspectDocxZip(buffer);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("[Content_Types].xml");
  });

  it("rejects an OOXML package that has [Content_Types].xml but lacks word/ (e.g. .xlsx)", () => {
    const buffer = createZipBuffer([
      { name: "[Content_Types].xml", content: "<Types/>" },
      { name: "xl/workbook.xml", content: "<workbook/>" },
    ]);
    const result = inspectDocxZip(buffer);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("word/");
  });
});

describe("sanitizeFilename", () => {
  it("preserves safe filenames and verified extension", () => {
    expect(sanitizeFilename("Contract-2024.pdf", ".pdf")).toBe(
      "Contract-2024.pdf"
    );
  });

  it("strips path traversal sequences (../ and ..\\)", () => {
    expect(sanitizeFilename("../../secret.pdf", ".pdf")).toBe("secret.pdf");
    expect(sanitizeFilename("..\\..\\windows\\system32\\calc.pdf", ".pdf")).toBe(
      "calc.pdf"
    );
  });

  it("strips null bytes and control characters", () => {
    expect(sanitizeFilename("exploit\x00file.pdf", ".pdf")).toBe("exploitfile.pdf");
  });

  it("replaces special characters and prevents ambiguous double extensions", () => {
    expect(sanitizeFilename("malware.exe.pdf", ".pdf")).toBe("malware_exe.pdf");
    expect(sanitizeFilename("my contract (draft) #1!.docx", ".docx")).toBe(
      "my_contract_draft_1.docx"
    );
  });

  it("handles empty or dots-only stems safely", () => {
    expect(sanitizeFilename(".pdf", ".pdf")).toBe("document.pdf");
    expect(sanitizeFilename("...pdf", ".pdf")).toBe("document.pdf");
  });
});

describe("generateStoragePath", () => {
  it("generates a server-controlled path under user and document ID", () => {
    const docId = "22222222-2222-4222-a222-222222222222";
    const path = generateStoragePath(TEST_USER_ID, docId, "agreement.pdf");
    expect(path).toBe(`${TEST_USER_ID}/${docId}/agreement.pdf`);
  });

  it("rejects invalid UUIDs for user ID or document ID", () => {
    expect(() =>
      generateStoragePath("not-a-uuid", "22222222-2222-4222-a222-222222222222", "test.pdf")
    ).toThrow(DocumentValidationError);
  });

  it("rejects paths containing traversal characters", () => {
    const docId = "22222222-2222-4222-a222-222222222222";
    expect(() =>
      generateStoragePath(TEST_USER_ID, docId, "../escaped.pdf")
    ).toThrow(DocumentValidationError);
  });
});

describe("validateDocumentUpload", () => {
  it("passes for a valid PDF under 10 MB", async () => {
    const file = createMockFile(
      "nda_agreement.pdf",
      "application/pdf",
      createValidPdfBuffer()
    );

    const result = await validateDocumentUpload({
      file,
      userId: TEST_USER_ID,
    });

    expect(result.mimeType).toBe("application/pdf");
    expect(result.originalFilename).toBe("nda_agreement.pdf");
    expect(result.storagePath).toContain(TEST_USER_ID);
    expect(result.storagePath.endsWith("nda_agreement.pdf")).toBe(true);
    expect(result.fileSizeBytes).toBeGreaterThan(0);
  });

  it("passes for a valid DOCX under 10 MB", async () => {
    const file = createMockFile(
      "employment_contract.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      createValidDocxBuffer()
    );

    const result = await validateDocumentUpload({
      file,
      userId: TEST_USER_ID,
    });

    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(result.sanitizedFilename).toBe("employment_contract.docx");
    expect(result.storagePath).toContain(TEST_USER_ID);
  });

  it("rejects invalid MIME types", async () => {
    const file = createMockFile(
      "document.pdf",
      "application/octet-stream",
      createValidPdfBuffer()
    );

    await expect(
      validateDocumentUpload({ file, userId: TEST_USER_ID })
    ).rejects.toThrow(/Unsupported MIME type/);
  });

  it("rejects invalid extensions", async () => {
    const file = createMockFile(
      "script.exe",
      "application/pdf",
      createValidPdfBuffer()
    );

    await expect(
      validateDocumentUpload({ file, userId: TEST_USER_ID })
    ).rejects.toThrow(/Unsupported file extension/);
  });

  it("rejects MIME type and extension mismatch", async () => {
    const file = createMockFile(
      "document.pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      createValidDocxBuffer()
    );

    await expect(
      validateDocumentUpload({ file, userId: TEST_USER_ID })
    ).rejects.toThrow(/does not match MIME type/);
  });

  it("rejects malformed PDF signature (corrupt bytes)", async () => {
    const file = createMockFile(
      "fake.pdf",
      "application/pdf",
      Buffer.from("This is plain text with a .pdf extension")
    );

    await expect(
      validateDocumentUpload({ file, userId: TEST_USER_ID })
    ).rejects.toThrow(/Invalid or malformed PDF/);
  });

  it("rejects fake DOCX (plain zip missing OOXML Word parts)", async () => {
    const fakeZip = createZipBuffer([{ name: "test.txt", content: "data" }]);
    const file = createMockFile(
      "fake.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fakeZip
    );

    await expect(
      validateDocumentUpload({ file, userId: TEST_USER_ID })
    ).rejects.toThrow(/Invalid or malformed DOCX/);
  });

  it("rejects files larger than 10 MB", async () => {
    const largeBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
    largeBuffer.write("%PDF-1.4", 0);
    largeBuffer.write("%%EOF", largeBuffer.length - 10);

    const file = createMockFile(
      "large.pdf",
      "application/pdf",
      largeBuffer
    );

    await expect(
      validateDocumentUpload({ file, userId: TEST_USER_ID })
    ).rejects.toThrow(/exceeds the maximum limit of 10 MB/);
  });

  it("rejects empty files (0 bytes)", async () => {
    const file = createMockFile("empty.pdf", "application/pdf", Buffer.alloc(0));

    await expect(
      validateDocumentUpload({ file, userId: TEST_USER_ID })
    ).rejects.toThrow(/empty/);
  });
});
