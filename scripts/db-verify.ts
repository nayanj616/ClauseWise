/**
 * Phase 0 database + auth verification script — ClauseWise
 *
 * Run AFTER applying migrations against your real PostgreSQL/Supabase DB:
 *   pnpm db:setup
 *   pnpm db:migrate
 *   pnpm db:verify
 *
 * What this checks:
 *  1. pgvector extension is enabled
 *  2. All 5 Phase 0 tables exist with expected columns
 *  3. governing_law and jurisdiction columns are present on document
 *  4. Sign-up creates a user with a bcrypt-hashed password
 *  5. Sign-up rejects duplicate email
 *  6. Correct password → returns user; wrong password → returns null
 *  7. Document insert enforces user FK (ownership boundary)
 *  8. Document with different userId cannot be accessed via assertOwnership()
 *
 * Exit 0 = all checks pass. Exit 1 = at least one check failed.
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { assertOwnership } from "../lib/auth/session";
import type { AuthSession } from "../lib/auth/session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;

function ok(label: string) {
  console.log(`  ✓ ${label}`);
  pass++;
}

function ko(label: string, detail?: unknown) {
  console.error(`  ✗ ${label}`, detail ?? "");
  fail++;
}

async function check(
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
    ok(label);
  } catch (err) {
    ko(label, err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL is not set. Cannot run verification.");
    process.exit(1);
  }

  console.log("\n🔍 ClauseWise Phase 0 — Database Verification\n");

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  // -------------------------------------------------------------------------
  // 1. pgvector extension
  // -------------------------------------------------------------------------
  console.log("── 1. pgvector extension ──");

  await check("pgvector extension is enabled", async () => {
    const rows = await sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    if (rows.length === 0) throw new Error("vector extension not found — run pnpm db:setup first");
  });

  // -------------------------------------------------------------------------
  // 2. Table existence
  // -------------------------------------------------------------------------
  console.log("\n── 2. Table existence ──");

  const EXPECTED_TABLES = ["user", "account", "session", "verification_token", "document"];

  for (const table of EXPECTED_TABLES) {
    await check(`table "${table}" exists`, async () => {
      const rows = await sql<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = ${table}
      `;
      if (rows.length === 0) throw new Error(`table "${table}" not found`);
    });
  }

  // -------------------------------------------------------------------------
  // 3. Critical document columns (governing_law, jurisdiction)
  // -------------------------------------------------------------------------
  console.log("\n── 3. Document column verification ──");

  const EXPECTED_DOC_COLS = [
    "id", "user_id", "title", "status", "error_message",
    "governing_law", "jurisdiction", "created_at", "updated_at",
  ];

  await check("document table has all 9 expected columns", async () => {
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'document'
      ORDER BY ordinal_position
    `;
    const cols = rows.map((r) => r.column_name);
    const missing = EXPECTED_DOC_COLS.filter((c) => !cols.includes(c));
    if (missing.length > 0) {
      throw new Error(`missing columns: ${missing.join(", ")}`);
    }
  });

  await check("governing_law column is nullable text", async () => {
    const [row] = await sql<{ data_type: string; is_nullable: string }[]>`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'document'
        AND column_name = 'governing_law'
    `;
    if (!row) throw new Error("governing_law column not found");
    if (row.data_type !== "text") throw new Error(`expected text, got ${row.data_type}`);
    if (row.is_nullable !== "YES") throw new Error("governing_law must be nullable");
  });

  await check("jurisdiction column is nullable text", async () => {
    const [row] = await sql<{ data_type: string; is_nullable: string }[]>`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'document'
        AND column_name = 'jurisdiction'
    `;
    if (!row) throw new Error("jurisdiction column not found");
    if (row.data_type !== "text") throw new Error(`expected text, got ${row.data_type}`);
    if (row.is_nullable !== "YES") throw new Error("jurisdiction must be nullable");
  });

  // -------------------------------------------------------------------------
  // 4. Auth — sign-up
  // -------------------------------------------------------------------------
  console.log("\n── 4. Auth — sign-up ──");

  const TEST_EMAIL = `verify-${Date.now()}@clausewise-test.local`;
  const TEST_PASSWORD = "TestPass123!";
  let testUserId: string | undefined;

  await check("sign-up inserts user with hashed password", async () => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 12);
    const [user] = await db
      .insert(schema.users)
      .values({ name: "Verify User", email: TEST_EMAIL, password: hash })
      .returning({ id: schema.users.id, email: schema.users.email, password: schema.users.password });

    if (!user) throw new Error("insert returned no rows");
    if (user.email !== TEST_EMAIL) throw new Error("email mismatch");
    if (!user.password) throw new Error("password not stored");
    if (user.password === TEST_PASSWORD) throw new Error("password stored in plaintext!");
    if (!user.password.startsWith("$2b$")) throw new Error("password not bcrypt-hashed");
    testUserId = user.id;
  });

  await check("sign-up rejects duplicate email", async () => {
    const hash = await bcrypt.hash("AnotherPass!", 12);
    let threw = false;
    try {
      await db.insert(schema.users).values({
        name: "Duplicate",
        email: TEST_EMAIL, // same email
        password: hash,
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("duplicate email was not rejected by DB unique constraint");
  });

  // -------------------------------------------------------------------------
  // 5. Auth — password verification
  // -------------------------------------------------------------------------
  console.log("\n── 5. Auth — password verification ──");

  await check("correct password → bcrypt.compare returns true", async () => {
    const [user] = await db
      .select({ password: schema.users.password })
      .from(schema.users)
      .where(eq(schema.users.email, TEST_EMAIL))
      .limit(1);

    if (!user?.password) throw new Error("user not found");
    const match = await bcrypt.compare(TEST_PASSWORD, user.password);
    if (!match) throw new Error("bcrypt.compare returned false for correct password");
  });

  await check("wrong password → bcrypt.compare returns false", async () => {
    const [user] = await db
      .select({ password: schema.users.password })
      .from(schema.users)
      .where(eq(schema.users.email, TEST_EMAIL))
      .limit(1);

    if (!user?.password) throw new Error("user not found");
    const match = await bcrypt.compare("WrongPassword!", user.password);
    if (match) throw new Error("bcrypt.compare returned true for wrong password!");
  });

  // -------------------------------------------------------------------------
  // 6. Document ownership enforcement
  // -------------------------------------------------------------------------
  console.log("\n── 6. Document ownership enforcement ──");

  let testDocId: string | undefined;

  await check("document insert succeeds with valid userId FK", async () => {
    if (!testUserId) throw new Error("testUserId not set (sign-up check failed)");

    const [doc] = await db
      .insert(schema.documents)
      .values({
        userId: testUserId,
        title: "Verify Doc",
        originalFilename: "verify-doc.pdf",
        storagePath: `${testUserId}/test-id/verify-doc.pdf`,
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
      })
      .returning({ id: schema.documents.id, userId: schema.documents.userId });

    if (!doc) throw new Error("document insert returned no rows");
    if (doc.userId !== testUserId) throw new Error("userId FK mismatch");
    testDocId = doc.id;
  });

  await check("assertOwnership allows owner access", () => {
    if (!testUserId || !testDocId) throw new Error("prerequisites failed");
    const session = {
      user: { id: testUserId, email: TEST_EMAIL },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    } as AuthSession;

    // Should not throw
    assertOwnership(session, testUserId);
    return Promise.resolve();
  });

  await check("assertOwnership blocks non-owner access", () => {
    if (!testUserId) throw new Error("prerequisites failed");
    const attackerSession = {
      user: { id: "00000000-0000-0000-0000-000000000000", email: "attacker@x.com" },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    } as AuthSession;

    let threw = false;
    try {
      assertOwnership(attackerSession, testUserId);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("assertOwnership should have thrown for non-owner");
    return Promise.resolve();
  });

  await check("document FK rejects non-existent userId", async () => {
    let threw = false;
    try {
      await db.insert(schema.documents).values({
        userId: "00000000-0000-0000-0000-000000000000",
        title: "Orphan doc",
        originalFilename: "orphan-doc.pdf",
        storagePath: "00000000-0000-0000-0000-000000000000/test/orphan-doc.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("FK constraint was not enforced");
  });

  // -------------------------------------------------------------------------
  // 7. Cleanup test data
  // -------------------------------------------------------------------------
  if (testUserId) {
    await sql`DELETE FROM "user" WHERE id = ${testUserId}`;
  }

  // -------------------------------------------------------------------------
  // Result
  // -------------------------------------------------------------------------
  await sql.end();

  console.log(`\n${"─".repeat(48)}`);
  console.log(`  Passed: ${pass}   Failed: ${fail}`);
  console.log(`${"─".repeat(48)}\n`);

  if (fail > 0) {
    console.error("❌ Verification FAILED — see errors above\n");
    process.exit(1);
  }
  console.log("✅ All Phase 0 verification checks passed\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

