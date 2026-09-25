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
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  _clausewiseQueryClient?: ReturnType<typeof postgres>;
  _clausewiseDb?: Db;
};

function createDbInstance(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !connectionString.trim()) {
    throw new Error(
      "[clausewise] DATABASE_URL environment variable is not set. " +
        "Configure a valid PostgreSQL connection string in your environment or .env.local."
    );
  }

  const queryClient =
    globalForDb._clausewiseQueryClient ??
    postgres(connectionString, {
      // Disable prepared statements for compatibility with Supabase Transaction Pooler (Supavisor / port 6543)
      prepare: false,
      // Keep pool bounded per serverless instance while supporting parallel queries within a request
      max: process.env.NODE_ENV === "production" ? 5 : 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb._clausewiseQueryClient = queryClient;
  }

  return drizzle(queryClient, {
    schema,
    logger: process.env.NODE_ENV === "development",
  });
}

export function getDb(): Db {
  if (!globalForDb._clausewiseDb) {
    globalForDb._clausewiseDb = createDbInstance();
  }
  return globalForDb._clausewiseDb;
}

/**
 * Lazily initialized Drizzle database client.
 * Prevents database connections from being opened at module-import time during `next build`.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});


