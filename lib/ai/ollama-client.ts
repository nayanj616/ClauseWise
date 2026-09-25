/**
 * Ollama Local Inference Infrastructure Adapter — ClauseWise (Phase 3)
 *
 * SERVER-SIDE ONLY — Internal Ollama endpoints and configuration must never reach the browser.
 *
 * Responsibilities:
 * - Local Ollama HTTP API integration (/api/chat, /api/embed, /api/tags)
 * - Default model configuration: qwen3:4b (generation) and nomic-embed-text (768d embeddings)
 * - JSON Schema structured output enforcement via Ollama's `format` parameter + Zod validation
 * - Thinking-tag (<think>...</think>) and markdown fence sanitization for Qwen3 models
 * - Streaming chat completion generator for grounded conversational Q&A
 * - Deterministic timeouts, bounded retries, and sanitized error classification
 *
 * INFRASTRUCTURE ONLY: Zero document, section, chunk, finding, or legal domain logic.
 */

import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  AI_LIMITS,
  TEMPERATURES,
  OpenAiClientError,
  OpenAiConfigError,
  OpenAiInvalidRequestError,
  OpenAiTimeoutError,
  OpenAiTransientError,
  logSafeTelemetry,
  sanitizeErrorMessage,
  type ChatMessage,
  type StructuredOutputOptions,
} from "@/lib/ai/openai-client";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434" as const;

export const OLLAMA_MODELS = {
  /** Local reasoning & structured generation model */
  CHAT: "qwen3:4b",
  /** Local embedding model — 768-dimensional output */
  EMBEDDINGS: "nomic-embed-text",
} as const;

/** Dimensionality of nomic-embed-text embeddings */
export const OLLAMA_EMBEDDING_DIMENSIONS = 768 as const;

export interface OllamaConfig {
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  timeoutMs: number;
  maxRetries: number;
}

// ---------------------------------------------------------------------------
// Error Hierarchy (extends OpenAiClientError for seamless upstream handling)
// ---------------------------------------------------------------------------

export class OllamaConfigError extends OpenAiConfigError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OllamaConfigError";
  }
}

export class OllamaConnectionError extends OpenAiTransientError {
  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message, options);
    this.name = "OllamaConnectionError";
  }
}

export class OllamaModelNotFoundError extends OpenAiInvalidRequestError {
  readonly modelName: string;
  constructor(modelName: string, options?: { cause?: unknown }) {
    super(
      `Ollama model "${modelName}" is not installed locally. Run "ollama pull ${modelName}" to download it.`,
      { statusCode: 404, cause: options?.cause }
    );
    this.name = "OllamaModelNotFoundError";
    this.modelName = modelName;
  }
}

export class OllamaTimeoutError extends OpenAiTimeoutError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OllamaTimeoutError";
  }
}

export class OllamaInvalidResponseError extends OpenAiInvalidRequestError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OllamaInvalidResponseError";
  }
}

// ---------------------------------------------------------------------------
// Server Isolation & Configuration Resolution
// ---------------------------------------------------------------------------

export function assertOllamaServerEnvironment(): void {
  if (typeof window !== "undefined") {
    throw new OllamaConfigError(
      "[clausewise] lib/ai/ollama-client must only be loaded in a server-side environment."
    );
  }
}

assertOllamaServerEnvironment();

/**
 * Resolves and validates Ollama configuration from environment variables.
 */
