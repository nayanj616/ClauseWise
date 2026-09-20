/**
 * Database client — ClauseWise
 *
 * Uses the `postgres` npm package (sql-template-literal interface) with
 * Drizzle ORM. Server-side only — never import in client components.
 *
 * The connection is module-level so it is reused across requests in the
 * same server process. In serverless environments each invocation creates
 * a fresh connection (acceptable for MVP scale).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Fail-fast: if DATABASE_URL is missing the app cannot start safely.
// The full env validation in lib/env.ts is the canonical check; this guard
// catches cases where lib/db is imported before lib/env has been validated.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "[clausewise] DATABASE_URL environment variable is not set. " +
      "Copy .env.example to .env.local and set a valid PostgreSQL URL."
  );
}

const queryClient = postgres(process.env.DATABASE_URL, {
  // Limit pool size to avoid overwhelming serverless DB connections
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, {
  schema,
  logger: process.env.NODE_ENV === "development",
});

export type Db = typeof db;

