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
  documentFindings,
  type Document,
  type DocumentFinding,
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
  RawAiStructuredExtractionSchema,
  RawAiFindingsResponseSchema,
  type RawAiClassification,
  type RawAiStructuredExtraction,
  type RawAiFindingsResponse,
} from "@/lib/intelligence/schemas";
import {
  buildIntelligenceSystemPrompt,
  buildIntelligenceUserPrompt,
  buildClassificationSystemPrompt,
  buildClassificationUserPrompt,
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  buildFindingsSystemPrompt,
  buildFindingsUserPrompt,
  formatSectionsForIntelligence,
} from "@/lib/intelligence/prompts";
import {
  validateIntelligenceEvidence,
  validateClassificationEvidence,
  validateStructuredExtractionEvidence,
  validateFindingEvidence,
  validateFindingsListEvidence,
  EvidenceValidationError,
  ClassificationEvidenceValidationError,
  StructuredExtractionValidationError,
  FindingEvidenceValidationError,
  type ValidateStructuredExtractionOptions,
  type ValidateFindingsOptions,
  isSupportedDocumentType,
} from "@/lib/intelligence/evidence-validator";
import type {
  IntelligenceInputPayload,
  IntelligenceInputSection,
  IntelligenceInputChunk,
  ValidatedIntelligenceResult,
  ValidatedClassification,
  ValidatedStructuredExtraction,
  ValidatedFinding,
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
      documentId: s.documentId,
      orderIndex: s.orderIndex,
      title: s.title,
      content: s.content,
      pageStart: s.pageStart,
      pageEnd: s.pageEnd,
    })),
    chunks: persistedChunks.map((c) => ({
      id: c.id,
      documentId: c.documentId,
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
  options?: { allowFallbackToGeneral?: boolean; expectedDocumentId?: string }
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
      expectedDocumentId: options?.expectedDocumentId,
    });
  } catch (valError) {
    if (valError instanceof EvidenceValidationError) {
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
    documentId: s.documentId,
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
    {
      ...options,
      expectedDocumentId: cleanDocId,
    }
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

// ---------------------------------------------------------------------------
// Slice 3.3 — Structured Extraction Pipeline
// ---------------------------------------------------------------------------

/**
 * Extracts structured metadata from persisted sections using grounded LLM inference (Slice 3.3).
 *
 * Pipeline:
 * Persisted Sections -> Input Bounding -> OpenAI Structured Output -> Zod Validation -> Evidence Validation
 *
 * @param sections - Persisted document sections
 * @param metadata - Document metadata (filename, page count)
 * @param options - Validation options (e.g. strict)
 * @returns Grounded and validated structured extraction result
 */
export async function extractDocumentContent(
  sections: IntelligenceInputSection[],
  metadata: { filename: string; pageCount: number | null },
  options?: ValidateStructuredExtractionOptions
): Promise<ValidatedStructuredExtraction> {
  if (!sections || sections.length === 0) {
    throw new IntelligenceValidationError(
      "Cannot extract document metadata: no extracted sections provided."
    );
  }

  const { formattedText } = formatSectionsForIntelligence(sections);
  const systemPrompt = buildExtractionSystemPrompt();
  const userPrompt = buildExtractionUserPrompt(formattedText, metadata);

  let rawExtraction: RawAiStructuredExtraction;
  try {
    rawExtraction = await generateStructuredOutput<RawAiStructuredExtraction>({
      model: MODELS.CHAT,
      temperature: TEMPERATURES.ANALYSIS,
      maxTokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      schema: RawAiStructuredExtractionSchema,
      name: "document_structured_extraction",
    });
  } catch (error) {
    if (error instanceof OpenAiInferenceError) {
      throw error;
    }
    throw new OpenAiInferenceError(
      `OpenAI structured extraction inference failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  try {
    return validateStructuredExtractionEvidence(rawExtraction, sections, options);
  } catch (valError) {
    if (valError instanceof EvidenceValidationError) {
      throw new IntelligenceValidationError(valError.message, { cause: valError });
    }
    throw valError;
  }
}

/**
 * Loads persisted sections for documentId and performs grounded structured extraction (Slice 3.3).
 *
 * @param documentId - UUID of the target document
 * @param options - Validation options
 * @returns Validated structured extraction result
 */
export async function extractDocumentMetadata(
  documentId: string,
  options?: ValidateStructuredExtractionOptions
): Promise<ValidatedStructuredExtraction> {
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
      `Cannot extract metadata for document ${cleanDocId}: no extracted sections found in database.`
    );
  }

  const inputSections: IntelligenceInputSection[] = persistedSections.map((s) => ({
    id: s.id,
    documentId: s.documentId,
    orderIndex: s.orderIndex,
    title: s.title,
    content: s.content,
    pageStart: s.pageStart,
    pageEnd: s.pageEnd,
  }));

  return await extractDocumentContent(
    inputSections,
    {
      filename: doc.originalFilename,
      pageCount: doc.pageCount,
    },
    {
      ...options,
      documentId: cleanDocId,
    }
  );
}

/**
 * Persists validated structured extraction into the database (Slice 3.3).
 *
 * Invariants:
 * 1. Replaces previous extraction metadata (idempotent / no duplicate parties or dates).
 * 2. Updates documents.parties, documents.governingLaw, documents.jurisdiction.
 * 3. Stores complete evidenced collections in documents.metadata.extraction.
 * 4. Leaves document_sections, document_chunks, and document_findings completely untouched.
 *
 * @param documentId - UUID of the document
 * @param extraction - Validated structured extraction result
 * @returns Updated document record
 */
export async function persistDocumentExtraction(
  documentId: string,
  extraction: ValidatedStructuredExtraction
): Promise<Document> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

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

  const simplifiedParties = extraction.parties.map((p) => ({
    name: p.name,
    role: p.role,
  }));

  const updatedMetadata: Record<string, unknown> = {
    ...existingMetadata,
    extraction: {
      parties: extraction.parties,
      governingLaw: extraction.governingLaw,
      jurisdiction: extraction.jurisdiction,
      importantDates: extraction.importantDates,
      financialTerms: extraction.financialTerms,
      importantSections: extraction.importantSections,
    },
    importantDates: extraction.importantDates,
    financialTerms: extraction.financialTerms,
    importantSections: extraction.importantSections,
  };

  const [updatedDoc] = await db
    .update(documents)
    .set({
      parties: simplifiedParties,
      governingLaw: extraction.governingLaw?.law ?? null,
      jurisdiction: extraction.jurisdiction?.jurisdiction ?? null,
      metadata: updatedMetadata,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, cleanDocId))
    .returning();

  if (!updatedDoc) {
    throw new IntelligenceError(
      `Failed to update document structured extraction for ${cleanDocId}`
    );
  }

  return updatedDoc;
}

/**
 * Executes grounded extraction and persists validated metadata (Slice 3.3).
 *
 * If extraction or evidence validation fails:
 * - Phase 2 sections and chunks are left 100% untouched.
 * - No invalid or unverified metadata is persisted.
 *
 * @param documentId - UUID of the document
 * @param options - Extraction options
 * @returns Updated document and validated extraction
 */
export async function extractAndPersistDocumentMetadata(
  documentId: string,
  options?: ValidateStructuredExtractionOptions
): Promise<{ document: Document; extraction: ValidatedStructuredExtraction }> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

  const extraction = await extractDocumentMetadata(cleanDocId, options);
  const updatedDoc = await persistDocumentExtraction(cleanDocId, extraction);

  return { document: updatedDoc, extraction };
}

// ---------------------------------------------------------------------------
// Slice 3.4 — Document Findings Pipeline
// ---------------------------------------------------------------------------

/**
 * Generates and validates document findings from document sections (Slice 3.4).
 *
 * Pipeline:
 * Persisted Sections → formatSectionsForIntelligence → OpenAI Structured Output →
 * Zod validation (RawAiFindingsResponseSchema) → validateFindingsListEvidence → Validated findings.
 *
 * Invariants:
 * 1. The LLM is never the source of truth.
 * 2. Every substantive finding must have verifiable sourceText in the referenced section.
 * 3. missing_information findings must match the Core Provision Catalog for the documentType.
 * 4. Material Completeness Guard: substantive documents (>500 chars, >=2 sections) with 0 valid
 *    findings throw IntelligenceValidationError rather than reporting false success.
 *
 * @param sections - Persisted document sections
 * @param metadata - Document metadata (filename, pageCount)
 * @param documentType - Resolved document classification type (defaults to 'general')
 * @param chunks - Optional persisted document chunks for retrieval correlation
 * @param options - Validation options (strict, etc.)
 * @returns Validated findings and rejected candidate count
 */
export async function generateFindingsContent(
  sections: IntelligenceInputSection[],
  metadata: { filename: string; pageCount: number | null },
  documentType: string = "general",
  chunks?: IntelligenceInputChunk[],
  options?: ValidateFindingsOptions & { documentId?: string }
): Promise<{ findings: ValidatedFinding[]; rejectedCount: number }> {
  if (!sections || sections.length === 0) {
    throw new IntelligenceValidationError(
      "Cannot generate findings: no document sections provided."
    );
  }

  // 1. Format sections deterministically with length bounds
  const { formattedText } = formatSectionsForIntelligence(sections);

  // 2. Build security-wrapped system and user prompts
  const systemPrompt = buildFindingsSystemPrompt(documentType);
  const userPrompt = buildFindingsUserPrompt(formattedText, metadata);

  // 3. Request structured output from OpenAI
  let rawFindingsResponse: RawAiFindingsResponse;
  try {
    rawFindingsResponse = await generateStructuredOutput<RawAiFindingsResponse>({
      model: MODELS.CHAT,
      temperature: TEMPERATURES.ANALYSIS,
      maxTokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      schema: RawAiFindingsResponseSchema,
      name: "document_findings_generation",
    });
  } catch (error) {
    if (error instanceof OpenAiInferenceError) {
      throw error;
    }
    throw new OpenAiInferenceError(
      `OpenAI findings inference failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  // 4. Validate evidence deterministically against persisted sections and chunks
  let validationResult: { validatedFindings: ValidatedFinding[]; rejectedCount: number };
  try {
    validationResult = validateFindingsListEvidence(
      rawFindingsResponse.findings,
      sections,
      documentType,
      chunks,
      options
    );
  } catch (valError) {
    if (valError instanceof EvidenceValidationError) {
      throw new IntelligenceValidationError(valError.message, { cause: valError });
    }
    throw valError;
  }

  // 5. Enforce Material Failure Guard (Phase 3.0 contract invariant)
  const totalContentLength = sections.reduce(
    (sum, sec) => sum + (sec.content?.length ?? 0),
    0
  );

  if (
    sections.length >= 2 &&
    totalContentLength > 500 &&
    validationResult.validatedFindings.length === 0
  ) {
    throw new IntelligenceValidationError(
      `Finding generation failed to identify valid, evidenced findings for document ${options?.documentId ?? "unspecified"}. All ${rawFindingsResponse.findings.length} candidate findings were rejected during evidence verification.`
    );
  }

  return {
    findings: validationResult.validatedFindings,
    rejectedCount: validationResult.rejectedCount,
  };
}

/**
 * Loads persisted sections and chunks for documentId and generates grounded document findings (Slice 3.4).
 *
 * @param documentId - UUID of the target document
 * @param options - Validation options
 * @returns Validated findings and rejected candidate count
 */
export async function generateDocumentFindings(
  documentId: string,
  options?: ValidateFindingsOptions
): Promise<{ findings: ValidatedFinding[]; rejectedCount: number }> {
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
      `Cannot generate findings for document ${cleanDocId}: no extracted sections found in database.`
    );
  }

  // 3. Fetch persisted chunks ordered by chunkIndex for retrieval correlation
  const persistedChunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, cleanDocId))
    .orderBy(asc(documentChunks.chunkIndex));

  const inputSections: IntelligenceInputSection[] = persistedSections.map((s) => ({
    id: s.id,
    documentId: s.documentId,
    orderIndex: s.orderIndex,
    title: s.title,
    content: s.content,
    pageStart: s.pageStart,
    pageEnd: s.pageEnd,
  }));

  const inputChunks: IntelligenceInputChunk[] = persistedChunks.map((c) => ({
    id: c.id,
    documentId: c.documentId,
    sectionId: c.sectionId,
    chunkIndex: c.chunkIndex,
    content: c.content,
    pageNumber: c.pageNumber,
  }));

  return await generateFindingsContent(
    inputSections,
    {
      filename: doc.originalFilename,
      pageCount: doc.pageCount,
    },
    doc.documentType ?? "general",
    inputChunks,
    {
      ...options,
      documentId: cleanDocId,
    }
  );
}