export function getOllamaConfig(): OllamaConfig {
  assertOllamaServerEnvironment();

  const rawBaseUrl = (
    process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL
  ).trim();

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawBaseUrl);
  } catch (error) {
    throw new OllamaConfigError(
      `Invalid OLLAMA_BASE_URL "${sanitizeErrorMessage(rawBaseUrl)}": must be a valid HTTP/HTTPS URL.`,
      { cause: error }
    );
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new OllamaConfigError(
      `Invalid OLLAMA_BASE_URL protocol "${parsedUrl.protocol}": must be http: or https:.`
    );
  }

  const baseUrl = rawBaseUrl.replace(/\/+$/, "");
  const chatModel =
    (process.env.OLLAMA_CHAT_MODEL || "").trim() || OLLAMA_MODELS.CHAT;
  const embeddingModel =
    (process.env.OLLAMA_EMBEDDING_MODEL || "").trim() ||
    OLLAMA_MODELS.EMBEDDINGS;
  const timeoutMs =
    parseInt(
      process.env.OLLAMA_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || "",
      10
    ) || AI_LIMITS.DEFAULT_TIMEOUT_MS;
  const maxRetries =
    process.env.OLLAMA_MAX_RETRIES !== undefined
      ? parseInt(process.env.OLLAMA_MAX_RETRIES, 10)
      : parseInt(process.env.OPENAI_MAX_RETRIES || "", 10) ||
        AI_LIMITS.MAX_RETRIES;

  return {
    baseUrl,
    chatModel,
    embeddingModel,
    timeoutMs,
    maxRetries: Number.isNaN(maxRetries) ? AI_LIMITS.MAX_RETRIES : maxRetries,
  };
}

// ---------------------------------------------------------------------------
// JSON & Thinking-Tag Utilities for Qwen3
// ---------------------------------------------------------------------------

/**
 * Strips `<think>...</think>` blocks and markdown code fences from raw model output
 * so Qwen3 responses can be reliably parsed as JSON.
 */
export function extractCleanJsonString(rawContent: string): string {
  if (!rawContent || typeof rawContent !== "string") {
    return "";
  }

  // 1. Remove closed <think>...</think> reasoning blocks
  let cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // 2. Remove unclosed leading <think> if followed by a JSON object
  if (cleaned.startsWith("<think>")) {
    const firstBrace = cleaned.indexOf("{");
    if (firstBrace !== -1) {
      cleaned = cleaned.slice(firstBrace).trim();
    }
  }

  // 3. Strip markdown ```json ... ``` fences if present
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim();
  }

  // 4. Extract outermost JSON object if surrounded by extra text
  const firstOpenBrace = cleaned.indexOf("{");
  const lastCloseBrace = cleaned.lastIndexOf("}");
  if (
    firstOpenBrace !== -1 &&
    lastCloseBrace !== -1 &&
    lastCloseBrace > firstOpenBrace
  ) {
    cleaned = cleaned.slice(firstOpenBrace, lastCloseBrace + 1);
  }

  return cleaned.trim();
}

/**
 * Converts a Zod schema into a JSON Schema object suitable for Ollama's `format` parameter.
 */
export function buildOllamaJsonSchema<T>(
  schema: z.ZodType<T>,
  name: string
): Record<string, unknown> {
  const formatObj = zodResponseFormat(schema, name);
  const rawSchema = formatObj.json_schema?.schema;
  if (!rawSchema || typeof rawSchema !== "object") {
    throw new OllamaConfigError(
      `Failed to derive JSON schema for structured output "${name}".`
    );
  }
  return rawSchema as Record<string, unknown>;
}

/**
 * Classifies fetch / HTTP / runtime errors from Ollama into typed OpenAiClientError subclasses.
 */
export function classifyOllamaError(
  error: unknown,
  baseUrl: string,
  model: string
): OpenAiClientError {
  if (error instanceof OpenAiClientError) {
    return error;
  }

  if (error instanceof Error) {
    const cleanMsg = sanitizeErrorMessage(error.message);
    if (
      error.name === "AbortError" ||
      cleanMsg.toLowerCase().includes("timeout") ||
      cleanMsg.toLowerCase().includes("aborted")
    ) {
      return new OllamaTimeoutError(
        `Ollama request timed out for model "${model}".`,
        { cause: error }
      );
    }

    if (
      cleanMsg.toLowerCase().includes("fetch failed") ||
      cleanMsg.toLowerCase().includes("econnrefused") ||
      cleanMsg.toLowerCase().includes("enotfound") ||
      cleanMsg.toLowerCase().includes("network")
    ) {
      return new OllamaConnectionError(
        `Unable to connect to local Ollama service at ${baseUrl}. Verify that Ollama is running.`,
        { cause: error }
      );
    }

    return new OpenAiClientError(`Ollama client error: ${cleanMsg}`, {
      isRetryable: false,
      cause: error,
    });
  }

  return new OpenAiClientError("Unknown Ollama client error occurred.", {
    isRetryable: false,
    cause: error,
  });
}

