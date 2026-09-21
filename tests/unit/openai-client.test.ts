/**
 * Unit Tests — OpenAI Infrastructure Adapter (Slice 3.1)
 *
 * Validates:
 * 1. Configuration & Server Isolation
 * 2. Model Parameters & Structured Outputs
 * 3. Timeout Handling & Typed Errors
 * 4. Retry Behavior (transient retries, non-retryable immediate failure, retry exhaustion)
 * 5. Security & Sanitization (no API keys, headers, or document content leaked in errors or logs)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockEnvKey: string | undefined = "mock-valid-key-for-tests";

vi.mock("@/lib/env", () => ({
  get env() {
    return {
      OPENAI_API_KEY: mockEnvKey,
    };
  },
}));

import OpenAI from "openai";
import { z } from "zod";
import {
  MODELS,
  TEMPERATURES,
  AI_LIMITS,
  getOpenAiClient,
  setOpenAiClientForTesting,
  generateStructuredOutput,
  classifyOpenAiError,
  sanitizeErrorMessage,
  assertServerEnvironment,
  OpenAiClientError,
  OpenAiConfigError,
  OpenAiAuthError,
  OpenAiTimeoutError,
  OpenAiRateLimitError,
  OpenAiTransientError,
  OpenAiInvalidRequestError,
  OpenAiRefusalError,
} from "@/lib/ai/openai-client";

// Test schema
const TestSchema = z.object({
  status: z.string(),
  count: z.number(),
});

describe("OpenAI Infrastructure Adapter — Slice 3.1", () => {
  let mockParse: ReturnType<typeof vi.fn>;
  let mockClient: any;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let warnLogs: string[] = [];
  let errorLogs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    warnLogs = [];
    errorLogs = [];

    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    console.warn = vi.fn((msg: string) => warnLogs.push(msg));
    console.error = vi.fn((msg: string) => errorLogs.push(msg));

    mockParse = vi.fn();
    mockClient = {
      beta: {
        chat: {
          completions: {
            parse: mockParse,
          },
        },
      },
    };
    setOpenAiClientForTesting(mockClient as any);
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    setOpenAiClientForTesting(null);
    delete (global as any).window;
  });

  // =========================================================================
  // 1. Configuration & Server Isolation
  // =========================================================================
  describe("Configuration & Server Isolation", () => {
    it("throws OpenAiConfigError when running in a browser environment", () => {
      (global as any).window = {};
      expect(() => assertServerEnvironment()).toThrow(OpenAiConfigError);
      expect(() => assertServerEnvironment()).toThrow(
        /must only be loaded in a server-side environment/
      );
    });

    it("verifies model configuration constants adhere to Phase 3 contract", () => {
      expect(MODELS.CHAT).toBe("gpt-4o");
      expect(MODELS.EMBEDDINGS).toBe("text-embedding-3-small");
      expect(TEMPERATURES.ANALYSIS).toBe(0.1);
      expect(TEMPERATURES.CLASSIFICATION).toBe(0.0);
      expect(AI_LIMITS.MAX_COMPLETION_TOKENS).toBe(4096);
      expect(AI_LIMITS.DEFAULT_TIMEOUT_MS).toBe(60000);
      expect(AI_LIMITS.MAX_RETRIES).toBe(2);
    });

    it("initializes an OpenAI client instance when configuration is valid", () => {
      setOpenAiClientForTesting(null);
      const client = getOpenAiClient();
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(OpenAI);
    });
  });

  // =========================================================================
  // 2. Successful Request & Structured Outputs
  // =========================================================================
  describe("Structured Output Request", () => {
    it("invokes OpenAI SDK with expected model, temperature, limits, and schema format", async () => {
      const mockResult = { status: "success", count: 42 };
      mockParse.mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: mockResult,
              refusal: null,
            },
          },
        ],
      });

      const result = await generateStructuredOutput({
        messages: [
          { role: "system", content: "You are a test assistant." },
          { role: "user", content: "Analyze payload." },
        ],
        schema: TestSchema,
        name: "test_output",
        timeoutMs: 30000,
        retryDelayMs: 0,
      });

      expect(result).toEqual(mockResult);
      expect(mockParse).toHaveBeenCalledTimes(1);
      expect(mockParse).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o",
          temperature: 0.1,
          max_tokens: 4096,
          messages: [
            { role: "system", content: "You are a test assistant." },
            { role: "user", content: "Analyze payload." },
          ],
          response_format: expect.objectContaining({
            type: "json_schema",
          }),
        }),
        { timeout: 30000 }
      );
    });

    it("rejects empty messages or missing schema before dispatching network request", async () => {
      await expect(
        generateStructuredOutput({
          messages: [],
          schema: TestSchema,
          name: "test",
        })
      ).rejects.toThrow(OpenAiInvalidRequestError);

      expect(mockParse).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. Timeout Handling
  // =========================================================================
  describe("Timeout Handling", () => {
    it("surfaces OpenAI APIConnectionTimeoutError as OpenAiTimeoutError", async () => {
      const timeoutErr = new OpenAI.APIConnectionTimeoutError();
      mockParse.mockRejectedValue(timeoutErr);

      await expect(
        generateStructuredOutput({
          messages: [{ role: "user", content: "Test timeout" }],
          schema: TestSchema,
          name: "test",
          maxRetries: 1,
          retryDelayMs: 0,
        })
      ).rejects.toThrow(OpenAiTimeoutError);

      // Should attempt initial + 1 retry = 2 calls
      expect(mockParse).toHaveBeenCalledTimes(2);
    });

    it("surfaces generic AbortError timeout as OpenAiTimeoutError", async () => {
      const abortErr = new Error("The operation was aborted due to timeout");
      abortErr.name = "AbortError";
      mockParse.mockRejectedValue(abortErr);

      const promise = generateStructuredOutput({
        messages: [{ role: "user", content: "Test abort" }],
        schema: TestSchema,
        name: "test",
        maxRetries: 0,
      });

      await expect(promise).rejects.toThrow(OpenAiTimeoutError);
      await expect(promise).rejects.toMatchObject({
        category: "timeout",
        statusCode: 408,
      });
    });
  });

  // =========================================================================
  // 4. Retry Behavior
  // =========================================================================
  describe("Retry Behavior", () => {
    it("retries transient 500 InternalServerError within configured limit and succeeds", async () => {
      const serverErr = new OpenAI.InternalServerError(
        500,
        {},
        "Temporary backend failure",
        {}
      );
      const successfulResult = { status: "recovered", count: 10 };

      // Fail first attempt, succeed on second attempt
      mockParse
        .mockRejectedValueOnce(serverErr)
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                parsed: successfulResult,
                refusal: null,
              },
            },
          ],
        });

      const result = await generateStructuredOutput({
        messages: [{ role: "user", content: "Hello" }],
        schema: TestSchema,
        name: "test",
        maxRetries: 2,
        retryDelayMs: 0,
      });

      expect(result).toEqual(successfulResult);
      expect(mockParse).toHaveBeenCalledTimes(2);

      // Safe warning telemetry was emitted for the retry
      expect(warnLogs.length).toBe(1);
      expect(warnLogs[0]).toContain("[attempt 1/3]");
      expect(warnLogs[0]).toContain("transient");
    });

    it("retries 429 RateLimitError and succeeds", async () => {
      const rateLimitErr = new OpenAI.RateLimitError(
        429,
        {},
        "Rate limit exceeded. Please try again in 200ms.",
        {}
      );
      const successfulResult = { status: "rate_limit_recovered", count: 99 };

      mockParse
        .mockRejectedValueOnce(rateLimitErr)
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                parsed: successfulResult,
                refusal: null,
              },
            },
          ],
        });

      const result = await generateStructuredOutput({
        messages: [{ role: "user", content: "Rate test" }],
        schema: TestSchema,
        name: "test",
        maxRetries: 2,
        retryDelayMs: 0,
      });

      expect(result).toEqual(successfulResult);
      expect(mockParse).toHaveBeenCalledTimes(2);
      expect(warnLogs[0]).toContain("rate_limit");
    });

    it("exhausts retries on persistent transient error and throws OpenAiTransientError", async () => {
      const persistentErr = new OpenAI.InternalServerError(
        503,
        {},
        "Service Unavailable",
        {}
      );
      mockParse.mockRejectedValue(persistentErr);

      await expect(
        generateStructuredOutput({
          messages: [{ role: "user", content: "Persistent failure" }],
          schema: TestSchema,
          name: "test",
          maxRetries: 2,
          retryDelayMs: 0,
        })
      ).rejects.toThrow(OpenAiTransientError);

      // 1 initial + 2 retries = 3 calls
      expect(mockParse).toHaveBeenCalledTimes(3);
      expect(errorLogs.length).toBe(1);
      expect(errorLogs[0]).toContain("[attempt 3/3]");
    });

    it("does NOT retry non-retryable 401 AuthenticationError (fails immediately)", async () => {
      const authErr = new OpenAI.AuthenticationError(
        401,
        {},
        "Invalid API key provided",
        {}
      );
      mockParse.mockRejectedValueOnce(authErr);

      await expect(
        generateStructuredOutput({
          messages: [{ role: "user", content: "Auth test" }],
          schema: TestSchema,
          name: "test",
          maxRetries: 2,
          retryDelayMs: 0,
        })
      ).rejects.toThrow(OpenAiAuthError);

      // Must NOT retry
      expect(mockParse).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry 400 BadRequestError (fails immediately)", async () => {
      const badReqErr = new OpenAI.BadRequestError(
        400,
        {},
        "Invalid model parameters",
        {}
      );
      mockParse.mockRejectedValueOnce(badReqErr);

      await expect(
        generateStructuredOutput({
          messages: [{ role: "user", content: "Bad request" }],
          schema: TestSchema,
          name: "test",
          maxRetries: 2,
          retryDelayMs: 0,
        })
      ).rejects.toThrow(OpenAiInvalidRequestError);

      expect(mockParse).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry schema parsing failures where parsed is null", async () => {
      mockParse.mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: null, // Model output failed schema parse
              refusal: null,
            },
          },
        ],
      });

      await expect(
        generateStructuredOutput({
          messages: [{ role: "user", content: "Schema fail" }],
          schema: TestSchema,
          name: "test",
          maxRetries: 2,
          retryDelayMs: 0,
        })
      ).rejects.toThrow(OpenAiInvalidRequestError);

      expect(mockParse).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry when OpenAI model explicitly refuses the request", async () => {
      mockParse.mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: null,
              refusal: "I cannot fulfill this request due to safety policies.",
            },
          },
        ],
      });

      await expect(
        generateStructuredOutput({
          messages: [{ role: "user", content: "Refusal test" }],
          schema: TestSchema,
          name: "test",
          maxRetries: 2,
          retryDelayMs: 0,
        })
      ).rejects.toThrow(OpenAiRefusalError);

      expect(mockParse).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 5. Security & Sanitization
  // =========================================================================
  describe("Security & Sanitization", () => {
    it("sanitizes API keys and Bearer tokens from error messages", () => {
      const rawSecretKey = "sk-live-abcdef1234567890abcdef1234567890";
      const rawBearer = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
      const dirty = `Failed call with key ${rawSecretKey} using ${rawBearer} header`;

      const cleaned = sanitizeErrorMessage(dirty);

      expect(cleaned).not.toContain(rawSecretKey);
      expect(cleaned).not.toContain(rawBearer);
      expect(cleaned).toContain("[REDACTED_API_KEY]");
      expect(cleaned).toContain("Bearer [REDACTED]");
    });

    it("never logs prompt or document content during failures or retries", async () => {
      const sensitiveDocumentText = "CONFIDENTIAL_MERGER_AGREEMENT_BETWEEN_CORP_A_AND_CORP_B";
      const serverErr = new OpenAI.InternalServerError(500, {}, "Internal server error", {});
      mockParse.mockRejectedValue(serverErr);

      await expect(
        generateStructuredOutput({
          messages: [
            { role: "system", content: "System instructions" },
            { role: "user", content: `Please review: ${sensitiveDocumentText}` },
          ],
          schema: TestSchema,
          name: "confidential_analysis",
          maxRetries: 1,
          retryDelayMs: 0,
        })
      ).rejects.toThrow(OpenAiTransientError);

      // Check all console logs emitted during warning and error
      const allLogs = [...warnLogs, ...errorLogs].join("\n");
      expect(allLogs).not.toContain(sensitiveDocumentText);
      expect(allLogs).not.toContain("Please review");
      expect(allLogs).not.toContain("System instructions");

      // Verify safe metadata is logged instead
      expect(allLogs).toContain("structured_output");
      expect(allLogs).toContain("gpt-4o");
      expect(allLogs).toContain("transient");
    });
  });
});
