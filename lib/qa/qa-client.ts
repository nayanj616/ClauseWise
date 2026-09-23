/**
 * Client-Side Q&A API Client — ClauseWise (Phase 5 Slice 5.3)
 *
 * Provides typed, sanitized communication between UI components and the
 * document-scoped Q&A API endpoint (/api/documents/[documentId]/ask).
 *
 * Client-safe — contains no server dependencies, secrets, or database queries.
 */

import type { AnswerQuestionResult } from "@/types";

export interface AskQuestionClientOptions {
  signal?: AbortSignal;
}

/**
 * Sends a question about a document to the server Q&A endpoint.
 *
 * @param documentId Target document UUID
 * @param question Non-empty user question text
 * @param options Optional request options (e.g. AbortSignal)
 * @returns Grounded answer result with authoritative citations
 */
export async function askDocumentQuestionApi(
  documentId: string,
  question: string,
  options?: AskQuestionClientOptions
): Promise<AnswerQuestionResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    throw new Error("Question must not be empty");
  }

  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/ask`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: trimmed }),
      signal: options?.signal,
    }
  );

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON response or abort
  }

  if (!response.ok) {
    const errorMessage =
      typeof data?.error === "string" && data.error.trim()
        ? data.error
        : "Failed to answer question. Please try again.";
    throw new Error(errorMessage);
  }

  return data as unknown as AnswerQuestionResult;
}

