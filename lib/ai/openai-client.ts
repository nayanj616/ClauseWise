/**
 * OpenAI Client Infrastructure Adapter — ClauseWise
 *
 * SERVER-SIDE ONLY — OPENAI_API_KEY must never reach the browser.
 *
 * Responsibilities:
 * - Production-ready, server-side OpenAI SDK integration
 * - Model configuration and constants (gpt-4o, text-embedding-3-small)
 * - Deterministic request timeout configuration
 * - Bounded retry behavior for transient network/service errors and rate limits
 * - Generic structured-output capability with Zod schema validation
 * - Typed, sanitized error boundary (never leaks API keys, headers, or document content)
 * - Safe internal telemetry and logging (zero prompt or document content logged)
 *
 * INFRASTRUCTURE ONLY: Zero document, section, chunk, finding, or legal domain logic.
 */

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Server-only guard: Ensures this module is never loaded or executed in browser runtime.
 */
export function assertServerEnvironment(): void {
  if (typeof window !== "undefined") {
    throw new OpenAiConfigError(
      "[clausewise] lib/ai/openai-client must only be loaded in a server-side environment."
    );
  }
}

// Enforce guard at load time
assertServerEnvironment();

/**
 * Centralized model identifiers from Phase 3 contract.
 */
export const MODELS = {
  /** Primary model for analysis, QA, and generation */
  CHAT: "gpt-4o",
  /** Embeddings model — 1536-dimensional output, maps to vector(1536) in pgvector */
  EMBEDDINGS: "text-embedding-3-small",
} as const;

/**
 * Temperature settings from AI_BEHAVIOR.md / Phase 3 contract.
 */
export const TEMPERATURES = {
  CLASSIFICATION: 0.0,
  ANALYSIS: 0.1,
  COMPARISON: 0.1,
  QA: 0.2,
  SUMMARY: 0.3,
  PREPARE: 0.3,
} as const;

/**
 * Operational limits and infrastructure defaults.
 */
export const AI_LIMITS = {
  /** Maximum completion tokens for structured responses */
  MAX_COMPLETION_TOKENS: 4096,
  /** Default request timeout in milliseconds (60 seconds) */
  DEFAULT_TIMEOUT_MS: 60000,
  /** Maximum retry attempts for transient errors */
  MAX_RETRIES: 2,
  /** Base delay between retries in milliseconds */
  RETRY_BASE_DELAY_MS: 1000,
} as const;

// ---------------------------------------------------------------------------
// Error Boundary Hierarchy
// ---------------------------------------------------------------------------

export class OpenAiClientError extends Error {
  readonly category: string;
  readonly statusCode?: number;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    options?: {
      category?: string;
      statusCode?: number;
      isRetryable?: boolean;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "OpenAiClientError";
    this.category = options?.category ?? "unknown";
    this.statusCode = options?.statusCode;
    this.isRetryable = options?.isRetryable ?? false;
  }
}

export class OpenAiConfigError extends OpenAiClientError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, {
      category: "configuration",
      isRetryable: false,
      cause: options?.cause,
    });
    this.name = "OpenAiConfigError";
  }
}

export class OpenAiAuthError extends OpenAiClientError {
  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message, {
      category: "authentication",
      statusCode: options?.statusCode ?? 401,
      isRetryable: false,
      cause: options?.cause,
    });
    this.name = "OpenAiAuthError";
  }
}

export class OpenAiTimeoutError extends OpenAiClientError {
  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message, {
      category: "timeout",
      statusCode: options?.statusCode ?? 408,
      isRetryable: true,
      cause: options?.cause,
    });
    this.name = "OpenAiTimeoutError";
  }
}

export class OpenAiRateLimitError extends OpenAiClientError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, {
      category: "rate_limit",
      statusCode: 429,
      isRetryable: true,
      cause: options?.cause,
    });
    this.name = "OpenAiRateLimitError";
  }
}

export class OpenAiTransientError extends OpenAiClientError {
  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message, {
      category: "transient",
      statusCode: options?.statusCode ?? 500,
      isRetryable: true,
      cause: options?.cause,
    });
    this.name = "OpenAiTransientError";
  }
}

export class OpenAiInvalidRequestError extends OpenAiClientError {
  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message, {
      category: "invalid_request",
      statusCode: options?.statusCode ?? 400,
      isRetryable: false,
      cause: options?.cause,
    });
    this.name = "OpenAiInvalidRequestError";
  }
}

