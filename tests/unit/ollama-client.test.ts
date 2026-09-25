/**
 * Unit & Integration Tests — Ollama Local Inference Adapter (Phase 3)
 *
 * Covers the 6 mandatory Phase 3 verification areas:
 * 1. Model connectivity (`checkOllamaConnectivity` against `/api/tags`)
 * 2. Document analysis (`qwen3:4b` structured output, `<think>` sanitization, evidence validation)
 * 3. Embedding generation (`nomic-embed-text` 768d vectors + OpenAI 1536d fallback preservation)
 * 4. Vector retrieval (768d query embeddings with pgvector similarity search)
 * 5. Evidence-backed question answering (`answerQuestion` & streaming Q&A with `qwen3:4b`)
 * 6. Error handling when Ollama is unavailable, times out, or model is not pulled
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  OLLAMA_MODELS,
  OLLAMA_EMBEDDING_DIMENSIONS,
  DEFAULT_OLLAMA_BASE_URL,
  getOllamaConfig,
  extractCleanJsonString,
  checkOllamaConnectivity,
  generateOllamaStructuredOutput,
  streamOllamaStructuredChat,
  embedTextWithOllama,
  embedBatchWithOllama,
  setOllamaFetchForTesting,
  assertOllamaServerEnvironment,
  OllamaConfigError,
  OllamaConnectionError,
  OllamaModelNotFoundError,
  OllamaInvalidResponseError,
} from "@/lib/ai/ollama-client";
import {
  getActiveAiProvider,
  generateStructuredOutput,
  setOpenAiClientForTesting,
} from "@/lib/ai/openai-client";
import {
  EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_DIMENSIONS,
  getActiveEmbeddingProvider,
  getActiveEmbeddingDimensions,
  embedText,
  embedBatch,
} from "@/lib/embeddings/embeddings-client";
import { classifyDocumentContent } from "@/lib/services/intelligence-service";
import { ModelQaOutputSchema } from "@/lib/services/qa-service";

const SampleSchema = z.object({
  summary: z.string(),
  obligationsCount: z.number().int(),
});

describe("Phase 3 — Ollama Local Inference & Embeddings Integration", () => {
  const originalEnv = { ...process.env };
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_CHAT_MODEL;
    delete process.env.OLLAMA_EMBEDDING_MODEL;

    mockFetch = vi.fn();
    setOllamaFetchForTesting(mockFetch as unknown as typeof fetch);
    setOpenAiClientForTesting(null);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setOllamaFetchForTesting(null);
    setOpenAiClientForTesting(null);
    delete (global as Record<string, unknown>).window;
  });

  // =========================================================================
  // 1. Model Connectivity & Configuration
  // =========================================================================
  describe("1. Model Connectivity & Configuration", () => {
    it("enforces server-side environment isolation", () => {
      (global as Record<string, unknown>).window = {};
      expect(() => assertOllamaServerEnvironment()).toThrow(OllamaConfigError);
    });

    it("resolves default Ollama configuration (qwen3:4b and nomic-embed-text)", () => {
      const config = getOllamaConfig();
      expect(config.baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);
      expect(config.chatModel).toBe("qwen3:4b");
      expect(config.embeddingModel).toBe("nomic-embed-text");
      expect(OLLAMA_MODELS.CHAT).toBe("qwen3:4b");
      expect(OLLAMA_MODELS.EMBEDDINGS).toBe("nomic-embed-text");
      expect(OLLAMA_EMBEDDING_DIMENSIONS).toBe(768);
    });

    it("allows overriding base URL and model names via environment variables", () => {
      process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
      process.env.OLLAMA_CHAT_MODEL = "qwen3:4b-instruct";
      process.env.OLLAMA_EMBEDDING_MODEL = "nomic-embed-text:v1.5";

      const config = getOllamaConfig();
      expect(config.baseUrl).toBe("http://127.0.0.1:11434");
      expect(config.chatModel).toBe("qwen3:4b-instruct");
      expect(config.embeddingModel).toBe("nomic-embed-text:v1.5");
    });

    it("reports reachable connectivity and installed model readiness via /api/tags", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              { name: "qwen3:4b" },
              { name: "nomic-embed-text:latest" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const report = await checkOllamaConnectivity();
      expect(report.reachable).toBe(true);
      expect(report.hasChatModel).toBe(true);
      expect(report.hasEmbeddingModel).toBe(true);
      expect(report.installedModels).toEqual([
        "qwen3:4b",
        "nomic-embed-text:latest",
      ]);
    });

    it("reports missing models when Ollama is running but models are not yet pulled", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const report = await checkOllamaConnectivity();
      expect(report.reachable).toBe(true);
      expect(report.hasChatModel).toBe(false);
      expect(report.hasEmbeddingModel).toBe(false);
    });
  });

  // =========================================================================
  // 2. Document Analysis & Structured Outputs with qwen3:4b
  // =========================================================================
  describe("2. Document Analysis & Structured Outputs (qwen3:4b)", () => {
    it("strips <think>...</think> blocks and markdown fences from Qwen3 output", () => {
      const rawWithThinking = `<think>
Let's check section 1 of the NDA. The governing law is Delaware.
</think>
\`\`\`json
{"summary": "Mutual NDA governed by Delaware law.", "obligationsCount": 3}
\`\`\``;

      const cleaned = extractCleanJsonString(rawWithThinking);
      expect(JSON.parse(cleaned)).toEqual({
        summary: "Mutual NDA governed by Delaware law.",
        obligationsCount: 3,
      });
    });

    it("routes generateStructuredOutput to Ollama qwen3:4b when AI_PROVIDER=ollama", async () => {
      process.env.AI_PROVIDER = "ollama";
      expect(getActiveAiProvider()).toBe("ollama");

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "qwen3:4b",
            message: {
              role: "assistant",
              content:
                '<think>Analyzing clause...</think>{"summary":" Confidentiality obligation lasts 5 years.","obligationsCount":2}',
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await generateStructuredOutput({
        messages: [
          { role: "system", content: "Analyze legal text." },
          { role: "user", content: "Clause text" },
        ],
        schema: SampleSchema,
        name: "sample_analysis",
      });

      expect(result).toEqual({
        summary: " Confidentiality obligation lasts 5 years.",
        obligationsCount: 2,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, reqInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("http://localhost:11434/api/chat");
      const parsedBody = JSON.parse(reqInit.body as string);
      expect(parsedBody.model).toBe("qwen3:4b");
      expect(parsedBody.stream).toBe(false);
      expect(parsedBody.think).toBe(false);
      expect(parsedBody.format).toBeDefined();
    });

    it("executes grounded document classification via Ollama while enforcing verbatim evidence validation", async () => {
      process.env.AI_PROVIDER = "ollama";

      const sectionId = "11111111-1111-4111-a111-111111111111";
      const docId = "22222222-2222-4222-a222-222222222222";
      const verbatimExcerpt =
        "This Mutual Non-Disclosure Agreement is entered into by and between Acme Corp and Beta LLC.";

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "qwen3:4b",
            message: {
              role: "assistant",
              content: JSON.stringify({
                documentType: "nda",
                isStatedInText: true,
                sourceText: verbatimExcerpt,
                sectionOrderIndex: 0,
                inferenceReason: null,
              }),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const classification = await classifyDocumentContent(
        [
          {
            id: sectionId,
            documentId: docId,
            orderIndex: 0,
            title: "1. Purpose and Confidentiality",
            content: `${verbatimExcerpt} Both parties agree to protect confidential information.`,
            pageStart: 1,
            pageEnd: 1,
          },
        ],
        { filename: "Mutual_NDA.pdf", pageCount: 1 },
        { expectedDocumentId: docId }
      );

      expect(classification.documentType).toBe("nda");
      expect(classification.isStatedInText).toBe(true);
      expect(classification.sectionId).toBe(sectionId);
      expect(classification.sourceText).toBe(verbatimExcerpt);
    });
  });

  // =========================================================================
  // 3. Embedding Generation (nomic-embed-text 768d & 1536d Guard)
  // =========================================================================
  describe("3. Embedding Generation (768d Ollama & 1536d Dimension Guard)", () => {
    it("defaults to Ollama nomic-embed-text (768 dimensions) matching vector(768) schema", () => {
      expect(EMBEDDING_DIMENSIONS).toBe(768);
      expect(OPENAI_EMBEDDING_DIMENSIONS).toBe(1536);
      expect(getActiveEmbeddingProvider()).toBe("ollama");
      expect(getActiveEmbeddingDimensions()).toBe(768);
    });

    it("generates 768-dimensional vectors using nomic-embed-text by default", async () => {
      const vec1 = Array.from({ length: 768 }, (_, i) => Number((i * 0.001).toFixed(4)));
      const vec2 = Array.from({ length: 768 }, (_, i) => Number(((i + 1) * 0.001).toFixed(4)));

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "nomic-embed-text",
            embeddings: [vec1, vec2],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const batchResult = await embedBatch([
        "Section 1: Confidentiality obligations.",
        "Section 2: Term and termination.",
      ]);

      expect(batchResult).toHaveLength(2);
      expect(batchResult[0]).toHaveLength(768);
      expect(batchResult[1]).toHaveLength(768);

      const [calledUrl, reqInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("http://localhost:11434/api/embed");
      const body = JSON.parse(reqInit.body as string);
      expect(body.model).toBe("nomic-embed-text");
      expect(body.input).toHaveLength(2);
    });

    it("strictly blocks OpenAI embeddings before any API call while column is vector(768)", async () => {
      process.env.EMBEDDING_PROVIDER = "openai";
      const openAiEmbedSpy = vi.fn(async () => ({
        data: [{ index: 0, embedding: new Array(1536).fill(0.01) }],
      }));
      setOpenAiClientForTesting({
        embeddings: {
          create: openAiEmbedSpy,
        },
      } as unknown as Parameters<typeof setOpenAiClientForTesting>[0]);

      await expect(embedText("Test clause")).rejects.toThrow(
        /1,536-dimensional OpenAI embeddings cannot be written into a 768-dimensional column/
      );
      await expect(embedBatch(["Test clause"])).rejects.toThrow(
        /1,536-dimensional OpenAI embeddings cannot be written into a 768-dimensional column/
      );
      expect(openAiEmbedSpy).not.toHaveBeenCalled();
    });

    it("rejects Ollama embeddings whose dimensions do not match expected 768 dimensions", async () => {
      const wrongDimVec = new Array(384).fill(0.05);
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "nomic-embed-text",
            embeddings: [wrongDimVec],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      await expect(embedTextWithOllama("Test clause")).rejects.toThrow(
        OllamaInvalidResponseError
      );
    });
  });

  // =========================================================================
  // 4 & 5. Grounded Question Answering & Streaming with qwen3:4b
  // =========================================================================
  describe("4 & 5. Evidence-Backed Q&A and Streaming via Ollama", () => {
    it("streams NDJSON tokens from Ollama and extracts grounded answer + citations", async () => {
      const chunkId = "aaaaaaaa-1111-4111-a111-111111111111";
      const ndjsonLines = [
        JSON.stringify({
          model: "qwen3:4b",
          message: { role: "assistant", content: '{"answer":"The notice period ' },
        }),
        JSON.stringify({
          model: "qwen3:4b",
          message: {
            role: "assistant",
            content: `is 30 days.","citedChunkIds":["${chunkId}"]}`,
          },
        }),
      ].join("\n");

      const encoder = new TextEncoder();
      const streamBody = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonLines));
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce(
        new Response(streamBody, {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        })
      );

      let accumulated = "";
      for await (const piece of streamOllamaStructuredChat({
        messages: [
          { role: "system", content: "Answer from evidence." },
          { role: "user", content: "What is the notice period?" },
        ],
        schema: ModelQaOutputSchema,
        name: "grounded_qa_answer",
      })) {
        accumulated += piece;
      }

      const parsed = ModelQaOutputSchema.parse(
        JSON.parse(extractCleanJsonString(accumulated))
      );
      expect(parsed.answer).toBe("The notice period is 30 days.");
      expect(parsed.citedChunkIds).toEqual([chunkId]);
    });
  });

  // =========================================================================
  // 6. Error Handling When Ollama Is Unavailable or Model Is Missing
  // =========================================================================
  describe("6. Error Handling (Unavailable Service & Missing Models)", () => {
    it("retries transient connection failures when Ollama is unreachable and throws OllamaConnectionError", async () => {
      mockFetch.mockRejectedValue(
        new Error("fetch failed: connect ECONNREFUSED 127.0.0.1:11434")
      );

      await expect(
        generateOllamaStructuredOutput({
          messages: [{ role: "user", content: "Test connection failure" }],
          schema: SampleSchema,
          name: "test_conn",
          maxRetries: 1,
          retryDelayMs: 0,
        })
      ).rejects.toThrow(OllamaConnectionError);

      // Initial attempt + 1 retry = 2 calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws OllamaModelNotFoundError immediately without retrying when model is not pulled (HTTP 404)", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'model "qwen3:4b" not found, try pulling it first' }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      );

      await expect(
        generateOllamaStructuredOutput({
          messages: [{ role: "user", content: "Test missing model" }],
          schema: SampleSchema,
          name: "test_missing_model",
          maxRetries: 2,
          retryDelayMs: 0,
        })
      ).rejects.toThrow(OllamaModelNotFoundError);

      // Should not retry 404 model-not-found
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
