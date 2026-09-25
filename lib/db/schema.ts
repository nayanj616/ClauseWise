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
  boolean,
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
}, (t) => ({
  userIdIdx: index("idx_documents_user_id").on(t.userId),
  statusIdx: index("idx_documents_status").on(t.status),
  createdAtIdx: index("idx_documents_created_at").on(t.createdAt),
}));

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
}, (t) => ({
  documentIdIdx: index("idx_document_sections_document_id").on(t.documentId),
  orderIndexIdx: index("idx_document_sections_order_index").on(t.documentId, t.orderIndex),
}));

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
   * Ollama nomic-embed-text 768-dimensional float vector for pgvector similarity search.
   * Nullable until generated during embedding indexing.
   */
  embedding: vector("embedding", { dimensions: 768 }),
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
}, (t) => ({
  documentIdIdx: index("idx_document_chunks_document_id").on(t.documentId),
  sectionIdIdx: index("idx_document_chunks_section_id").on(t.sectionId),
}));

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
// Conversation & Message — Phase 5 Slice 5.4
// Represents a persistent document-scoped Q&A thread and its turns.
// ---------------------------------------------------------------------------

export interface QaCitation {
  chunkId: string;
  documentId: string;
  sectionId: string | null;
  pageNumber: number | null;
  sourceText: string;
  similarity: number;
}

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New Conversation"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    documentIdIdx: index("idx_conversations_document_id").on(t.documentId),
    userIdIdx: index("idx_conversations_user_id").on(t.userId),
    userDocIdx: index("idx_conversations_user_doc").on(t.userId, t.documentId),
  })
);

export const MESSAGE_ROLES = ["user", "assistant"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const messages = pgTable(
  "messages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: MESSAGE_ROLES }).notNull(),
    content: text("content").notNull(),
    /** Authoritative verified citations (null for user messages and uncited assistant answers) */
    citations: jsonb("citations").$type<QaCitation[]>(),
    /** Grounding flags (null for user messages; booleans only for completed assistant answers) */
    hasSufficientEvidence: boolean("has_sufficient_evidence"),
    isGrounded: boolean("is_grounded"),
    citationValidationPassed: boolean("citation_validation_passed"),
    /** Extra telemetry or streaming metrics */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdIdx: index("idx_messages_conversation_id").on(t.conversationId),
    conversationCreatedAtIdx: index("idx_messages_convo_created").on(t.conversationId, t.createdAt),
  })
);

// ---------------------------------------------------------------------------
// Action — Phase 7
// Represents a trackable legal review item derived from document findings.
// Lifecycle: open <-> completed.
// ---------------------------------------------------------------------------

export const ACTION_STATUSES = ["open", "completed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const actions = pgTable(
  "actions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id").references(() => documentFindings.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: ACTION_STATUSES }).notNull().default("open"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { mode: "date" }),
  },
  (t) => ({
    userIdIdx: index("idx_actions_user_id").on(t.userId),
    documentIdIdx: index("idx_actions_document_id").on(t.documentId),
    findingIdIdx: index("idx_actions_finding_id").on(t.findingId),
    statusIdx: index("idx_actions_status").on(t.status),
  })
);

// ---------------------------------------------------------------------------
// Relations (Drizzle relational query API)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  documents: many(documents),
  conversations: many(conversations),
  actions: many(actions),
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
  conversations: many(conversations),
  actions: many(actions),
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

export const documentFindingsRelations = relations(documentFindings, ({ one, many }) => ({
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
  actions: many(actions),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  document: one(documents, {
    fields: [conversations.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const actionsRelations = relations(actions, ({ one }) => ({
  document: one(documents, {
    fields: [actions.documentId],
    references: [documents.id],
  }),
  finding: one(documentFindings, {
    fields: [actions.findingId],
    references: [documentFindings.id],
  }),
  user: one(users, {
    fields: [actions.userId],
    references: [users.id],
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
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;


