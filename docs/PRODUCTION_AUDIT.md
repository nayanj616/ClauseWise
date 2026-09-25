# ClauseWise — Production Audit

## 1. Confirmed Issues, Potential Risks, and Unknowns

### Confirmed Issues
- **Missing Landing Page**: The root route (`/`) currently redirects directly to `/dashboard`. There is no public landing page explaining features or linking to authentication.
- **Ollama Integration Pending**: The codebase currently relies on OpenAI APIs (`gpt-4o` and `text-embedding-3-small`) rather than the intended local Ollama models (`qwen3:4b` and `nomic-embed-text`).
- **Embedding Dimensions Mismatch**: The current database schema for `document_chunks.embedding` specifies `vector(1536)` for OpenAI, whereas `nomic-embed-text` produces 768 dimensions.

### Potential Risks
- **Data Migration for Embeddings**: Changing the vector dimensions from 1536 to 768 will require a database migration that will invalidate any existing document embeddings if there are documents currently stored.
- **AI Response Quality**: Transitioning from `gpt-4o` to a smaller 4B local model (`qwen3:4b`) may require substantial prompt tuning or extraction pipeline adjustments to maintain accuracy and structured JSON output capability.
- **OpenAI Remnants**: Fully removing OpenAI dependencies might break some `gpt-4o` specific structural output parsing code if the local Ollama provider does not support the same structured output options out of the box.

### Unknowns
- Are there existing users and documents in the production database that we need to preserve, and if so, how do we handle re-embedding existing documents?
- Is the production PostgreSQL instance properly configured with `pgvector` supporting 768 dimensions?
- Is Ollama properly hosted and accessible from the production environment?

## 2. Infrastructure Identification

- **Authentication Provider**: NextAuth.js v5 (Auth.js) using the Credentials provider with bcrypt hashing.
- **Identity Storage**: PostgreSQL database (tables: `user`, `account`, `session`, `verification_token`) managed via Drizzle ORM.
- **PostgreSQL Provider & Connection Method**: Configured via the `DATABASE_URL` environment variable. Likely Supabase PostgreSQL connected via connection pooling (Transaction Pooler or Direct URL as indicated by `.env.example`).
- **Document Metadata Storage**: PostgreSQL database (`documents`, `document_sections`, `document_chunks`, `document_findings` tables).
- **File Storage Provider**: Supabase Storage (`documents` private bucket).
- **Document Ownership Enforcement**: Application layer validation (strict `eq(documents.userId, cleanUserId)` filtering applied to Drizzle ORM queries).
- **AI Generation Provider**: OpenAI (`gpt-4o` using the official Node SDK).
- **Embedding Provider and Dimensions**: OpenAI (`text-embedding-3-small` with 1536 dimensions).
- **Production Deployment Platform**: Vercel (Next.js App Router, inferred from project configuration and `.env.example`).

## 3. Data Flow Diagram

```mermaid
flowchart TD
    Client[Browser Client]
    Next[Next.js App Router / Server Actions]
    DB[(PostgreSQL Database)]
    Storage[(Supabase Storage)]
    AI[AI Provider API]

    Client <-->|HTTP / Server Actions| Next
    Next <-->|Drizzle ORM| DB
    Next <-->|Supabase Client| Storage
    Next <-->|AI SDK| AI
```

## 4. Prioritized Implementation Plan

1. **Phase 1: Authentication and Data Ownership**
   - Verify the NextAuth credentials implementation works as expected.
   - Verify document ownership filtering in `getDocumentWorkspaceData` and `listUserDocuments` works end-to-end.
   - Add unauthorized access tests if missing.

2. **Phase 2: Landing Page**
   - Create a public landing page at `app/page.tsx` replacing the current redirect.
   - Implement responsive design, feature explanations, and sign-in entry points.
   - Preserve existing dashboard routes.

3. **Phase 3: Ollama Integration**
   - Update `drizzle.config.ts` and `lib/db/schema.ts` to change `document_chunks.embedding` from `vector(1536)` to `vector(768)`.
   - Apply Drizzle migrations (pending approval if destructive to production data).
   - Implement a new `lib/ai/ollama-client.ts` or refactor existing adapters to use Ollama for completions and embeddings.
   - Ensure credentials/URLs are safely configured via environment variables.

