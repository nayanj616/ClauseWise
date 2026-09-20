/**
 * pgvector extension setup script — ClauseWise
 *
 * Run once against your PostgreSQL database before running migrations:
 *   pnpm db:setup
 *
 * This is separate from Drizzle migrations because the extension must
 * exist before any migration that references the vector type can run.
 * (Phase 0 migrations don't use vector yet, but Phase 3 will.)
 */
import postgres from "postgres";

async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "❌ DATABASE_URL is not set. Copy .env.example to .env.local and set it."
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  try {
    console.log("🔧 Enabling pgvector extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log("✅ pgvector extension enabled.");
  } catch (error) {
    console.error("❌ Failed to enable pgvector:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

setup();

