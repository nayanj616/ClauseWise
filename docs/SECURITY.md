# ClauseWise — Security Requirements

**Version:** 0.1 (living document)

---

## 1. Threat Model & Control Status Summary

| Threat | Source | Mitigation | Implementation Status |
|---|---|---|---|
| Credential exposure | Secrets in source/browser | Server-only secrets (`lib/env.ts`); `.gitignore`; zero secrets in `.next/static` client bundles or `Dockerfile` build args | **Implemented** |
| Prompt injection | Malicious document content | Untrusted content delimiters (`=== UNTRUSTED DOCUMENT ... ===`), JSON schema enforcement, deterministic excerpt verification | **Implemented** |
| Malicious file upload | Attacker-controlled file | MIME, extension, 10 MB size limit, `%PDF-`/`%%EOF` magic bytes, OOXML ZIP inspection, and path sanitization before storage | **Implemented** |
| Unauthorized document access | Cross-tenant ID enumeration | Strict `and(eq(id, docId), eq(userId, session.user.id))` queries with uniform anti-oracle `404` responses | **Implemented** |
| Unauthenticated API access | Anonymous requests | NextAuth.js v5 JWT session checks (`401 Unauthorized` on API routes; `/sign-in` redirect on protected pages) | **Implemented** |
| Application-level API rate limiting | High-frequency request abuse | Per-IP / per-user `429 Too Many Requests` rate limiting on AI and upload endpoints | **Planned** *(Edge payload cap `25 MB` in `Caddyfile` and `OLLAMA_NUM_PARALLEL=2` in `docker-compose.yml` are implemented)* |
| Information disclosure | Stack traces / DB URLs in responses | Domain error wrappers with credential/URI redaction (`sanitizeErrorMessage`) and generic `500` client messages | **Implemented** |
| Internal inference exposure | Unprotected local Ollama port | Loopback-only binding (`127.0.0.1:11434`) locally; unexposed internal Docker bridge network (`clausewise_internal`) in `docker-compose.yml` | **Implemented** |

---

## 2. Secrets Management (Implemented)

- All secrets in `.env.local` (never committed)
- `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`
- `DATABASE_URL`, `NEXTAUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `OLLAMA_BASE_URL`, and `OPENAI_API_KEY` are accessed exclusively in server-side modules (`lib/env.ts`, `lib/ai/ollama-client.ts`, `lib/ai/openai-client.ts`)
- Client-bundle isolation (`assertOllamaServerEnvironment()` and `next build` bundle verification) guarantees zero server secrets leak into `.next/static`
- `Dockerfile` multi-stage build accepts only public `NEXT_PUBLIC_*` and `NEXTAUTH_URL` build arguments; runtime secrets are injected strictly at container startup
- No real secrets in `.env.example`; placeholder values only

---

## 3. File Upload Security

Every uploaded file must pass this validation chain **before** being written to storage:

### 3.1 Allowed MIME Types
```typescript
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
```

### 3.2 File Size Limit
```typescript
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
```

### 3.3 Filename Sanitization & Path Confinement
- Decode URI components to prevent encoded traversal tricks (`%2e%2e%2f`)
- Strip path traversal characters (`../`, `..\\`)
- Strip null bytes (`\0`) and control characters (`[\x00-\x1F\x7F]`)
- Limit filename to ASCII alphanumeric, hyphens, underscores, dots
- Guard against Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, etc.)
- Prevent ambiguous double extensions (e.g. `malware.exe.pdf` → `malware_exe.pdf`)
- Enforce maximum filename stem length (100 chars) while preserving validated extension
- Construct server-controlled storage path strictly within user namespace: `${userId}/${documentId}/${sanitizedFilename}`

### 3.4 Validation Order & Authority
1. Verify authentication via server-side session (`session.user.id`)
2. Validate client-reported MIME type and extension
3. Validate file size (0 < size ≤ 10 MB)
4. Inspect buffer magic bytes and document structure:
   - PDF: `%PDF-` header and `%%EOF` trailer marker
   - DOCX: valid ZIP archive containing `[Content_Types].xml` and `word/` directory
5. Sanitize filename and generate server-controlled UUID storage path
6. Client-side validation exists strictly for UX feedback; the server remains authoritative

### 3.5 Storage Privacy & Consistency
- Files are stored in a private Supabase Storage bucket (`documents`)
- No public URLs or credentials exposed to client code
- Storage write occurs before database record insertion
- **Rollback handling:** If database insertion fails after storage succeeds, the uploaded storage object is deleted immediately to prevent orphaned files
- Document ownership is strictly bound to authenticated `session.user.id` (any client-supplied ownership identifiers are ignored)

---

## 4. API Input Validation

Every Server Action and Route Handler must:

1. Parse request body through a **Zod schema** before use
2. Return a typed error on validation failure (no schema details leaked)
3. Never use unvalidated input in database queries or AI prompts

Example pattern:
```typescript
const schema = z.object({
  documentId: z.string().uuid(),
  question: z.string().min(1).max(2000),
});

