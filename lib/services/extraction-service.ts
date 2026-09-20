/**
 * Document Extraction Domain Service — ClauseWise
 *
 * Implements the core extraction infrastructure for converting PDF, DOCX,
 * and TXT documents into factual, structured extraction results.
 *
 * Architecture principles:
 * - Evidence -> Meaning -> Action: factual extraction preserving original wording
 * - Non-authoritative metadata: hints (MIME, filename, format) are verified against
 *   actual file signatures and structure before extraction; conflicting inputs are rejected
 * - Page boundaries preserved where available (PDF); never fabricated for TXT or DOCX
 * - Paragraph and reading order preserved for DOCX and TXT
 * - Controlled errors: never expose internal stack traces or server details
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import type {
  DocumentExtractionResult,
  ExtractionInput,
  SupportedDocumentFormat,
} from "../extraction/types";
import {
  EmptyContentError,
  MalformedDocumentError,
  UnsupportedFormatError,
} from "../extraction/errors";
import { extractPdf, inspectPdfSignature } from "../extraction/extractors/pdf-extractor";
import { extractDocx, inspectDocxStructure } from "../extraction/extractors/docx-extractor";
import { extractTxt, inspectTxtContent } from "../extraction/extractors/txt-extractor";
import { detectSections } from "../extraction/section-detector";

const MIME_MAP: Record<string, SupportedDocumentFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

const EXTENSION_MAP: Record<string, SupportedDocumentFormat> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "txt",
};

/**
 * Extracts a normalized Buffer from the extraction input.
 */
async function resolveInputBuffer(input: ExtractionInput): Promise<Buffer> {
  if (input.buffer) {
    if (input.buffer instanceof Buffer) {
      return input.buffer;
    }
    if (input.buffer instanceof ArrayBuffer) {
      return Buffer.from(input.buffer);
    }
    return Buffer.from(input.buffer.buffer, input.buffer.byteOffset, input.buffer.byteLength);
  }

  if (input.file && typeof input.file.arrayBuffer === "function") {
    const arrayBuf = await input.file.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  throw new MalformedDocumentError("No buffer or file provided for document extraction");
}

/**
 * Derives the candidate document format from input metadata hints.
 * Priority: explicit format -> MIME type -> filename extension -> signature inference.
 */
export function resolveCandidateFormat(
  input: ExtractionInput,
  buffer?: Buffer
): SupportedDocumentFormat {
  // 1. Explicit format hint
  if (input.format) {
    const fmt = input.format.toLowerCase().trim();
    if (fmt === "pdf" || fmt === "docx" || fmt === "txt") {
      return fmt as SupportedDocumentFormat;
    }
    throw new UnsupportedFormatError(input.format);
  }

  // 2. MIME type hint
  if (input.mimeType) {
    const mime = input.mimeType.toLowerCase().trim();
    if (MIME_MAP[mime]) {
      return MIME_MAP[mime]!;
    }
    // If an unrecognized MIME type is provided without other matches, check filename before rejecting
  }

  // 3. Filename hint
  const rawFilename = input.filename || input.file?.name;
  if (rawFilename) {
    const dotIndex = rawFilename.lastIndexOf(".");
    if (dotIndex !== -1) {
      const ext = rawFilename.slice(dotIndex).toLowerCase();
      if (EXTENSION_MAP[ext]) {
        return EXTENSION_MAP[ext]!;
      }
      // If filename has an explicit extension that is unsupported (e.g. .exe, .png)
      throw new UnsupportedFormatError(ext);
    }
  }

  // If MIME was provided but unsupported, and no filename rescued it:
  if (input.mimeType && !MIME_MAP[input.mimeType.toLowerCase().trim()]) {
    throw new UnsupportedFormatError(input.mimeType);
  }

  // 4. Magic byte inspection fallback when no metadata hints are provided
  if (buffer && buffer.length > 0) {
    // Check PDF magic bytes (%PDF-)
    if (
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      return "pdf";
    }

    // Check ZIP magic bytes (PK\x03\x04)
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    ) {
      return "docx";
    }

    // Check if plain text
    const txtCheck = inspectTxtContent(buffer);
    if (txtCheck.isValid) {
      return "txt";
    }
  }

  throw new UnsupportedFormatError("Unable to determine document format from provided inputs");
}

