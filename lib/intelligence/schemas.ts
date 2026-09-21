/**
 * Zod Schemas for Document Intelligence — ClauseWise
 *
 * Implements strict runtime validation for OpenAI Structured Outputs
 * and internal domain representations.
 *
 * Contract Invariants:
 * 1. Discriminated union on findingType:
 *    - Substantive findings strictly require non-empty sourceText and valid sectionOrderIndex.
 *    - missing_information allows null sourceText but requires expectedTopic and ruleBasis.
 * 2. All factual metadata (parties, governingLaw, jurisdiction, documentType) requires evidence.
 * 3. Numerical legal risk scores are strictly prohibited.
 */

import { z } from "zod";

export const FINDING_TYPES = [
  "key_term",
  "attention",
  "obligation",
  "ambiguity",
  "date",
  "financial_term",
  "inconsistency",
  "missing_information",
] as const;

export const SUBSTANTIVE_FINDING_TYPES = [
  "key_term",
  "attention",
  "obligation",
  "ambiguity",
  "date",
  "financial_term",
  "inconsistency",
] as const;

export const FindingTypeSchema = z.enum(FINDING_TYPES);
export const SubstantiveFindingTypeSchema = z.enum(SUBSTANTIVE_FINDING_TYPES);

export const FINDING_IMPORTANCE = [
  "needs_attention",
  "important",
  "informational",
] as const;

export const FindingImportanceSchema = z.enum(FINDING_IMPORTANCE);

export type FindingType = z.infer<typeof FindingTypeSchema>;
export type FindingImportance = z.infer<typeof FindingImportanceSchema>;

export const FindingMetadataSchema = z
  .object({
    party: z.string().nullable(),
    dateValue: z.string().nullable(),
    dateDescription: z.string().nullable(),
    amount: z.string().nullable(),
    currency: z.string().nullable(),
    frequency: z.string().nullable(),
    conflictingSectionOrderIndex: z.number().int().nonnegative().nullable(),
    conflictingSourceText: z.string().nullable(),
    expectedTopic: z.string().nullable(),
    ruleBasis: z.string().nullable(),
  })
  .strict()
  .nullable();

/**
 * Substantive findings (key_term, attention, obligation, ambiguity, date, financial_term, inconsistency).
 * Verbatim sourceText and sectionOrderIndex are strictly required.
 */
export const SubstantiveAiFindingSchema = z
  .object({
    findingType: SubstantiveFindingTypeSchema,
    importance: FindingImportanceSchema,
    label: z.string().min(1).max(120),
    summary: z.string().min(1).max(1000),
    sourceText: z.string().min(1, "sourceText must not be empty for substantive findings"),
    sectionOrderIndex: z.number().int().nonnegative("sectionOrderIndex must be a non-negative integer"),
    metadata: FindingMetadataSchema,
  })
  .strict();

/**
 * Missing information findings.
 * sourceText is null, expectedTopic and ruleBasis are strictly required.
 */
export const MissingInfoAiFindingSchema = z
  .object({
    findingType: z.literal("missing_information"),
    importance: FindingImportanceSchema,
    label: z.string().min(1).max(120),
    summary: z.string().min(1).max(1000),
    sourceText: z.string().nullable(),
    sectionOrderIndex: z.number().int().nonnegative().nullable(),
    expectedTopic: z.string().min(1, "expectedTopic must be specified from expectation catalog"),
    ruleBasis: z.string().min(1, "ruleBasis must explain why this provision is expected"),
    metadata: FindingMetadataSchema,
  })
  .strict();

/**
 * Discriminated union of findings on 'findingType'.
 */
export const RawAiFindingSchema = z.discriminatedUnion("findingType", [
  SubstantiveAiFindingSchema,
  MissingInfoAiFindingSchema,
]);

/**
 * Party extracted from document text with verifiable source evidence.
 */
export const RawAiPartySchema = z
  .object({
    name: z.string().min(1).max(200),
    role: z.string().max(100).nullable(),
    sourceText: z.string().min(1, "Supporting source text required for party"),
    sectionOrderIndex: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Governing law extracted from document with verifiable source evidence.
 */
export const RawAiGoverningLawSchema = z
  .object({
    law: z.string().min(1).max(200),
    sourceText: z.string().min(1, "Supporting source text required for governing law"),
    sectionOrderIndex: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Jurisdiction extracted from document with verifiable source evidence.
 */
export const RawAiJurisdictionSchema = z
  .object({
    jurisdiction: z.string().min(1).max(200),
    sourceText: z.string().min(1, "Supporting source text required for jurisdiction"),
    sectionOrderIndex: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Notable section identified for overview.
 */
export const RawAiImportantSectionSchema = z
  .object({
    sectionOrderIndex: z.number().int().nonnegative(),
    title: z.string().min(1).max(200),
    reason: z.string().min(1).max(500),
  })
  .strict();

/**
 * Document type classification with explicit provenance:
 * either stated directly in document text (with evidence) or inferred with explicit reason.
 */
export const RawAiClassificationSchema = z
  .object({
    documentType: z.string().min(1).max(100),
    isStatedInText: z.boolean(),
    sourceText: z.string().nullable(),
    sectionOrderIndex: z.number().int().nonnegative().nullable(),
    inferenceReason: z.string().nullable(),
  })
  .strict()
  .refine(
    (val) => {
      if (val.isStatedInText) {
        return !!val.sourceText && typeof val.sectionOrderIndex === "number";
      }
      return !!val.inferenceReason && val.inferenceReason.trim().length > 0;
    },
    {
      message:
        "Classification must have sourceText & sectionOrderIndex if stated in text, or inferenceReason if inferred.",
    }
  );

/**
 * Complete AI Intelligence Response Schema (OpenAI Structured Output contract).
 * Output bounded to max 30 findings to prevent token overflows.
 */
export const RawAiIntelligenceResponseSchema = z
  .object({
    classification: RawAiClassificationSchema,
    parties: z.array(RawAiPartySchema),
    governingLaw: RawAiGoverningLawSchema.nullable(),
    jurisdiction: RawAiJurisdictionSchema.nullable(),
    executiveSummary: z.string().min(10).max(3000),
    importantSections: z.array(RawAiImportantSectionSchema),
    findings: z.array(RawAiFindingSchema).max(30, "Maximum of 30 findings permitted"),
  })
  .strict();

export type RawAiIntelligenceResponse = z.infer<typeof RawAiIntelligenceResponseSchema>;
export type RawAiFinding = z.infer<typeof RawAiFindingSchema>;
export type SubstantiveAiFinding = z.infer<typeof SubstantiveAiFindingSchema>;
export type MissingInfoAiFinding = z.infer<typeof MissingInfoAiFindingSchema>;
export type RawAiParty = z.infer<typeof RawAiPartySchema>;
export type RawAiGoverningLaw = z.infer<typeof RawAiGoverningLawSchema>;
export type RawAiJurisdiction = z.infer<typeof RawAiJurisdictionSchema>;
export type RawAiImportantSection = z.infer<typeof RawAiImportantSectionSchema>;
export type RawAiClassification = z.infer<typeof RawAiClassificationSchema>;
