# ClauseWise — Security Requirements

**Version:** 0.1 (living document)

---

## 1. Threat Model Summary

| Threat | Source | Mitigation |
|---|---|---|
| Credential exposure | Secrets in source/browser | Server-only secrets; `.gitignore`; no env in client bundles |
| Prompt injection | Malicious document content | Untrusted content isolation in prompts |
| Malicious file upload | Attacker-controlled file | Type + MIME + size validation before storage |
| Unauthorized document access | Missing ownership check | User ownership check on every document query |
| API abuse | Unauthenticated endpoints | Rate limiting; session-based auth enforcement (Phase 0) |
| Information disclosure | Stack traces in responses | Safe error handling; generic user-facing errors |
| Data leakage | Over-logging | Avoid logging document content in production |
| Supply chain | Malicious npm packages | Minimal dependencies; pnpm lockfile; audit |

---

## 2. Secrets Management

- All secrets in `.env.local` (never committed)
- `.gitignore` must include: `.env`, `.env.local`, `.env.*.local`
- `OPENAI_API_KEY` accessed only in server-side code
- `DATABASE_URL` accessed only in server-side code
- Supabase service key accessed only in server-side code
- Next.js `NEXT_PUBLIC_` prefix used **only** for values safe to expose (e.g. Supabase public anon key for client-side storage URL construction — with RLS enforced)
- No real secrets in example `.env.example`; use placeholder values only

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

### 3.3 Filename Sanitization
- Strip path traversal characters (`../`, `..\\`)
- Limit filename to ASCII alphanumeric, hyphens, underscores, dots
- Enforce maximum filename length (255 chars)
- Generate a UUID-based storage key; do not use the original filename as the storage path

### 3.4 Validation Order
1. Check `Content-Type` header
2. Check actual MIME type from file bytes (magic bytes check where possible)
3. Check file size
4. Sanitize filename
5. Only then write to storage

### 3.5 Storage Access
- Files are stored in a private Supabase Storage bucket
- Presigned URLs for download are generated server-side, scoped to authenticated user, short-lived
- The browser never receives permanent storage URLs

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

1. Document content is placed in a clearly delimited section of the prompt
2. System prompt explicitly instructs the model to ignore any instructions in document content
3. Structured output (JSON schema) is used to constrain model responses
4. Responses are validated with Zod before rendering; raw AI output is never rendered
5. No document content is concatenated directly into SQL queries (use parameterized queries / Drizzle ORM)

---

## 6. Document Ownership Isolation

Before any document read, write, or AI operation:

```typescript
// Every document access must check ownership
const document = await db.query.documents.findFirst({
  where: and(
    eq(documents.id, documentId),
    eq(documents.userId, currentUserId)  // ownership check
  ),
});

if (!document) {
  throw new NotFoundError('Document not found');
}
```

Authentication is included in Phase 0 (NextAuth.js). Every document access uses
`session.user.id` from the verified server-side session. Never derive ownership
from client-supplied data.

---

## 7. Error Handling

**Server-side:**
- Catch all errors in Server Actions and Route Handlers
- Log full error (with stack) server-side only
- Return generic, user-friendly error message to client

**Client-side:**
- Never display raw error objects or stack traces
- Display a human-readable message
- Provide a recovery action where possible

**Pattern:**
```typescript
try {
  // operation
} catch (error) {
  console.error('[operation-name]', error); // server log only
  return { error: 'Something went wrong. Please try again.' };
}
```

---

## 8. Rate Limiting

To be implemented in Phase 10, but the design must accommodate it:
- Apply rate limiting to all AI-calling endpoints
- Apply rate limiting to file upload endpoint
- Consider per-IP and per-user limits
- Return `429 Too Many Requests` with a `Retry-After` header

---

## 9. HTTP Security Headers

Production deployment must include:

```
Content-Security-Policy: default-src 'self'; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Configure in `next.config.ts` headers.

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

