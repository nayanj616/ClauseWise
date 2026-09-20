/**
 * OpenAI chat client boundary — ClauseWise
 *
 * SERVER-SIDE ONLY — OPENAI_API_KEY must never reach the browser.
 *
 * This module exposes the configured OpenAI client and shared constants.
 * Phase 3 will add prompt composition, structured output parsing, and
 * the analysis/QA service functions that call this client.
 *
 * Do not implement AI calls here in Phase 0.
 */
import OpenAI from "openai";
import { env } from "@/lib/env";

/**
 * Model identifiers — centralised so that changing the model requires
 * one edit, not a grep across many files.
 */
export const MODELS = {
  /** Primary model for analysis, QA, and generation */
  CHAT: "gpt-4o",
  /** Embeddings model — 1536-dimensional output, maps to vector(1536) in pgvector */
  EMBEDDINGS: "text-embedding-3-small",
} as const;

/**
 * Temperature settings from AI_BEHAVIOR.md
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
 * Singleton OpenAI client.
 * All AI calls in the application go through this instance.
 */
export const openaiClient = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  // maxRetries: 2 is the SDK default — acceptable for Phase 0
});

