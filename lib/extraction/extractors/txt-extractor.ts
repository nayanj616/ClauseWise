/**
 * TXT Text Extractor — ClauseWise
 *
 * Decodes plain text documents with character encoding awareness (UTF-8, UTF-16).
 * Rejects disguised binaries or conflicting file signatures (PDF, DOCX, executables).
 * Does not fabricate page numbers where native page boundaries do not exist.
 */

import {
  EmptyContentError,
  MalformedDocumentError,
  UnreadableDocumentError,
} from "../errors";

/**
 * Checks for known binary signatures that conflict with plain text.
 */
export function inspectTxtContent(buffer: Buffer): {
  isValid: boolean;
  reason?: string;
  isConflict?: boolean;
} {
  if (buffer.length === 0) {
    return { isValid: false, reason: "File is empty (0 bytes)" };
  }

  // Check 1: Conflict with PDF (%PDF-)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return {
      isValid: false,
      reason: "File contains PDF signature (%PDF-) and is not plain text",
      isConflict: true,
    };
  }

  // Check 2: Conflict with ZIP / DOCX (PK\x03\x04 or PK\x05\x06)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06)
  ) {
    return {
      isValid: false,
      reason: "File contains ZIP/DOCX signature (PK) and is not plain text",
      isConflict: true,
    };
  }

  // Check 3: Conflict with Windows executable (MZ)
  if (
    buffer.length >= 2 &&
    buffer[0] === 0x4d &&
    buffer[1] === 0x5a
  ) {
    return {
      isValid: false,
      reason: "File contains binary executable signature (MZ) and is not plain text",
      isConflict: true,
    };
  }

  // Check 4: Conflict with ELF binary (\x7fELF)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return {
      isValid: false,
      reason: "File contains binary ELF signature and is not plain text",
      isConflict: true,
    };
  }

  // Check for UTF-16 BOMs
  const hasUtf16LeBom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
  const hasUtf16BeBom = buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff;

  if (hasUtf16LeBom || hasUtf16BeBom) {
    return { isValid: true };
  }

  // If not UTF-16 BOM, check for excessive null bytes or control characters in the first 1024 bytes
  const sampleLength = Math.min(buffer.length, 1024);
  let nullByteCount = 0;
  for (let i = 0; i < sampleLength; i++) {
    if (buffer[i] === 0x00) {
      nullByteCount++;
    }
  }

  if (nullByteCount > 0) {
    return {
      isValid: false,
      reason: "Binary null bytes detected; file is not valid plain text",
      isConflict: false,
    };
  }

  return { isValid: true };
}

export interface TxtExtractionResult {
  text: string;
}

/**
 * Extracts and normalizes text from a plain text buffer.
 *
 * @throws {MalformedDocumentError} If the buffer matches a conflicting file signature.
 * @throws {UnreadableDocumentError} If the buffer contains binary null bytes or invalid encoding.
 * @throws {EmptyContentError} If the decoded text is empty or only whitespace.
 */
export async function extractTxt(
  buffer: Buffer | Uint8Array
): Promise<TxtExtractionResult> {
  const nodeBuffer = buffer instanceof Buffer ? buffer : Buffer.from(buffer);

  if (nodeBuffer.length === 0) {
    throw new EmptyContentError();
  }

  const check = inspectTxtContent(nodeBuffer);
  if (!check.isValid) {
    if (check.isConflict) {
      throw new MalformedDocumentError(check.reason ?? "Conflicting file signature");
    }
    throw new UnreadableDocumentError(check.reason ?? "Unreadable text content");
  }

  let text: string;

  // Check UTF-16 LE BOM
  if (
    nodeBuffer.length >= 2 &&
    nodeBuffer[0] === 0xff &&
    nodeBuffer[1] === 0xfe
  ) {
    text = nodeBuffer.subarray(2).toString("utf16le");
  }
  // Check UTF-16 BE BOM
  else if (
    nodeBuffer.length >= 2 &&
    nodeBuffer[0] === 0xfe &&
    nodeBuffer[1] === 0xff
  ) {
    // Node.js doesn't have native utf16be string decoding, swap bytes to LE
    const swapped = Buffer.alloc(nodeBuffer.length - 2);
    for (let i = 2; i < nodeBuffer.length - 1; i += 2) {
      swapped[i - 2] = nodeBuffer[i + 1]!;
      swapped[i - 1] = nodeBuffer[i]!;
    }
    text = swapped.toString("utf16le");
  }
  // Check UTF-8 BOM
  else if (
    nodeBuffer.length >= 3 &&
    nodeBuffer[0] === 0xef &&
    nodeBuffer[1] === 0xbb &&
    nodeBuffer[2] === 0xbf
  ) {
    text = nodeBuffer.subarray(3).toString("utf8");
  }
  // Standard UTF-8
  else {
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      text = decoder.decode(nodeBuffer);
    } catch (decodeError) {
      throw new UnreadableDocumentError(
        "Invalid character encoding; document is not valid UTF-8",
        { cause: decodeError }
      );
    }
  }

  // Normalize line endings to standard LF
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  if (!text) {
    throw new EmptyContentError();
  }

  return {
    text,
  };
}