// ---------------------------------------------------------------------------
// Custom Fetch Injection for Unit Testing
// ---------------------------------------------------------------------------

type FetchFn = typeof fetch;
let _customFetch: FetchFn | null = null;

export function setOllamaFetchForTesting(fn: FetchFn | null): void {
  _customFetch = fn;
}

function getFetch(): FetchFn {
  return _customFetch ?? globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Connectivity & Model Readiness Check
// ---------------------------------------------------------------------------

export interface OllamaConnectivityReport {
  reachable: boolean;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  installedModels: string[];
  hasChatModel: boolean;
  hasEmbeddingModel: boolean;
  error?: string;
}

function matchesModelTag(installed: string[], targetModel: string): boolean {
  const normalizedTarget = targetModel.trim().toLowerCase();
  const targetWithLatest = normalizedTarget.includes(":")
    ? normalizedTarget
    : `${normalizedTarget}:latest`;

  return installed.some((m) => {
    const candidate = m.trim().toLowerCase();
    return (
      candidate === normalizedTarget ||
      candidate === targetWithLatest ||
      candidate.startsWith(`${normalizedTarget}:`)
    );
  });
}

/**
 * Inspects local Ollama daemon connectivity and verifies whether required models are installed.
 */
export async function checkOllamaConnectivity(options?: {
  timeoutMs?: number;
}): Promise<OllamaConnectivityReport> {
  const config = getOllamaConfig();
  const timeoutMs = options?.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchFn = getFetch();
    const response = await fetchFn(`${config.baseUrl}/api/tags`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        reachable: false,
        baseUrl: config.baseUrl,
        chatModel: config.chatModel,
        embeddingModel: config.embeddingModel,
        installedModels: [],
        hasChatModel: false,
        hasEmbeddingModel: false,
        error: `Ollama /api/tags returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };

    const installedModels = (data.models ?? [])
      .map((m) => m.name || m.model || "")
      .filter((name): name is string => Boolean(name));

    return {
      reachable: true,
      baseUrl: config.baseUrl,
      chatModel: config.chatModel,
      embeddingModel: config.embeddingModel,
      installedModels,
      hasChatModel: matchesModelTag(installedModels, config.chatModel),
      hasEmbeddingModel: matchesModelTag(installedModels, config.embeddingModel),
    };
  } catch (error) {
    return {
      reachable: false,
      baseUrl: config.baseUrl,
      chatModel: config.chatModel,
      embeddingModel: config.embeddingModel,
      installedModels: [],
      hasChatModel: false,
      hasEmbeddingModel: false,
      error:
        error instanceof Error
          ? sanitizeErrorMessage(error.message)
          : "Failed to connect to Ollama",
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Structured Output Generation via Ollama (/api/chat)
// ---------------------------------------------------------------------------

interface OllamaChatResponse {
  model?: string;
  message?: {
    role?: string;
    content?: string;
  };
  error?: string;
}

/**
 * Generates and validates structured JSON output using local Ollama inference (`qwen3:4b`).
 */
export async function generateOllamaStructuredOutput<T>(
  options: StructuredOutputOptions<T>
): Promise<T> {
  assertOllamaServerEnvironment();

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

  const config = getOllamaConfig();
  // Map OpenAI default model ("gpt-4o") to configured Ollama chat model ("qwen3:4b")
  const requestedModel = options.model;
  const model =
    !requestedModel || requestedModel === "gpt-4o"
      ? config.chatModel
      : requestedModel;

  const temperature = options.temperature ?? TEMPERATURES.ANALYSIS;
  const maxTokens = options.maxTokens ?? AI_LIMITS.MAX_COMPLETION_TOKENS;
  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  const maxRetries =
    options.maxRetries !== undefined ? options.maxRetries : config.maxRetries;
  const retryBaseDelayMs =
    options.retryDelayMs !== undefined
      ? options.retryDelayMs
      : AI_LIMITS.RETRY_BASE_DELAY_MS;

  const jsonSchema = buildOllamaJsonSchema(options.schema, options.name);
  const fetchFn = getFetch();

  let lastError: OpenAiClientError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(`${config.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: options.messages,
          stream: false,
          think: false,
          format: jsonSchema,
          options: {
            temperature,
            num_predict: maxTokens,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson?.error) {
            errorDetail = sanitizeErrorMessage(errJson.error);
          }
        } catch {
          // Ignore non-JSON error body
        }

        if (
          response.status === 404 ||
          errorDetail.toLowerCase().includes("not found")
        ) {
          throw new OllamaModelNotFoundError(model);
        }

        if (response.status >= 500 && response.status < 600) {
          throw new OllamaConnectionError(
            `Ollama server error (HTTP ${response.status}): ${errorDetail}`,
            { statusCode: response.status }
          );
        }

        throw new OllamaInvalidResponseError(
          `Ollama request failed (${response.status}): ${errorDetail}`
        );
      }

      const payload = (await response.json()) as OllamaChatResponse;
      const rawContent = payload.message?.content;

      if (!rawContent || !rawContent.trim()) {
        throw new OllamaInvalidResponseError(
          "Ollama returned an empty message content for structured output."
        );
      }

      const cleanedJson = extractCleanJsonString(rawContent);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(cleanedJson);
      } catch (parseErr) {
        throw new OllamaInvalidResponseError(
          "Ollama response could not be parsed as valid JSON.",
          { cause: parseErr }
        );
      }

      const validated = options.schema.safeParse(parsedJson);
      if (!validated.success) {
        const issueSummary = validated.error.issues
          .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
          .join("; ");
        throw new OllamaInvalidResponseError(
          `Ollama response failed schema validation (${options.name}): ${issueSummary}`
        );
      }

      return validated.data;
    } catch (rawError) {
      const durationMs = Date.now() - startTime;
      const classified = classifyOllamaError(rawError, config.baseUrl, model);
      lastError = classified;

      const canRetry = classified.isRetryable && attempt < maxRetries;
      if (canRetry) {
        logSafeTelemetry("warn", {
          operation: "ollama_structured_output",
          model,
          attempt: attempt + 1,
          maxRetries,
          category: classified.category,
          durationMs,
          message: classified.message,
        });

        const delay = retryBaseDelayMs * Math.pow(2, attempt);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        continue;
      }

      logSafeTelemetry("error", {
        operation: "ollama_structured_output",
        model,
        attempt: attempt + 1,
        maxRetries,
        category: classified.category,
        durationMs,
        message: classified.message,
      });

      throw classified;
    } finally {
      clearTimeout(timer);
    }
  }

  throw (
    lastError ??
    new OpenAiClientError("Ollama structured output generation failed unexpectedly.")
  );
}