/**
 * Persists validated document findings into PostgreSQL via Drizzle ORM (Slice 3.4).
 *
 * Invariants:
 * 1. Reprocessing idempotency: wipes prior document_findings for this document before inserting.
 * 2. Atomic transaction: deletes and inserts succeed or roll back together.
 * 3. Authoritative references: uses database sectionId and chunkId derived during evidence validation.
 * 4. Isolation: leaves document_sections and document_chunks 100% untouched.
 *
 * @param documentId - UUID of the target document
 * @param findings - Validated findings array passing schema and evidence checks
 * @returns Array of persisted DocumentFinding records
 */
export async function persistDocumentFindings(
  documentId: string,
  findings: ValidatedFinding[]
): Promise<DocumentFinding[]> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

  try {
    return await db.transaction(async (tx) => {
      // 1. Verify document exists
      const [existingDoc] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, cleanDocId))
        .limit(1);

      if (!existingDoc) {
        throw new IntelligenceDocumentNotFoundError(cleanDocId);
      }

      // 2. Delete prior findings for this document (reprocessing idempotency)
      await tx
        .delete(documentFindings)
        .where(eq(documentFindings.documentId, cleanDocId));

      // 3. Insert new findings if any
      if (findings.length === 0) {
        return [];
      }

      const findingRows = findings.map((f) => ({
        documentId: cleanDocId,
        sectionId: f.sectionId,
        chunkId: f.chunkId,
        findingType: f.findingType,
        importance: f.importance,
        label: f.label,
        summary: f.summary,
        sourceText: f.sourceText,
        pageNumber: f.pageNumber,
        metadata: f.metadata,
      }));

      return await tx
        .insert(documentFindings)
        .values(findingRows)
        .returning();
    });
  } catch (error) {
    if (error instanceof IntelligenceError) {
      throw error;
    }
    throw new IntelligenceError(
      `Failed to persist findings for document ${cleanDocId}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

/**
 * Executes grounded findings generation and atomically persists validated findings (Slice 3.4).
 *
 * Invariants:
 * - If generation or evidence validation fails, no findings are written.
 * - Phase 2 sections and chunks remain untouched under all conditions.
 * - Reprocessing safely replaces previous findings without duplicates.
 *
 * @param documentId - UUID of the target document
 * @param options - Validation options
 * @returns Persisted findings and count of rejected candidate findings
 */
export async function generateAndPersistDocumentFindings(
  documentId: string,
  options?: ValidateFindingsOptions
): Promise<{ findings: DocumentFinding[]; rejectedCount: number }> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

  const { findings: validatedFindings, rejectedCount } =
    await generateDocumentFindings(cleanDocId, options);

  const persistedFindings = await persistDocumentFindings(
    cleanDocId,
    validatedFindings
  );

  return { findings: persistedFindings, rejectedCount };
}



