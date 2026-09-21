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
  type Document,
} from "@/lib/db/schema";
import {
  generateStructuredOutput,
  MODELS,
  TEMPERATURES,
  AI_LIMITS,
} from "@/lib/ai/openai-client";
import {
  RawAiIntelligenceResponseSchema,
  RawAiClassificationSchema,
  type RawAiClassification,
} from "@/lib/intelligence/schemas";
import {
  buildIntelligenceSystemPrompt,
  buildIntelligenceUserPrompt,
  buildClassificationSystemPrompt,
  buildClassificationUserPrompt,
  formatSectionsForIntelligence,
} from "@/lib/intelligence/prompts";
import {
  validateIntelligenceEvidence,
  validateClassificationEvidence,
  ClassificationEvidenceValidationError,
  isSupportedDocumentType,
} from "@/lib/intelligence/evidence-validator";
import type {
  IntelligenceInputPayload,
  IntelligenceInputSection,
  ValidatedIntelligenceResult,
  ValidatedClassification,
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

// ---------------------------------------------------------------------------
// Slice 3.2 — Document Classification Pipeline
// ---------------------------------------------------------------------------

/**
 * Classifies document content based on persisted sections using grounded LLM analysis (Slice 3.2).
 *
 * Pipeline:
 * Persisted Sections -> Input Bounding -> OpenAI Structured Output -> Zod Validation -> Evidence Validation
 *
 * @param sections - Persisted document sections
 * @param metadata - Document metadata (filename, page count)
 * @param options - Classification options (allowFallbackToGeneral)
 * @returns Grounded and validated classification result
 */
export async function classifyDocumentContent(
  sections: IntelligenceInputSection[],
  metadata: { filename: string; pageCount: number | null },
  options?: { allowFallbackToGeneral?: boolean }
): Promise<ValidatedClassification> {
  if (!sections || sections.length === 0) {
    throw new IntelligenceValidationError(
      "Cannot classify document: no extracted sections provided."
    );
  }

  const { formattedText } = formatSectionsForIntelligence(sections);
  const systemPrompt = buildClassificationSystemPrompt();
  const userPrompt = buildClassificationUserPrompt(formattedText, metadata);

  let rawClassification: RawAiClassification;
  try {
    rawClassification = await generateStructuredOutput<RawAiClassification>({
      model: MODELS.CHAT,
      temperature: TEMPERATURES.ANALYSIS,
      maxTokens: 512,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      schema: RawAiClassificationSchema,
      name: "document_classification",
    });
  } catch (error) {
    if (error instanceof OpenAiInferenceError) {
      throw error;
    }
    throw new OpenAiInferenceError(
      `OpenAI classification inference failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  try {
    return validateClassificationEvidence(rawClassification, sections, {
      allowFallbackToGeneral: options?.allowFallbackToGeneral ?? true,
    });
  } catch (valError) {
    if (valError instanceof ClassificationEvidenceValidationError) {
      throw new IntelligenceValidationError(valError.message, { cause: valError });
    }
    throw valError;
  }
}

/**
 * Loads persisted sections for documentId and performs grounded classification (Slice 3.2).
 *
 * @param documentId - UUID of the target document
 * @param options - Classification options (allowFallbackToGeneral)
 * @returns Validated classification result
 */
export async function classifyDocument(
  documentId: string,
  options?: { allowFallbackToGeneral?: boolean }
): Promise<ValidatedClassification> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, cleanDocId))
    .limit(1);

  if (!doc) {
    throw new IntelligenceDocumentNotFoundError(cleanDocId);
  }

  const persistedSections = await db
    .select()
    .from(documentSections)
    .where(eq(documentSections.documentId, cleanDocId))
    .orderBy(asc(documentSections.orderIndex));

  if (!persistedSections || persistedSections.length === 0) {
    throw new IntelligenceValidationError(
      `Cannot classify document ${cleanDocId}: no extracted sections found in database.`
    );
  }

  const inputSections: IntelligenceInputSection[] = persistedSections.map((s) => ({
    id: s.id,
    orderIndex: s.orderIndex,
    title: s.title,
    content: s.content,
    pageStart: s.pageStart,
    pageEnd: s.pageEnd,
  }));

  return await classifyDocumentContent(
    inputSections,
    {
      filename: doc.originalFilename,
      pageCount: doc.pageCount,
    },
    options
  );
}

/**
 * Persists validated document classification into the database (Slice 3.2).
 *
 * Invariants:
 * 1. Only persists if category is supported.
 * 2. If isStatedInText is true, verifies that sourceText and sectionId are present.
 * 3. Does NOT modify document_sections or document_chunks.
 * 4. Does NOT modify document_findings.
 * 5. Updates document_type and metadata.classification.
 *
 * @param documentId - UUID of the document
 * @param classification - Validated classification result
 * @returns Updated document record
 */
export async function persistDocumentClassification(
  documentId: string,
  classification: ValidatedClassification
): Promise<Document> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

  if (!isSupportedDocumentType(classification.documentType)) {
    throw new IntelligenceValidationError(
      `Cannot persist unsupported document category: "${classification.documentType}".`
    );
  }

  if (
    classification.isStatedInText &&
    (!classification.sourceText || !classification.sectionId)
  ) {
    throw new IntelligenceValidationError(
      `Cannot persist classification claiming isStatedInText without verified sourceText and sectionId.`
    );
  }

  const [existingDoc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, cleanDocId))
    .limit(1);

  if (!existingDoc) {
    throw new IntelligenceDocumentNotFoundError(cleanDocId);
  }

  const existingMetadata =
    existingDoc.metadata && typeof existingDoc.metadata === "object"
      ? (existingDoc.metadata as Record<string, unknown>)
      : {};

  const updatedMetadata: Record<string, unknown> = {
    ...existingMetadata,
    classification: {
      documentType: classification.documentType,
      isStatedInText: classification.isStatedInText,
      sourceText: classification.sourceText,
      sectionId: classification.sectionId,
      sectionOrderIndex: classification.sectionOrderIndex,
      inferenceReason: classification.inferenceReason,
    },
  };

  const [updatedDoc] = await db
    .update(documents)
    .set({
      documentType: classification.documentType,
      metadata: updatedMetadata,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, cleanDocId))
    .returning();

  if (!updatedDoc) {
    throw new IntelligenceError(
      `Failed to update document classification for ${cleanDocId}`
    );
  }

  return updatedDoc;
}

/**
 * Executes grounded classification and persists the validated classification (Slice 3.2).
 *
 * If classification inference or evidence validation fails:
 * - Phase 2 sections and chunks are left 100% untouched.
 * - No invalid or unverified classification is persisted.
 *
 * @param documentId - UUID of the document
 * @param options - Classification options
 * @returns Updated document and validated classification
 */
export async function classifyAndPersistDocument(
  documentId: string,
  options?: { allowFallbackToGeneral?: boolean }
): Promise<{ document: Document; classification: ValidatedClassification }> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

  const classification = await classifyDocument(cleanDocId, options);
  const updatedDoc = await persistDocumentClassification(cleanDocId, classification);

  return { document: updatedDoc, classification };
}


