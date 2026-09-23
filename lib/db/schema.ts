/**
 * Drizzle ORM schema — ClauseWise
 *
 * Phase 0: User (+ NextAuth support tables) + Document (status-only)
 * Future phases add columns / tables via Drizzle migrations — do not modify
 * existing columns without a migration.
 */
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  primaryKey,
  jsonb,
  index,
  vector,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// NextAuth.js v5 support tables
// These follow the Auth.js Drizzle adapter naming conventions so that OAuth
// providers can be added later without a data migration.
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  /** Hashed with bcrypt. Null for OAuth-only accounts. */
  password: text("password"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

// ---------------------------------------------------------------------------
// Document — Phase 0
// Full storage/extraction columns (original_filename, storage_path, etc.)
// are added in Phase 1. governing_law and jurisdiction are included here
// because they are part of the core data model (docs/DATA_MODEL.md) and
// must be enforced from the moment documents are created.
// ---------------------------------------------------------------------------

export const DOCUMENT_STATUS = [
  "queued",
  "extracting",
  "extracted",
  "chunking",
  "analyzing",
  "ready",
  "error",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

export const documents = pgTable("document", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** User-editable display name; defaults to the original filename in Phase 1 */
  title: text("title").notNull(),
  /** Sanitized original filename */
  originalFilename: text("original_filename").notNull(),
  /** Path in Supabase Storage (never exposed to browser) */
  storagePath: text("storage_path").notNull(),
  /** Validated MIME type (application/pdf or application/vnd.openxmlformats...) */
  mimeType: text("mime_type").notNull(),
  /** File size in bytes */
  fileSizeBytes: integer("file_size_bytes").notNull(),
  /** Total page count if determinable (PDF only; null for DOCX/TXT) */
  pageCount: integer("page_count"),
  status: text("status", { enum: DOCUMENT_STATUS })
    .notNull()
    .default("queued"),
  /** Populated when status = 'error'. Never exposed verbatim to users. */
  errorMessage: text("error_message"),
  /**
   * The governing law named in the document (e.g. "Laws of England and Wales").
   * Null until extracted by the AI pipeline (Phase 3) or entered manually.
   */
  governingLaw: text("governing_law"),
  /**
   * The jurisdiction named in the document (e.g. "England and Wales").
   * Null until extracted by the AI pipeline (Phase 3) or entered manually.
   */
  jurisdiction: text("jurisdiction"),
  /**
   * The classified type of document (e.g. "nda", "employment_agreement").
   * Extracted by the AI pipeline (Phase 3).
   */
  documentType: text("document_type"),
  /**
   * Parties identified in the document.
   * Extracted by the AI pipeline (Phase 3).
   */
  parties: jsonb("parties").$type<Array<{ name: string; role: string | null }>>(),
  /**
   * Additional structured metadata bag (e.g. executiveSummary, inputBounding telemetry).
   */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// DocumentSection — Phase 2
// Represents a detected logical section or clause within a document.
// ---------------------------------------------------------------------------

export const documentSections = pgTable("document_sections", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  /** 0-indexed sequence within document */
  orderIndex: integer("order_index").notNull(),
  /** Section number or identifier matching orderIndex for conceptual compatibility */
  sectionNumber: integer("section_number"),
  /** Section heading or descriptive label */
  title: text("title").notNull(),
  /** Raw extracted text content for this section */
  content: text("content").notNull(),
  /** 1-indexed starting page (PDF only; null for DOCX/TXT) */
  pageStart: integer("page_start"),
  /** 1-indexed ending page (PDF only; null for DOCX/TXT) */
  pageEnd: integer("page_end"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// DocumentChunk — Phase 2 Slice 2.4
// Represents a deterministic, retrieval-ready chunk of text derived from a section.
// Embedding vector column is explicitly deferred to Phase 3.
// ---------------------------------------------------------------------------

export const documentChunks = pgTable("document_chunks", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => documentSections.id, { onDelete: "cascade" }),
  /** 0-indexed sequence within document */
  chunkIndex: integer("chunk_index").notNull(),
  /** Verbatim chunk text produced by deterministic chunker */
  content: text("content").notNull(),
  /**
   * OpenAI text-embedding-3-small 1536-dimensional float vector for pgvector similarity search.
   * Nullable until generated during embedding indexing.
   */
  embedding: vector("embedding", { dimensions: 1536 }),
  /**
   * Source page reference (propagated format-agnostically from section pageStart;
   * null when physical page numbers do not exist, e.g. DOCX/TXT)
   */
  pageNumber: integer("page_number"),
  /**
   * Approximate token count heuristic (Math.ceil(length / 4)).
   * NOTE: Approximate metadata only; must NOT be used for enforcing model token limits.
   */
  tokenCount: integer("token_count"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// DocumentFinding — Phase 3
// Represents an AI-extracted finding grounded in persisted document evidence.
// ---------------------------------------------------------------------------

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

export type FindingType = (typeof FINDING_TYPES)[number];

export const FINDING_IMPORTANCE = [
  "needs_attention",
  "important",
  "informational",
] as const;

export type FindingImportance = (typeof FINDING_IMPORTANCE)[number];

export const documentFindings = pgTable("document_findings", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id")
    .references(() => documentSections.id, { onDelete: "cascade" }),
  chunkId: uuid("chunk_id")
    .references(() => documentChunks.id, { onDelete: "set null" }),
  findingType: text("finding_type", { enum: FINDING_TYPES }).notNull(),
  importance: text("importance", { enum: FINDING_IMPORTANCE }).notNull(),
  label: text("label").notNull(),
  summary: text("summary").notNull(),
  /** Verbatim source excerpt from document content (null only for missing_information) */
  sourceText: text("source_text"),
  /** 1-indexed page number derived from persisted section/chunk coordinates */
  pageNumber: integer("page_number"),
  /** Type-specific structured metadata (e.g. dateValue, amount, conflicting excerpt) */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  documentIdIdx: index("idx_document_findings_document_id").on(t.documentId),
  findingTypeIdx: index("idx_document_findings_finding_type").on(t.findingType),
  importanceIdx: index("idx_document_findings_importance").on(t.importance),
}));

// ---------------------------------------------------------------------------
// Relations (Drizzle relational query API)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  documents: many(documents),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  sections: many(documentSections),
  chunks: many(documentChunks),
  findings: many(documentFindings),
}));

export const documentSectionsRelations = relations(documentSections, ({ one, many }) => ({
  document: one(documents, {
    fields: [documentSections.documentId],
    references: [documents.id],
  }),
  chunks: many(documentChunks),
  findings: many(documentFindings),
}));

export const documentChunksRelations = relations(documentChunks, ({ one, many }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
  section: one(documentSections, {
    fields: [documentChunks.sectionId],
    references: [documentSections.id],
  }),
  findings: many(documentFindings),
}));

export const documentFindingsRelations = relations(documentFindings, ({ one }) => ({
  document: one(documents, {
    fields: [documentFindings.documentId],
    references: [documents.id],
  }),
  section: one(documentSections, {
    fields: [documentFindings.sectionId],
    references: [documentSections.id],
  }),
  chunk: one(documentChunks, {
    fields: [documentFindings.chunkId],
    references: [documentChunks.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types — used throughout the codebase instead of raw DB rows
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentSection = typeof documentSections.$inferSelect;
export type NewDocumentSection = typeof documentSections.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type DocumentFinding = typeof documentFindings.$inferSelect;
export type NewDocumentFinding = typeof documentFindings.$inferInsert;