4. **Phase 4: Production Validation**
   - Run unit and E2E tests against the new setup.
   - Validate document upload, extraction, analysis, and retrieval flows.

## 5. Checks Requiring Production Access

- **PostgreSQL / pgvector**: Verify `pgvector` is installed and functioning on the production database. Check if there are existing embeddings that need to be recomputed.
- **Supabase Storage**: Verify the `documents` bucket exists, is set to private, and the service role key works.
- **Environment Variables**: Verify all necessary credentials (e.g., `NEXTAUTH_SECRET`, `SUPABASE_URL`, Ollama URL/API key if applicable) are correctly provisioned in Vercel.

---

## 6. Phase 3 Pre-Migration Safeguards & Live Ollama Verification

All five mandatory pre-migration safeguards have been verified without modifying or writing to `public.*` tables on the remote Supabase PostgreSQL database:

1. **Remote Database Backup & Restore Verification**:
   - Exported full read-only snapshot of `public.*` tables (`1` user metadata record, `2` documents, `52` sections, `52` chunks, `0` findings, `0` conversations, `0` messages, `0` actions) to an external scratch backup (`remote_db_backup_20260925.json`, `88,045` bytes, SHA-256 `6d66977d7617003cdabf8ef09cb7922ebe907160feed8e1f4e84886df465df5f`).
   - Restored all rows into an isolated disposable `pgvector` table set (`pg_temp.disposable_*`) and verified 100% row-count and SHA-256 digest parity for both `document_sections` (`c8eedcab9baee074dae3eb270c911419f44048a4f268697a0b1b8482681be408`) and `document_chunks` (`8fe1f60e39fcd177ffcc11e2f0430f1d5420e86fe2a8e0f4382e1408c55cdf8e`).
2. **Existing Documents & Extracted Text Integrity**:
   - Confirmed both existing documents (`030819fa-d926-4d2f-bae2-1be3ed69a85c` and `6143029b-dbfb-4889-8421-7fcdc39c6106`, `New_York_Services_Agreement.pdf`, `5` pages each) have all `26` sections (`10,495` chars) and `26` chunks (`10,495` chars) intact and non-empty (`52` sections and `52` chunks total, `0` embedded chunks).
3. **Disposable `pgvector` Migration & Similarity Search Verification**:
   - Tested `ALTER TABLE ... ALTER COLUMN embedding SET DATA TYPE vector(768)` (`lib/db/migrations/0009_great_vision.sql`) on `pg_temp.disposable_document_chunks` (`vector(1536)` → `vector(768)`).
   - Persisted all `52` live `nomic-embed-text` 768-dimensional vectors (`embedded: 52 / 52`) into the disposable table and executed SQL `pgvector` cosine distance queries (`<=>`), retrieving exact top-1 Governing Law (Section 13, Page 3, similarity `0.7537`) and Termination (Section 9, Page 3, similarity `0.7851`) clauses.
4. **OpenAI Embeddings Dimension Guard (`vector(768)`)**:
   - `embedText()` and `embedBatch()` in `lib/embeddings/embeddings-client.ts` immediately throw `EmbeddingDimensionError` **before** making any network call if `EMBEDDING_PROVIDER` is not `"ollama"` (`openAiNetworkCallsAttempted: 0`).
   - `generateAndPersistChunkEmbeddings()` in `lib/services/chunk-persistence-service.ts`, `retrieveDocumentEvidence()` in `lib/services/retrieval-service.ts`, and PostgreSQL `pgvector` (`expected 768 dimensions, not 1536`) all enforce 768 dimensions.
5. **Migration & Embedding Persistence Rollback Recovery**:
   - Verified rollback on the disposable `pgvector` table (`UPDATE ... SET embedding = NULL; ALTER TABLE ... ALTER COLUMN embedding SET DATA TYPE vector(1536);`), confirming the column type reverts to `vector(1536)` with 100% SHA-256 chunk text parity (`postRollbackChunkDigestMatchesOriginal: true`).
   - Re-verified that `public.document_chunks` on the remote Supabase database remains completely untouched (`public_col_type: "vector(1536)"`, `public_total_chunks: 52`, `public_embedded_chunks: 0`).

