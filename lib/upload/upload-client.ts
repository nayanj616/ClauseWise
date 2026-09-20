/**
 * Document Upload Client — ClauseWise
 *
 * Provides client-side validation and API integration for document uploads.
 * Submits files to POST /api/documents/upload as multipart/form-data.
 *
 * NOTE: Client-side validation is for immediate UX feedback only.
 * The server remains the authoritative validation and security boundary.
 */

import type { Document } from "@/types";

export const CLIENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ClientValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates file on client before attempting upload:
 * - Checks file existence and non-zero size
 * - Checks 10 MB size limit
 * - Checks file extension (.pdf, .docx)
 */
export function validateClientUploadFile(
  file: File | null | undefined
): ClientValidationResult {
  if (!file) {
    return {
      valid: false,
      error: "Please select a document file to upload.",
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: "The selected file is empty (0 bytes).",
    };
  }

  if (file.size > CLIENT_MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: "File size exceeds the 10 MB limit. Please select a smaller file.",
    };
  }

  const name = file.name || "";
  const lowerName = name.toLowerCase();
  const isPdf = lowerName.endsWith(".pdf");
  const isDocx = lowerName.endsWith(".docx");

  if (!isPdf && !isDocx) {
    return {
      valid: false,
      error:
        "Unsupported file type. Only PDF (.pdf) and Word (.docx) documents are supported.",
    };
  }

  return { valid: true };
}

export interface UploadResult {
  success: boolean;
  document?: Document;
  error?: string;
}

/**
 * Submits a validated file to the server upload API.
 * Never sends client-controlled user or ownership IDs.
 */
export async function uploadDocumentFileApi(
  file: File
): Promise<UploadResult> {
  const clientValidation = validateClientUploadFile(file);
  if (!clientValidation.valid) {
    return {
      success: false,
      error: clientValidation.error || "Invalid file",
    };
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/documents/upload", {
      method: "POST",
      body: formData,
    });

    if (response.status === 201) {
      const data = (await response.json()) as { document: Document };
      return {
        success: true,
        document: data.document,
      };
    }

    if (response.status === 400) {
      const data = (await response.json()) as { error?: string };
      return {
        success: false,
        error:
          data.error ||
          "The file could not be validated. Please check the file and try again.",
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        error: "Authentication required. Please sign in and try again.",
      };
    }

    // 500 or any unexpected server response — return generic safe error
    return {
      success: false,
      error: "Failed to upload document. Please try again later.",
    };
  } catch {
    // Network or request dispatch error
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}