export class OpenAiRefusalError extends OpenAiClientError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, {
      category: "refusal",
      isRetryable: false,
      cause: options?.cause,
    });
    this.name = "OpenAiRefusalError";
  }
}

// ---------------------------------------------------------------------------
// Sanitization & Error Classification
// ---------------------------------------------------------------------------

/**
 * Strips sensitive API keys and Bearer tokens from strings to prevent credential leaks.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== "string") return "";
  return message
    .replace(/sk-[a-zA-Z0-9_\-]{15,}/gi, "[REDACTED_API_KEY]")
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");
}

/**
 * Classifies any thrown error into a typed, sanitized OpenAiClientError.
 */
export function classifyOpenAiError(error: unknown): OpenAiClientError {
  if (error instanceof OpenAiClientError) {
    return error;
  }

  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const cleanMsg = sanitizeErrorMessage(error.message || "OpenAI API error");

    if (status === 401 || error instanceof OpenAI.AuthenticationError) {
      return new OpenAiAuthError(
        "OpenAI authentication failed: invalid API key or credentials.",
        { statusCode: 401, cause: error }
      );
    }

    if (status === 403 || error instanceof OpenAI.PermissionDeniedError) {
      return new OpenAiAuthError(
        "OpenAI authorization failed: access to the requested resource is denied.",
        { statusCode: 403, cause: error }
      );
    }

    if (status === 429 || error instanceof OpenAI.RateLimitError) {
      return new OpenAiRateLimitError(
        "OpenAI rate limit reached. Backoff retry required.",
        { cause: error }
      );
    }

    if (status === 408 || error instanceof OpenAI.APIConnectionTimeoutError) {
      return new OpenAiTimeoutError("OpenAI request timed out.", {
        statusCode: status,
        cause: error,
      });
    }

    if (error instanceof OpenAI.APIConnectionError) {
      return new OpenAiTransientError("OpenAI network connection failed.", {
        cause: error,
      });
    }

    if (status && status >= 500 && status < 600) {
      return new OpenAiTransientError(
        `OpenAI temporary service error (HTTP ${status}).`,
        { statusCode: status, cause: error }
      );
    }

    if (status && status >= 400 && status < 500) {
      return new OpenAiInvalidRequestError(
        `OpenAI invalid request: ${cleanMsg}`,
        { statusCode: status, cause: error }
      );
    }

    return new OpenAiClientError(`OpenAI API error: ${cleanMsg}`, {
      statusCode: status,
      isRetryable: false,
      cause: error,
    });
  }

  if (error instanceof Error) {
    const cleanMsg = sanitizeErrorMessage(error.message);
    if (error.name === "AbortError" || cleanMsg.toLowerCase().includes("timeout")) {
      return new OpenAiTimeoutError("OpenAI request timed out.", { cause: error });
    }
    return new OpenAiClientError(`OpenAI client error: ${cleanMsg}`, {
      isRetryable: false,
      cause: error,
    });
  }

  return new OpenAiClientError("Unknown OpenAI client error occurred.", {
    isRetryable: false,
    cause: error,
  });
}

// ---------------------------------------------------------------------------
// Telemetry & Logging
// ---------------------------------------------------------------------------

export interface SafeTelemetry {
  operation: string;
  model: string;
  attempt?: number;
  maxRetries?: number;
  category: string;
  durationMs?: number;
  message: string;
}

/**
 * Emits safe internal telemetry.
 * NEVER logs prompt text, document content, model completions, or authorization headers.
 */
export function logSafeTelemetry(level: "warn" | "error", data: SafeTelemetry): void {
  const durationStr = data.durationMs !== undefined ? ` in ${data.durationMs}ms` : "";
  const attemptStr =
    data.attempt !== undefined
      ? ` [attempt ${data.attempt}/${(data.maxRetries ?? 0) + 1}]`
      : "";
  const logMessage = `[openai-client] ${data.operation} (${data.model})${attemptStr} - ${data.category}: ${data.message}${durationStr}`;

  if (level === "warn") {
    console.warn(logMessage);
  } else {
    console.error(logMessage);
  }
}

// ---------------------------------------------------------------------------
// Client Management & Factory
// ---------------------------------------------------------------------------

let _clientInstance: OpenAI | null = null;

/**
 * Retrieves or creates the singleton OpenAI client instance.
 * Ensures server-side isolation and explicit configuration.
 */
