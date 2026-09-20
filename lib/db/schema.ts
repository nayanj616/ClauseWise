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
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

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

export const documentsRelations = relations(documents, ({ one }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred types — used throughout the codebase instead of raw DB rows
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

