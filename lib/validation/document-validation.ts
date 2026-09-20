/**
 * Document Upload Validation and Sanitization — ClauseWise
 *
 * Implements strict server-side validation for PDF and DOCX documents:
 * - MIME type validation
 * - File extension validation
 * - File signature / magic bytes and structural validation:
 *   - PDF: starts with %PDF- and contains %%EOF
 *   - DOCX: valid ZIP archive with [Content_Types].xml and word/ parts
 * - File size limit (10 MB maximum)
 * - Filename sanitization (path traversal prevention, single extension enforcement)
 * - Server-controlled storage path generation
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_EXTENSIONS = [".pdf", ".docx"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const MIME_TO_EXTENSION: Record<AllowedMimeType, AllowedExtension> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
};

export const EXTENSION_TO_MIME: Record<AllowedExtension, AllowedMimeType> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Custom error thrown when document validation fails.
 * Carries a safe, user-facing error message.
 */
export class DocumentValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

export interface ValidatedDocumentFile {
  buffer: Buffer;
  originalFilename: string;
  sanitizedFilename: string;
  storagePath: string;
  mimeType: AllowedMimeType;
  fileSizeBytes: number;
  title: string;
  documentId: string;
}

/**
 * Inspects a buffer to verify standard PDF file signature.
 * Requires:
 * 1. Minimum file length of 32 bytes
 * 2. Magic header: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
 * 3. %%EOF trailer marker present in the file
 */
export function inspectPdf(buffer: Buffer): { isValid: boolean; reason?: string } {
  if (buffer.length < 32) {
    return { isValid: false, reason: "File too small to be a valid PDF" };
  }

  // Check magic bytes: %PDF-
  const isPdfHeader =
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d;

  if (!isPdfHeader) {
    return { isValid: false, reason: "Missing %PDF- header magic bytes" };
  }

  // Check for %%EOF marker (usually in the last 2048 bytes)
  const tailSearchStart = Math.max(0, buffer.length - 2048);
  const tail = buffer.subarray(tailSearchStart).toString("latin1");
  if (!tail.includes("%%EOF")) {
    return { isValid: false, reason: "Missing %%EOF marker in PDF" };
  }

  return { isValid: true };
}

/**
 * Inspects a buffer to verify standard DOCX (OOXML WordprocessingML) structure.
 * A PK\x03\x04 header by itself is not sufficient; this parses ZIP directory
 * structures to ensure required Open Packaging Conventions and Word parts exist:
 * 1. Valid ZIP Local File Header (PK\x03\x04)
 * 2. Contains [Content_Types].xml
 * 3. Contains at least one entry under word/ (e.g. word/document.xml)
 */
export function inspectDocxZip(buffer: Buffer): {
  isValid: boolean;
  entries: string[];
  reason?: string;
} {
  if (buffer.length < 30) {
    return { isValid: false, entries: [], reason: "File too small to be a valid ZIP archive" };
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
      entries: [],
      reason: "Missing ZIP local file header magic bytes (PK\\x03\\x04)",
    };
  }

  const entries = new Set<string>();

  // Scan through buffer for Local File Headers (PK\x03\x04) and Central Directory Headers (PK\x01\x02)
  for (let i = 0; i <= buffer.length - 30; i++) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b) {
      // Local File Header: PK\x03\x04
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
      // Central Directory Header: PK\x01\x02
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
    (entry) =>
      entry === "[Content_Types].xml" ||
      entry.toLowerCase() === "[content_types].xml"
  );

  const hasWordPart = entryList.some(
    (entry) =>
      entry.startsWith("word/") ||
      entry.startsWith("word\\") ||
      entry.toLowerCase().startsWith("word/")
  );

  if (!hasContentTypes) {
    return {
      isValid: false,
      entries: entryList,
      reason: "Missing [Content_Types].xml in OOXML package",
    };
  }

  if (!hasWordPart) {
    return {
      isValid: false,
      entries: entryList,
      reason: "Missing word/ directory or document part in OOXML package",
    };
  }

  return { isValid: true, entries: entryList };
}

/**
 * Sanitizes an uploaded filename:
 * - Strips directory traversal (../, ..\, /)
 * - Strips null bytes and control characters
 * - Normalizes characters to ASCII alphanumeric, hyphens, underscores
 * - Eliminates double or ambiguous extensions (e.g. malicious.exe.pdf -> malicious_exe.pdf)
 * - Preserves the verified canonical extension (.pdf or .docx)
 * - Enforces safe length limits
 */