export function getOpenAiClient(): OpenAI {
  assertServerEnvironment();

  if (!_clientInstance) {
    let apiKey: string | undefined;
    try {
      apiKey = env.OPENAI_API_KEY;
    } catch (e) {
      apiKey = process.env.OPENAI_API_KEY;
    }

    if (!apiKey || !apiKey.trim()) {
      throw new OpenAiConfigError(
        "OPENAI_API_KEY is required but empty or missing in server environment."
      );
    }

    const timeout =
      parseInt(process.env.OPENAI_TIMEOUT_MS || "", 10) ||
      AI_LIMITS.DEFAULT_TIMEOUT_MS;

    _clientInstance = new OpenAI({
      apiKey,
      timeout,
      maxRetries: 0, // Adapter orchestrates retries explicitly with safe telemetry
    });
  }

  return _clientInstance;
}

/**
 * Testing hook: Injects or resets the client instance.
 */
export function setOpenAiClientForTesting(client: OpenAI | null): void {
  _clientInstance = client;
}

/**
 * Singleton OpenAI client proxy.
 * Lazily resolves via getOpenAiClient() to ensure server environment and configuration validation.
 */
export const openaiClient = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    const client = getOpenAiClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

// ---------------------------------------------------------------------------
// Structured Output Capability
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StructuredOutputOptions<T> {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  name: string;
  description?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Generic, production-ready structured output executor with deterministic timeout,
 * bounded retries for transient failures, and safe telemetry.
 *
 * @param options - Request options including messages, Zod schema, and execution limits
 * @returns Parsed and validated object conforming to the provided Zod schema
 */
export async function generateStructuredOutput<T>(
  options: StructuredOutputOptions<T>
): Promise<T> {
  assertServerEnvironment();

  if (!options.messages || options.messages.length === 0) {
    throw new OpenAiInvalidRequestError(
      "Structured output request requires non-empty messages array."
    );
  }
  if (!options.schema || !options.name) {
    throw new OpenAiInvalidRequestError(
      "Structured output request requires schema and schema name."
    );
  }

  const client = getOpenAiClient();
  const model = options.model ?? MODELS.CHAT;
  const temperature = options.temperature ?? TEMPERATURES.ANALYSIS;
  const maxTokens = options.maxTokens ?? AI_LIMITS.MAX_COMPLETION_TOKENS;
  const timeoutMs =
    options.timeoutMs ??
    (parseInt(process.env.OPENAI_TIMEOUT_MS || "", 10) ||
      AI_LIMITS.DEFAULT_TIMEOUT_MS);
  const maxRetries =
    options.maxRetries !== undefined
      ? options.maxRetries
      : (parseInt(process.env.OPENAI_MAX_RETRIES || "", 10) || AI_LIMITS.MAX_RETRIES);
  const retryBaseDelayMs =
    options.retryDelayMs !== undefined
      ? options.retryDelayMs
      : AI_LIMITS.RETRY_BASE_DELAY_MS;

  let lastError: OpenAiClientError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    try {
      const completion = await client.beta.chat.completions.parse(
        {
          model,
          temperature,
          max_tokens: maxTokens,
          messages: options.messages,
          response_format: zodResponseFormat(options.schema, options.name),
        },
        {
          timeout: timeoutMs,
        }
      );

      const choice = completion.choices?.[0];
      if (!choice) {
        throw new OpenAiTransientError("OpenAI returned an empty choices array.");
      }

      if (choice.message.refusal) {
        throw new OpenAiRefusalError(
          `OpenAI model refused request: ${sanitizeErrorMessage(choice.message.refusal)}`
        );
      }

      const parsed = choice.message.parsed;
      if (parsed === null || parsed === undefined) {
        throw new OpenAiInvalidRequestError(
          "OpenAI response could not be parsed into the expected schema."
        );
      }

      return parsed as T;
    } catch (rawError) {
      const durationMs = Date.now() - startTime;
      const classifiedError = classifyOpenAiError(rawError);
      lastError = classifiedError;

      const canRetry = classifiedError.isRetryable && attempt < maxRetries;

      if (canRetry) {
        logSafeTelemetry("warn", {
          operation: "structured_output",
          model,
          attempt: attempt + 1,
          maxRetries,
          category: classifiedError.category,
          durationMs,
          message: classifiedError.message,
        });

        const delay = retryBaseDelayMs * Math.pow(2, attempt);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        continue;
      }

      logSafeTelemetry("error", {
        operation: "structured_output",
        model,
        attempt: attempt + 1,
        maxRetries,
        category: classifiedError.category,
        durationMs,
        message: classifiedError.message,
      });

      throw classifiedError;
    }
  }

  throw lastError ?? new OpenAiClientError("Structured output generation failed unexpectedly.");
}
