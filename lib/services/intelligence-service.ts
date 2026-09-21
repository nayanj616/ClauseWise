/**
 * Intelligence Domain Service — ClauseWise
 *
 * Orchestrates the Phase 3 intelligence pipeline:
 * 1. Loads persisted sections and deterministic chunks from DB
 * 2. Deterministically bounds input context to 240,000 chars
 * 3. Invokes OpenAI Structured Outputs with security prompt wrapper
 * 4. Validates output against discriminated Zod schema
 * 5. Runs deterministic evidence validator across all fields
 * 6. Enforces material failure guards before returning result
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  documents,
  documentSections,
  documentChunks,
} from "@/lib/db/schema";
import {
  generateStructuredOutput,
  MODELS,
  TEMPERATURES,
  AI_LIMITS,
} from "@/lib/ai/openai-client";
import { RawAiIntelligenceResponseSchema } from "@/lib/intelligence/schemas";
import {
  buildIntelligenceSystemPrompt,
  buildIntelligenceUserPrompt,
  formatSectionsForIntelligence,
} from "@/lib/intelligence/prompts";
import { validateIntelligenceEvidence } from "@/lib/intelligence/evidence-validator";
import type {
  IntelligenceInputPayload,
  ValidatedIntelligenceResult,
} from "@/lib/intelligence/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class IntelligenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IntelligenceError";
  }
}

export class IntelligenceDocumentNotFoundError extends IntelligenceError {
  constructor(documentId: string) {
    super(`Document not found: ${documentId}`);
    this.name = "IntelligenceDocumentNotFoundError";
  }
}

export class IntelligenceValidationError extends IntelligenceError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IntelligenceValidationError";
  }
}

export class OpenAiInferenceError extends IntelligenceError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OpenAiInferenceError";
  }
}

/**
 * Validates documentId string format (UUID).
 */
function assertValidDocumentId(documentId: string): void {
  if (!documentId || typeof documentId !== "string" || !UUID_REGEX.test(documentId.trim())) {
    throw new IntelligenceError(
      `Invalid document ID provided for intelligence processing: ${documentId}`
    );
  }
}

/**
 * Generates and validates document intelligence from persisted document sections and chunks.
 * Does NOT persist findings — persistence is handled by intelligence-persistence-service.
 *
 * @param documentId - UUID of the target document
 * @returns Grounded and validated intelligence result
 */
export async function analyzeDocumentIntelligence(
  documentId: string
): Promise<ValidatedIntelligenceResult> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

  // 1. Fetch document record
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, cleanDocId))
    .limit(1);

  if (!doc) {
    throw new IntelligenceDocumentNotFoundError(cleanDocId);
  }

  // 2. Fetch persisted sections ordered by orderIndex
  const persistedSections = await db
    .select()
    .from(documentSections)
    .where(eq(documentSections.documentId, cleanDocId))
    .orderBy(asc(documentSections.orderIndex));

  if (!persistedSections || persistedSections.length === 0) {
    throw new IntelligenceValidationError(
      `Cannot analyze document ${cleanDocId}: no extracted sections found in database.`
    );
  }

  // 3. Fetch persisted chunks ordered by chunkIndex
  const persistedChunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, cleanDocId))
    .orderBy(asc(documentChunks.chunkIndex));

  // 4. Assemble intelligence input payload
  const payload: IntelligenceInputPayload = {
    documentId: cleanDocId,
    filename: doc.originalFilename,
    mimeType: doc.mimeType,
    pageCount: doc.pageCount,
    sections: persistedSections.map((s) => ({
      id: s.id,
      orderIndex: s.orderIndex,
      title: s.title,
      content: s.content,
      pageStart: s.pageStart,
      pageEnd: s.pageEnd,
    })),
    chunks: persistedChunks.map((c) => ({
      id: c.id,
      sectionId: c.sectionId,
      chunkIndex: c.chunkIndex,
      content: c.content,
      pageNumber: c.pageNumber,
    })),
  };

  // 5. Format section context and bounding
  const { formattedText, inputBounding } = formatSectionsForIntelligence(payload.sections);
  const systemPrompt = buildIntelligenceSystemPrompt();
  const userPrompt = buildIntelligenceUserPrompt(formattedText, {
    filename: payload.filename,
    pageCount: payload.pageCount,
  });

  // 6. Invoke OpenAI with Structured Outputs via infrastructure adapter
  let rawParsed;
  try {
    rawParsed = await generateStructuredOutput({
      model: MODELS.CHAT,
      temperature: TEMPERATURES.ANALYSIS,
      maxTokens: AI_LIMITS.MAX_COMPLETION_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      schema: RawAiIntelligenceResponseSchema,
      name: "document_intelligence",
    });
  } catch (error) {
    if (error instanceof OpenAiInferenceError) {
      throw error;
    }
    throw new OpenAiInferenceError(
      `OpenAI inference failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  // 7. Validate raw output against evidence validator
  const validatedResult = validateIntelligenceEvidence(rawParsed, payload);
  if (inputBounding) {
    validatedResult.inputBounding = inputBounding;
  }

  // 8. Enforce Material Failure Guard
  // Distinguish candidate rejection (acceptable) from material failure:
  const totalContentLength = payload.sections.reduce(
    (sum, sec) => sum + sec.content.length,
    0
  );

  // If document has substantive text (>500 chars across >=2 sections), but zero findings were valid:
  if (payload.sections.length >= 2 && totalContentLength > 500 && validatedResult.findings.length === 0) {
    throw new IntelligenceValidationError(
      `Intelligence extraction failed to identify valid, evidenced provisions for document ${cleanDocId}. All ${rawParsed.findings.length} candidate findings were rejected during evidence verification.`
    );
  }

  // If document type classification is missing or blank:
  if (!validatedResult.classification.documentType) {
    throw new IntelligenceValidationError(
      `Document classification failed: no document type was determined for ${cleanDocId}.`
    );
  }

  return validatedResult;
}