export function sanitizeFilename(
  rawFilename: string,
  validatedExtension: AllowedExtension
): string {
  if (!rawFilename || typeof rawFilename !== "string") {
    return `document${validatedExtension}`;
  }

  // 1. Strip null bytes and control characters
  // eslint-disable-next-line no-control-regex
  let clean = rawFilename.replace(/[\x00-\x1F\x7F]/g, "");

  // 2. Remove all directory paths (both forward and backward slashes)
  const forwardSegments = clean.split("/");
  clean = forwardSegments[forwardSegments.length - 1] ?? "";
  const backSegments = clean.split("\\");
  clean = backSegments[backSegments.length - 1] ?? "";

  // 3. Strip any remaining path traversal tokens
  clean = clean.replace(/\.\./g, "");

  // 4. Extract stem by stripping the trailing extension (case-insensitive)
  const extRegex = new RegExp(`\\${validatedExtension}$`, "i");
  let stem = clean.replace(extRegex, "");

  // 5. Sanitize stem:
  // Replace internal dots and unsafe characters with underscores to prevent ambiguous extensions
  // e.g. "payload.exe" becomes "payload_exe"
  stem = stem.replace(/[^a-zA-Z0-9_-]/g, "_");

  // Collapse multiple underscores
  stem = stem.replace(/_+/g, "_");

  // Trim leading/trailing underscores and hyphens
  stem = stem.replace(/^[-_]+|[-_]+$/g, "");

  // If stem is empty, fallback to "document"
  if (!stem) {
    stem = "document";
  }

  // Limit stem length to 100 characters to prevent filesystem/buffer issues
  stem = stem.slice(0, 100);

  return `${stem}${validatedExtension}`;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates a server-controlled storage object path.
 * Format: {userId}/{documentId}/{sanitizedFilename}
 *
 * Enforces:
 * - Valid UUID for userId
 * - Valid UUID for documentId
 * - Sanitized filename with no slashes or traversal
 */
export function generateStoragePath(
  userId: string,
  documentId: string,
  sanitizedFilename: string
): string {
  if (!UUID_REGEX.test(userId)) {
    throw new DocumentValidationError("Invalid user ID for storage path");
  }
  if (!UUID_REGEX.test(documentId)) {
    throw new DocumentValidationError("Invalid document ID for storage path");
  }

  // Verify sanitizedFilename does not contain any path separator or traversal
  if (
    sanitizedFilename.includes("/") ||
    sanitizedFilename.includes("\\") ||
    sanitizedFilename.includes("..")
  ) {
    throw new DocumentValidationError(
      "Unsafe filename detected during storage path generation"
    );
  }

  const storagePath = `${userId}/${documentId}/${sanitizedFilename}`;

  // Extra defensive check: verify storage path starts strictly with userId/
  if (!storagePath.startsWith(`${userId}/${documentId}/`)) {
    throw new DocumentValidationError("Storage path traversal violation");
  }

  return storagePath;
}

export interface DocumentUploadInput {
  file: File | { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
  userId: string;
}

/**
 * Validates an uploaded document file:
 * 1. Checks file size (0 < size <= 10 MB)
 * 2. Checks client MIME type against allowed MIME types
 * 3. Checks file extension against allowed extensions (.pdf, .docx)
 * 4. Checks MIME type matches file extension
 * 5. Reads file bytes and verifies file signature / structure (PDF / DOCX ZIP OOXML)
 * 6. Generates server-controlled document ID and storage path
 */
export async function validateDocumentUpload(
  input: DocumentUploadInput
): Promise<ValidatedDocumentFile> {
  const { file, userId } = input;

  if (!file) {
    throw new DocumentValidationError("No file provided");
  }

  if (!userId || !UUID_REGEX.test(userId)) {
    throw new DocumentValidationError("Invalid or missing user ID");
  }

  // 1. File size checks
  if (file.size <= 0) {
    throw new DocumentValidationError("File is empty (0 bytes)");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new DocumentValidationError(
      `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum limit of 10 MB`
    );
  }

  // 2. Extension validation
  const rawName = file.name || "";
  const lastDotIndex = rawName.lastIndexOf(".");
  if (lastDotIndex === -1) {
    throw new DocumentValidationError(
      "File has no extension. Only .pdf and .docx files are supported"
    );
  }

  const rawExtension = rawName.slice(lastDotIndex).toLowerCase();
  if (
    rawExtension !== ".pdf" &&
    rawExtension !== ".docx"
  ) {
    throw new DocumentValidationError(
      `Unsupported file extension '${rawExtension}'. Only .pdf and .docx files are supported`
    );
  }
  const extension: AllowedExtension = rawExtension;

  // 3. MIME type validation
  const clientMime = (file.type || "").toLowerCase().trim();
  if (
    clientMime !== "application/pdf" &&
    clientMime !==
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    throw new DocumentValidationError(
      `Unsupported MIME type '${clientMime}'. Only PDF and DOCX documents are accepted`
    );
  }
  const mimeType: AllowedMimeType = clientMime;

  // 4. Cross-check MIME type with file extension
  if (MIME_TO_EXTENSION[mimeType] !== extension) {
    throw new DocumentValidationError(
      `File extension '${extension}' does not match MIME type '${mimeType}'`
    );
  }

  // 5. Read buffer and check actual size
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    throw new DocumentValidationError("File buffer is empty");
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new DocumentValidationError(
      "File payload exceeds the maximum limit of 10 MB"
    );
  }

  // 6. Magic bytes and structural signature verification
  if (extension === ".pdf") {
    const pdfCheck = inspectPdf(buffer);
    if (!pdfCheck.isValid) {
      throw new DocumentValidationError(
        `Invalid or malformed PDF file: ${pdfCheck.reason ?? "Invalid signature"}`
      );
    }
  } else if (extension === ".docx") {
    const docxCheck = inspectDocxZip(buffer);
    if (!docxCheck.isValid) {
      throw new DocumentValidationError(
        `Invalid or malformed DOCX file: ${docxCheck.reason ?? "Invalid OOXML structure"}`
      );
    }
  }

  // 7. Sanitization and server-controlled identifiers
  const sanitizedFilename = sanitizeFilename(rawName, extension);
  const documentId = crypto.randomUUID();
  const storagePath = generateStoragePath(userId, documentId, sanitizedFilename);

  return {
    buffer,
    originalFilename: sanitizedFilename,
    sanitizedFilename,
    storagePath,
    mimeType,
    fileSizeBytes: buffer.length,
    title: sanitizedFilename,
    documentId,
  };
}