const parsed = schema.safeParse(requestBody);
if (!parsed.success) {
  return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
}
```

---

## 5. Prompt Injection Defense

Document text is user-provided and must be treated as untrusted:

1. Document content is placed in a clearly delimited section of the prompt (`=== UNTRUSTED DOCUMENT CONTENT ===` / `=== UNTRUSTED DOCUMENT EVIDENCE START ===`)
2. System prompt explicitly instructs the model to ignore any instructions in document content
3. Structured output (JSON schema) is used to constrain model responses
4. Responses are validated with Zod and verified deterministically against persisted section/chunk text (`verifySectionExcerptEvidence` and `citedChunkIds` lookup) before rendering; raw AI output is never rendered
5. No document content is concatenated directly into SQL queries (parameterized queries via Drizzle ORM)

---

## 6. Document Ownership Isolation & Anti-Oracle Protection (Implemented)

Before any document read, write, retrieval, Q&A, action, prep, or comparison operation:

```typescript
// Every document access checks ownership against session.user.id
const [doc] = await db
  .select()
  .from(documents)
  .where(
    and(
      eq(documents.id, cleanDocId),
      eq(documents.userId, cleanUserId) // verified session.user.id
    )
  )
  .limit(1);
```

- **Anti-Oracle Guarantee:** Across `retrieval-service.ts`, `qa-service.ts`, `conversation-service.ts`, `action-service.ts`, `preparation-service.ts`, and `comparison-service.ts`, querying a document, section, conversation, or action that belongs to another user throws the **exact same access error** (`404 Not Found: "Document not found or access denied"`) as querying a non-existent UUID. This prevents cross-tenant resource enumeration.

---

## 7. Error Handling (Implemented)

**Server-side:**
- Catch all errors in Server Actions and Route Handlers
- Redact connection strings (`postgres://...`), API keys (`sk-...`), and Bearer tokens via `sanitizeErrorMessage()` before logging
- Return generic, user-friendly error messages to the client

**Client-side:**
- Never display raw error objects or stack traces
- Render dedicated error boundaries (`app/error.tsx`, `app/(app)/error.tsx`, `DocumentErrorState`) with recovery actions

---

## 8. Rate Limiting & Edge Protection

- **Application-Level Rate Limiting — Planned (Not Yet Implemented):**
  - Per-IP and per-user rate limiting returning `429 Too Many Requests` with a `Retry-After` header on AI-calling endpoints (`/api/documents/[documentId]/ask`, `/api/documents/[documentId]/conversations/.../messages`) and `/api/documents/upload` remains **Planned** for production rollout.
- **Edge & Container Concurrency Controls — Implemented:**
  - `Caddyfile` enforces `request_body { max_size 25MB }` at the reverse-proxy edge (returning `413 Payload Too Large` before oversized payloads reach Next.js) and bounds header/body timeouts.
  - `docker-compose.yml` bounds Ollama concurrent inference queues via `OLLAMA_NUM_PARALLEL=2` and container CPU/memory limits.

---

## 9. HTTP Security Headers (Implemented)

Configured in [`next.config.ts`](../next.config.ts) across all routes (`/(.*)`):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```


---

## 10. Dependency Management

- Use `pnpm audit` before each release
- Minimise dependencies; every dependency is a potential attack surface
- Never introduce dependencies that are not clearly necessary
- Lock file (`pnpm-lock.yaml`) must be committed

---

## 11. .gitignore Requirements

The `.gitignore` must exclude:
```
.env
.env.local
.env.*.local
node_modules/
.next/
uploads/
*.db
*.sqlite
*.pem
*.key
dist/
.vercel/
```

---

## 12. Logging Policy

- Do **not** log document text content in production
- Do log document IDs, user IDs, status transitions, and errors
- Use structured logging (JSON) for machine-readability
- Never log API keys, tokens, or passwords

