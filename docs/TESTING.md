# ClauseWise — Testing Strategy

**Version:** 0.1 (living document)

---

## 1. Philosophy

Testing is part of each vertical slice, not a final-phase retrofit.
Each phase ships with tests appropriate to its scope.

Priority order (aligned with competition scoring):
1. Business logic correctness
2. AI response validation
3. Security edge cases
4. Integration correctness
5. E2E happy paths

---

## 2. Test Toolchain

| Tool | Purpose |
|---|---|
| **Vitest** | Unit and integration tests (TypeScript-native, fast) |
| **Playwright** | E2E browser tests |
| `@testing-library/react` | React component tests (if needed) |
| Vitest coverage | `v8` provider for coverage reports |

---

## 3. Test Layers

### 3.1 Unit Tests (Vitest)

Target: Pure functions with no external dependencies.

Cover:
- File validation logic (MIME type check, magic bytes `%PDF-` / OOXML ZIP inspection, size check, filename sanitization, Windows reserved names)
- Zod schema validation (valid and invalid inputs)
- Client-side pre-upload validation and API client error handling
- React upload component accessibility and interaction states
- Text chunking algorithm (Phase 2+)
- Finding parsing / Zod schema validation for AI responses (Phase 3+)
- Date extraction and parsing (Phase 3+)
- Comparison difference detection helpers (Phase 6+)
- Error formatting utilities and session helpers

Location: `tests/unit/`

**Current Test Suite (Phase 4 Complete: 521 unit/integration tests across 29 suites + 25 Playwright E2E tests):**
- **Phase 0 & 1 Baseline (85 tests across 7 suites):** Upload validation, client upload, upload route, document service, session, UI, and utilities.
- **Phase 2 Extraction & Viewer (103 tests across 6 suites):** `extraction-service.test.ts`, `extraction-persistence.test.ts`, `chunking-service.test.ts`, `chunk-persistence-service.test.ts`, `document-workspace-service.test.ts`, `document-workspace-ui.test.tsx`.
- **Phase 3 Intelligence & Workspace (225 tests across 11 suites):** `intelligence-schemas.test.ts`, `openai-client.test.ts`, `document-classification.test.ts`, `structured-extraction.test.ts`, `document-findings.test.ts`, `expectation-catalog.test.ts`, `evidence-validator.test.ts`, `intelligence-service.test.ts`, `intelligence-persistence.test.ts`, `intelligence-workspace.test.tsx`, `phase3-final-verification.test.tsx`.
- **Phase 4 Evidence Display & Navigation (108 tests across 5 suites + 25 E2E tests):** `retrieval-service.test.ts` (19 tests), `evidence-highlighting.test.tsx` (19 tests), `document-workspace-navigation.test.tsx` (19 tests), `linked-views.test.tsx` (21 tests), `phase4-final-verification.test.tsx` (30 tests), `evidence-navigation.spec.ts` (14 Playwright tests), `auth.spec.ts` (11 Playwright tests).

