/**
 * DOCX Text Extractor — ClauseWise
 *
 * Extracts structured text from DOCX (OOXML) documents using mammoth.
 * Preserves paragraph order without fabricating artificial page numbers.
 * Validates OOXML ZIP archive structure ([Content_Types].xml and word/ parts)
 * before attempting extraction.
 */

import mammoth from "mammoth";
import {
  EmptyContentError,
  ExtractionFailedError,
  MalformedDocumentError,
} from "../errors";

/**
 * Inspects a buffer to verify DOCX OOXML structure (ZIP with [Content_Types].xml and word/ part).
 */
export function inspectDocxStructure(buffer: Buffer): {
  isValid: boolean;
  reason?: string;
} {
  if (buffer.length < 30) {
    return { isValid: false, reason: "File too small to be a valid DOCX (< 30 bytes)" };
  }

  // Check ZIP Local File Header magic bytes: PK\x03\x04
  if (
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return {
      isValid: false,
      reason: "Missing ZIP local file header magic bytes (PK\\x03\\x04)",
    };
  }

  const entries = new Set<string>();

  // Scan through buffer for Local File Headers (PK\x03\x04) and Central Directory Headers (PK\x01\x02)
  for (let i = 0; i <= buffer.length - 30; i++) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b) {
      // Local File Header
      if (buffer[i + 2] === 0x03 && buffer[i + 3] === 0x04) {
        if (i + 30 <= buffer.length) {
          const fileNameLen = buffer.readUInt16LE(i + 26);
          const nameStart = i + 30;
          if (nameStart + fileNameLen <= buffer.length) {
            const name = buffer.toString("utf8", nameStart, nameStart + fileNameLen);
            entries.add(name);
          }
        }
      }
      // Central Directory Header
      else if (buffer[i + 2] === 0x01 && buffer[i + 3] === 0x02) {
        if (i + 46 <= buffer.length) {
          const fileNameLen = buffer.readUInt16LE(i + 28);
          const nameStart = i + 46;
          if (nameStart + fileNameLen <= buffer.length) {
            const name = buffer.toString("utf8", nameStart, nameStart + fileNameLen);
            entries.add(name);
          }
        }
      }
    }
  }

  const entryList = Array.from(entries);
  const hasContentTypes = entryList.some(
    (e) =>
      e === "[Content_Types].xml" ||
      e.toLowerCase() === "[content_types].xml"
  );
  const hasWordPart = entryList.some(
    (e) =>
      e.startsWith("word/") ||
      e.startsWith("word\\") ||
      e.toLowerCase().startsWith("word/")
  );

  if (!hasContentTypes) {
    return {
      isValid: false,
      reason: "Missing [Content_Types].xml in OOXML package",
    };
  }

  if (!hasWordPart) {
    return {
      isValid: false,
      reason: "Missing word/ directory or document part in OOXML package",
    };
  }

  return { isValid: true };
}

export interface DocxExtractionResult {
  text: string;
}

/**
 * Extracts raw text from a DOCX buffer, preserving paragraphs in order.
 *
 * @throws {MalformedDocumentError} If the buffer is not a valid DOCX or corrupt OOXML archive.
 * @throws {EmptyContentError} If the DOCX contains no readable text.
 * @throws {ExtractionFailedError} If extraction encounters an unexpected error.
 */
export async function extractDocx(
  buffer: Buffer | Uint8Array
): Promise<DocxExtractionResult> {
  const nodeBuffer = buffer instanceof Buffer ? buffer : Buffer.from(buffer);

  const structureCheck = inspectDocxStructure(nodeBuffer);
  if (!structureCheck.isValid) {
    throw new MalformedDocumentError(
      structureCheck.reason ?? "Invalid DOCX structure"
    );
  }

  let result: { value: string; messages: unknown[] };
  try {
    result = await mammoth.extractRawText({ buffer: nodeBuffer });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    if (
      errMessage.includes("corrupt") ||
      errMessage.includes("invalid") ||
      errMessage.includes("zip") ||
      errMessage.includes("xml")
    ) {
      throw new MalformedDocumentError(`Failed to parse DOCX: ${errMessage}`, {
        cause: error,
      });
    }
    throw new ExtractionFailedError(`Failed to extract text from DOCX: ${errMessage}`, {
      cause: error,
    });
  }

  const text = (result.value || "").trim();
  if (!text) {
    throw new EmptyContentError();
  }

  return {
    text,
  };
}