/**
 * Validates that candidate format does NOT conflict with detectable file signatures.
 * Rejects inputs where declared format conflicts with actual file structure.
 *
 * @throws {MalformedDocumentError} If declared format contradicts actual file structure.
 */
export function validateAndVerifyFormat(
  buffer: Buffer,
  candidateFormat: SupportedDocumentFormat
): SupportedDocumentFormat {
  if (buffer.length === 0) {
    throw new EmptyContentError();
  }

  switch (candidateFormat) {
    case "pdf": {
      const check = inspectPdfSignature(buffer);
      if (!check.isValid) {
        throw new MalformedDocumentError(
          `Declared format 'pdf' conflicts with actual file content: ${check.reason ?? "Invalid signature"}`
        );
      }
      return "pdf";
    }

    case "docx": {
      const check = inspectDocxStructure(buffer);
      if (!check.isValid) {
        throw new MalformedDocumentError(
          `Declared format 'docx' conflicts with actual file content: ${check.reason ?? "Invalid OOXML structure"}`
        );
      }
      return "docx";
    }

    case "txt": {
      const check = inspectTxtContent(buffer);
      if (!check.isValid) {
        if (check.isConflict) {
          throw new MalformedDocumentError(
            `Declared format 'txt' conflicts with actual file content: ${check.reason ?? "Conflicting file signature"}`
          );
        }
        throw new MalformedDocumentError(
          `Declared format 'txt' is invalid: ${check.reason ?? "Unreadable content"}`
        );
      }
      return "txt";
    }

    default:
      throw new UnsupportedFormatError(candidateFormat);
  }
}

/**
 * Extracts structured text, pages, sections, and metadata from a document.
 *
 * Flow:
 * 1. Resolve buffer and candidate format from metadata hints.
 * 2. Validate signatures and reject conflicts between hints and actual structure.
 * 3. Invoke format-specific extractor (unpdf / mammoth / native).
 * 4. Run heuristic legal section detection with page coordinate mapping.
 * 5. Compute metadata metrics (character count, word count, line count).
 * 6. Return typed DocumentExtractionResult.
 *
 * @param input - The document extraction input (buffer/file with optional hints)
 * @returns Structured extraction result
 */
export async function extractDocumentText(
  input: ExtractionInput
): Promise<DocumentExtractionResult> {
  // 1. Resolve binary buffer
  const buffer = await resolveInputBuffer(input);

  if (buffer.length === 0) {
    throw new EmptyContentError();
  }

  // 2. Resolve candidate format from metadata hints
  const candidateFormat = resolveCandidateFormat(input, buffer);

  // 3. Verify format against detectable file signatures (reject conflicts)
  const verifiedFormat = validateAndVerifyFormat(buffer, candidateFormat);

  // 4. Dispatch to format extractor
  let extractedText: string;
  let pages: DocumentExtractionResult["pages"];
  let pageCount: number | undefined;

  switch (verifiedFormat) {
    case "pdf": {
      const pdfResult = await extractPdf(buffer);
      extractedText = pdfResult.text;
      pages = pdfResult.pages;
      pageCount = pdfResult.pageCount;
      break;
    }

    case "docx": {
      const docxResult = await extractDocx(buffer);
      extractedText = docxResult.text;
      // DOCX does not fabricate page numbers
      pages = undefined;
      pageCount = undefined;
      break;
    }

    case "txt": {
      const txtResult = await extractTxt(buffer);
      extractedText = txtResult.text;
      // TXT does not fabricate page numbers
      pages = undefined;
      pageCount = undefined;
      break;
    }
  }

  // 5. Ensure extracted content is non-empty
  if (!extractedText || !extractedText.trim()) {
    throw new EmptyContentError();
  }

  // 6. Detect sections with page coordinate mapping
  const sections = detectSections(extractedText, pages);

  // 7. Calculate metrics
  const characterCount = extractedText.length;
  const wordCount = extractedText.trim() ? extractedText.trim().split(/\s+/).length : 0;
  const lineCount = extractedText ? extractedText.split("\n").length : 0;

  return {
    text: extractedText,
    format: verifiedFormat,
    pages,
    pageCount,
    sections,
    metadata: {
      characterCount,
      wordCount,
      lineCount,
      pageCount,
    },
  };
}