### Phase 1 Detail:
- `tests/unit/document-validation.test.ts` (34 tests):
  - Magic byte verification: PDF (`%PDF-`), DOCX (ZIP `PK\x03\x04` and OOXML `[Content_Types].xml`).
  - Size boundary validation: ≤ 10 MB accepted, > 10 MB rejected.
  - Extension and MIME mismatch rejection.
  - Filename sanitization: path traversal (`../`, `..\`), absolute paths, URI-encoded directory traversals (`%2e%2e%2f`), null bytes, Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), double extension prevention, punctuation normalization, length truncation (≤ 255 chars).
- `tests/unit/upload-client.test.ts` (14 tests):
  - Client-side validation: file selection, size limits, format restrictions.
  - FormData construction and API response parsing.
  - Error normalization for network failures, validation errors, and server errors.
- `tests/unit/document-service.test.ts` (5 tests):
  - Upload orchestration to private Supabase Storage (`clausewise-documents`).
  - Creation of Document record with `status: queued`.
  - Storage rollback: verified deletion of uploaded storage object if database insert fails.
- `tests/unit/upload-route.test.ts` (9 tests):
  - `POST /api/documents/upload` authentication enforcement (401 for unauthenticated requests).
  - Session-derived ownership (document `userId` taken exclusively from `session.user.id`).
  - FormData validation (400 for missing file or unexpected fields).
  - Integration with server validation (400 with sanitized error for invalid files).
  - HTTP 201 response with created document metadata.
  - Clean error masking (500 without leaking database or internal stack traces).
- `tests/unit/document-upload-ui.test.tsx` (3 tests):
  - Accessible upload container: `role="region"` with accessible name (`aria-label="Document upload"`).
  - Screen reader announcements: `aria-live="polite"` status area with file selection, uploading, and error states.
  - Accessible interactive elements (file input with programmatic trigger).
- `tests/unit/session.test.ts` (8 tests):
  - `requireSession()`, `assertOwnership()`, unauthorized redirects and assertions.
- `tests/unit/utils.test.ts` (12 tests):
  - `cn()`, `formatDate()`, `truncate()` utilities.

### 3.2 Integration Tests (Vitest)

Target: Service layer with real or mocked dependencies.

**Database:** Integration tests use a **real PostgreSQL test database** with the
pgvector extension enabled. SQLite is not used — it does not support pgvector and
would not verify the queries that run in production. A dedicated test database
(e.g. `clausewise_test`) is created once and wiped between test runs using
Drizzle migrations.

Cover:
- `document-service` — upload, rollback, read, delete (real DB; mock Supabase Storage client)
- `extraction-service` — `processDocument()` status transitions, section creation (real DB)
- `analysis-service` — finding creation and retrieval (real DB; mock OpenAI client)
- `retrieval-service` — vector search (real DB with pgvector; mock embedding client)
- `comparison-service` — difference creation and retrieval (real DB; mock OpenAI)
- `action-service` — CRUD operations (real DB)
- Storage operations — mock Supabase Storage client only; do not hit real bucket in tests
- OpenAI client — always mocked in integration tests; real calls reserved for manual QA

Location: `tests/integration/`

### 3.3 E2E Tests (Playwright)

Target: Critical user journeys in a real browser.

Cover:
- Upload a valid PDF document
- View extracted sections in the document viewer
- View overview findings
- Ask a question and receive a cited answer
- Create an action from a finding
- Compare two documents
- Generate a professional prep briefing

Location: `tests/e2e/`

---

## 4. Security Tests

Treated as a first-class test category:

| Scenario | Test type | Phase | Status |
|---|---|---|---|
| Upload with invalid MIME type | Unit | Phase 1 | ✅ Tested |
| Upload oversized file (> 10 MB) | Unit | Phase 1 | ✅ Tested |
| Upload with path traversal in filename | Unit | Phase 1 | ✅ Tested |
| Upload with URI-encoded path traversal | Unit | Phase 1 | ✅ Tested |
| Upload with Windows reserved device name | Unit | Phase 1 | ✅ Tested |
| Storage rollback on database insert failure | Unit | Phase 1 | ✅ Tested |
| Unauthenticated upload rejection (401) | Unit | Phase 1 | ✅ Tested |
| Session-derived ownership (no client ID) | Unit | Phase 1 | ✅ Tested |
| Stack trace not exposed in upload error | Unit | Phase 1 | ✅ Tested |
| Prompt injection in document content | Unit & Integration | Phase 3 | ✅ Tested |
| Zod validation rejection on bad API input | Unit | Phase 0 | ✅ Tested |
| Missing required fields in API body | Unit | Phase 0 | ✅ Tested |
| Stack trace not exposed in error response | Integration | Phase 0 | ✅ Tested |

---

## 5. AI Response Validation Tests

Because AI responses can be malformed or unexpected:

- Every Zod schema used to parse AI output has unit tests with:
  - Valid response: should parse successfully
  - Missing required field: should fail gracefully
  - Wrong type: should fail gracefully
  - Extra unexpected fields: should strip or reject

- AI client wrapper tests use mock responses:
  - Happy path: valid JSON → Zod passes → structured output returned
  - Malformed JSON: → error state returned, not thrown to UI
  - Empty response: → error state

---

## 6. Test Conventions

### Naming
```
describe('documentService', () => {
  it('should reject a file exceeding the maximum size', async () => { ... });
  it('should sanitize the filename before storing', async () => { ... });
});
```

### Structure
```
tests/
├── unit/
│   ├── validation.test.ts
│   ├── chunking.test.ts
│   ├── finding-schema.test.ts
│   └── ...
├── integration/
│   ├── document-service.test.ts
│   ├── retrieval-service.test.ts
│   └── ...
└── e2e/
    ├── upload.spec.ts
    ├── workspace.spec.ts
    ├── qa.spec.ts
    └── compare.spec.ts
```

### Mocking Policy
- **Database:** Always use a real PostgreSQL test database (never SQLite or in-memory)
- **Supabase Storage:** Mock the client in all automated tests; do not upload to real buckets
- **OpenAI API:** Always mock in unit and integration tests; reserve real calls for manual QA
- **Embeddings:** Mock the client; use fixed-dimension vectors (zero vector or random unit vector) for pgvector tests
- **NextAuth session:** Mock the session helper to return a fixed test userId in service tests
- **E2E tests:** Use a test environment with seeded PostgreSQL data and a seeded test user

---

## 7. CI Expectations (future)

When CI is added:
- `pnpm test` runs all unit and integration tests (requires a running PostgreSQL instance with pgvector)
- `pnpm test:e2e` runs Playwright tests
- All tests must pass before merge to `main`
- Coverage report generated; no hard threshold yet in MVP
- `pnpm audit` must pass with no high/critical issues

---

## 8. What Is Not Tested in MVP

- Load / performance testing
- Full accessibility audits (axe)
- Visual regression
- Multi-user concurrency / isolation edge cases (auth is in Phase 0 but stress tests are not)

These are Phase 10 considerations.

