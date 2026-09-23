/**
 * Client-Side Q&A & Conversation API Client — ClauseWise (Phase 5 Slice 5.4)
 *
 * Provides typed, sanitized communication between UI components and the
 * document-scoped Q&A and conversation API endpoints.
 *
 * Transport: Uses fetch() with ReadableStream reader and AbortController for SSE streaming.
 * Client-safe — contains no server dependencies, secrets, or database queries.
 */

import type {
  AnswerQuestionResult,
  Conversation,
  Message,
  ConversationSummary,
  QaStreamEventStatus,
  QaStreamEventComplete,
} from "@/types";

export interface AskQuestionClientOptions {
  signal?: AbortSignal;
}

export interface StreamMessageCallbacks {
  onStatus?: (status: QaStreamEventStatus) => void;
  onDelta?: (delta: string) => void;
  onComplete?: (complete: QaStreamEventComplete) => void;
  onError?: (error: string) => void;
}

// ---------------------------------------------------------------------------
// Single-turn stateless ask (Phase 5.3 backward compatibility)
// ---------------------------------------------------------------------------

/**
 * Sends a stateless question about a document to the server Q&A endpoint.
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

// ---------------------------------------------------------------------------
// Conversation Management APIs (Phase 5.4)
// ---------------------------------------------------------------------------

/**
 * Fetches all conversations for the specified document owned by current user.
 */
export async function fetchConversationsApi(
  documentId: string,
  options?: AskQuestionClientOptions
): Promise<ConversationSummary[]> {
  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/conversations`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: options?.signal,
    }
  );

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Failed to load conversations");
  }

  const data = (await response.json()) as { conversations: ConversationSummary[] };
  return data.conversations;
}

/**
 * Creates a new conversation thread for a document.
 */
export async function createConversationApi(
  documentId: string,
  title?: string,
  options?: AskQuestionClientOptions
): Promise<Conversation> {
  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/conversations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
      signal: options?.signal,
    }
  );

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Failed to create conversation");
  }

  const data = (await response.json()) as { conversation: Conversation };
  return data.conversation;
}

/**
 * Retrieves a conversation and its messages ordered by createdAt ASC, id ASC.
 */
export async function fetchConversationWithMessagesApi(
  documentId: string,
  conversationId: string,
  options?: AskQuestionClientOptions
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: options?.signal,
    }
  );

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Failed to load conversation");
  }

  return (await response.json()) as { conversation: Conversation; messages: Message[] };
}

/**
 * Deletes a conversation thread.
 */
export async function deleteConversationApi(
  documentId: string,
  conversationId: string,
  options?: AskQuestionClientOptions
): Promise<{ success: true }> {
  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      signal: options?.signal,
    }
  );

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Failed to delete conversation");
  }

  return (await response.json()) as { success: true };
}

// ---------------------------------------------------------------------------
// Streaming Messages API (Phase 5.4)
// Transport: fetch() + ReadableStream reader + line-by-line SSE parser
// ---------------------------------------------------------------------------

/**
 * Submits a question in a multi-turn conversation and streams the assistant response.
 *
 * Invariant: Delta events contain provisional text only. Citations are delivered
 * strictly within the terminal onComplete callback.
 */
export async function streamConversationMessageApi(
  documentId: string,
  conversationId: string,
  question: string,
  callbacks: StreamMessageCallbacks,
  options?: AskQuestionClientOptions
): Promise<void> {
  const trimmed = question.trim();
  if (!trimmed) {
    throw new Error("Question must not be empty");
  }

  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: trimmed }),
      signal: options?.signal,
    }
  );

  if (!response.ok) {
    let errorMsg = "Failed to stream message. Please try again.";
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data?.error === "string") {
        errorMsg = data.error;
      }
    } catch {
      // Non-JSON response
    }
    callbacks.onError?.(errorMsg);
    throw new Error(errorMsg);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split SSE packets separated by double-newline
      const packets = buffer.split("\n\n");
      buffer = packets.pop() || "";

      for (const packet of packets) {
        if (!packet.trim()) continue;

        let eventType = "message";
        let dataStr = "";

        const lines = packet.split("\n");
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataStr = line.slice(5).trim();
          }
        }

        if (dataStr) {
          try {
            const parsedData = JSON.parse(dataStr);
            if (eventType === "status") {
              callbacks.onStatus?.(parsedData as QaStreamEventStatus);
            } else if (eventType === "delta") {
              const deltaPayload = parsedData as { delta: string };
              callbacks.onDelta?.(deltaPayload.delta);
            } else if (eventType === "complete") {
              callbacks.onComplete?.(parsedData as QaStreamEventComplete);
            } else if (eventType === "error") {
              const errPayload = parsedData as { error: string };
              callbacks.onError?.(errPayload.error);
            }
          } catch {
            // Ignore parse errors on malformed packet fragments
          }
        }
      }
    }
  } catch (err) {
    if (options?.signal?.aborted) {
      // User aborted stream via AbortController
      return;
    }
    const errMessage =
      err instanceof Error ? err.message : "Error reading stream";
    callbacks.onError?.(errMessage);
    throw err;
  }
}
