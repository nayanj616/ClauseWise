/**
 * PDF Text Extractor — ClauseWise
 *
 * Extracts structured text from PDF documents using unpdf.
 * Preserves native page boundaries without fabricating coordinates.
 * Validates PDF signature (%PDF- and %%EOF) before attempting extraction.
 */

import { extractText } from "unpdf";
import type { ExtractedPage } from "../types";
import {
  EmptyContentError,
  ExtractionFailedError,
  MalformedDocumentError,
} from "../errors";

/**
 * Quick inspection to ensure buffer matches PDF signature.
 */
export function inspectPdfSignature(buffer: Buffer | Uint8Array): {
  isValid: boolean;
  reason?: string;
} {
  if (buffer.length < 32) {
    return { isValid: false, reason: "File too small to be a valid PDF (< 32 bytes)" };
  }

  // Check magic bytes: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  const isPdfHeader =
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d;

  if (!isPdfHeader) {
    return { isValid: false, reason: "Missing %PDF- magic header" };
  }

  // Search for %%EOF in the last 2048 bytes
  const tailStart = Math.max(0, buffer.length - 2048);
  const tailBytes = buffer instanceof Buffer ? buffer.subarray(tailStart) : Buffer.from(buffer).subarray(tailStart);
  const tailString = tailBytes.toString("latin1");

  if (!tailString.includes("%%EOF")) {
    return { isValid: false, reason: "Missing %%EOF marker in file trailer" };
  }

  return { isValid: true };
}

export interface PdfExtractionResult {
  text: string;
  pages: ExtractedPage[];
  pageCount: number;
}

/**
 * Extracts page-by-page text from a PDF buffer.
 *
 * @throws {MalformedDocumentError} If the buffer is not a valid PDF or has corrupted objects.
 * @throws {EmptyContentError} If the PDF contains no readable text.
 * @throws {ExtractionFailedError} If extraction fails unexpectedly.
 */
export async function extractPdf(
  buffer: Buffer | Uint8Array
): Promise<PdfExtractionResult> {
  const sigCheck = inspectPdfSignature(buffer);
  if (!sigCheck.isValid) {
    throw new MalformedDocumentError(
      sigCheck.reason ?? "Invalid PDF signature"
    );
  }

  // unpdf strictly requires a pure Uint8Array (not a Node Buffer subclass)
  const uint8 = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );

  let result: { totalPages: number; text: string | string[]; info?: Record<string, unknown> };
  try {
    result = await extractText(uint8, { mergePages: false });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    if (
      errMessage.toLowerCase().includes("password") ||
      errMessage.toLowerCase().includes("encrypted")
    ) {
      throw new MalformedDocumentError("Document is encrypted or password-protected", {
        cause: error,
      });
    }
    if (
      errMessage.toLowerCase().includes("invalid") ||
      errMessage.toLowerCase().includes("format") ||
      errMessage.toLowerCase().includes("corrupt")
    ) {
      throw new MalformedDocumentError(`PDF parsing failed: ${errMessage}`, {
        cause: error,
      });
    }
    throw new ExtractionFailedError(`Failed to extract text from PDF: ${errMessage}`, {
      cause: error,
    });
  }

  const rawPages = Array.isArray(result.text) ? result.text : [result.text];
  const pages: ExtractedPage[] = [];

  for (let i = 0; i < rawPages.length; i++) {
    const pageText = (rawPages[i] || "").trim();
    pages.push({
      pageNumber: i + 1,
      text: pageText,
    });
  }

  // Join all page texts into full document text
  const fullText = pages
    .map((p) => p.text)
    .filter((t) => t.length > 0)
    .join("\n\n");

  if (!fullText.trim()) {
    throw new EmptyContentError();
  }

  return {
    text: fullText,
    pages,
    pageCount: pages.length,
  };
}