// ---------------------------------------------------------------------------
// Streaming Structured Output via Ollama (/api/chat with stream: true)
// ---------------------------------------------------------------------------

export interface StreamOllamaStructuredOptions<T> {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  name: string;
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Streams JSON tokens from local Ollama `/api/chat` for real-time Q&A delta extraction.
 */
export async function* streamOllamaStructuredChat<T>(
  options: StreamOllamaStructuredOptions<T>
): AsyncGenerator<string, void, unknown> {
  assertOllamaServerEnvironment();

  const config = getOllamaConfig();
  const requestedModel = options.model;
  const model =
    !requestedModel || requestedModel === "gpt-4o"
      ? config.chatModel
      : requestedModel;
  const temperature = options.temperature ?? TEMPERATURES.QA;
  const jsonSchema = buildOllamaJsonSchema(options.schema, options.name);
  const fetchFn = getFetch();

  let response: Response;
  try {
    response = await fetchFn(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: options.messages,
        stream: true,
        think: false,
        format: jsonSchema,
        options: {
          temperature,
        },
      }),
      signal: options.signal,
    });
  } catch (error) {
    throw classifyOllamaError(error, config.baseUrl, model);
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson?.error) {
        errorDetail = sanitizeErrorMessage(errJson.error);
      }
    } catch {
      // Ignore non-JSON body
    }
    if (
      response.status === 404 ||
      errorDetail.toLowerCase().includes("not found")
    ) {
      throw new OllamaModelNotFoundError(model);
    }
    throw new OllamaConnectionError(
      `Ollama streaming chat failed (${response.status}): ${errorDetail}`,
      { statusCode: response.status }
    );
  }

  if (!response.body) {
    throw new OllamaInvalidResponseError("Ollama streaming response body is empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = "";

  try {
    while (true) {
      if (options.signal?.aborted) {
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
          const parsedLine = JSON.parse(line) as OllamaChatResponse;
          const deltaText = parsedLine.message?.content ?? "";
          if (deltaText) {
            yield deltaText;
          }
        } catch {
          // Ignore malformed partial line
        }
      }
    }

    if (lineBuffer.trim()) {
      try {
        const parsedLine = JSON.parse(lineBuffer.trim()) as OllamaChatResponse;
        const deltaText = parsedLine.message?.content ?? "";
        if (deltaText) {
          yield deltaText;
        }
      } catch {
        // Ignore trailing fragment
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Ollama Embeddings (/api/embed) — nomic-embed-text (768 dimensions)
// ---------------------------------------------------------------------------

interface OllamaEmbedResponse {
  model?: string;
  embeddings?: number[][];
  embedding?: number[];
  error?: string;
}

export interface OllamaEmbedOptions {
  model?: string;
  expectedDimensions?: number;
  timeoutMs?: number;
}

/**
 * Generates embeddings for multiple texts via Ollama `/api/embed` (defaults to `nomic-embed-text`, 768 dimensions).
 */
export async function embedBatchWithOllama(
  texts: string[],
  options?: OllamaEmbedOptions
): Promise<number[][]> {
  assertOllamaServerEnvironment();
  if (texts.length === 0) return [];

  const config = getOllamaConfig();
  const model = options?.model ?? config.embeddingModel;
  const expectedDimensions =
    options?.expectedDimensions ?? OLLAMA_EMBEDDING_DIMENSIONS;
  const timeoutMs = options?.timeoutMs ?? config.timeoutMs;
  const fetchFn = getFetch();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(`${config.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: texts,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: string };
        if (errJson?.error) {
          errorDetail = sanitizeErrorMessage(errJson.error);
        }
      } catch {
        // Ignore
      }

      if (
        response.status === 404 ||
        errorDetail.toLowerCase().includes("not found")
      ) {
        throw new OllamaModelNotFoundError(model);
      }

      throw new OllamaConnectionError(
        `Ollama embedding request failed (${response.status}): ${errorDetail}`,
        { statusCode: response.status }
      );
    }

    const payload = (await response.json()) as OllamaEmbedResponse;
    const embeddings =
      payload.embeddings ?? (payload.embedding ? [payload.embedding] : null);

    if (!embeddings || !Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new OllamaInvalidResponseError(
        `Ollama returned ${embeddings?.length ?? 0} embeddings for ${texts.length} input texts.`
      );
    }

    for (let i = 0; i < embeddings.length; i++) {
      const vec = embeddings[i];
      if (!Array.isArray(vec) || vec.length !== expectedDimensions) {
        throw new OllamaInvalidResponseError(
          `Ollama embedding dimension mismatch for model "${model}": expected ${expectedDimensions}, received ${vec?.length ?? 0}.`
        );
      }
    }

    return embeddings;
  } catch (error) {
    throw classifyOllamaError(error, config.baseUrl, model);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates a single embedding vector via Ollama (`nomic-embed-text`, 768 dimensions).
 */
export async function embedTextWithOllama(
  text: string,
  options?: OllamaEmbedOptions
): Promise<number[]> {
  const results = await embedBatchWithOllama([text], options);
  const first = results[0];
  if (!first) {
    throw new OllamaInvalidResponseError("Ollama returned an empty embedding result.");
  }
  return first;
}
