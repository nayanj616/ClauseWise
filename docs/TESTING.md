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
- File validation logic (MIME type check, size check, filename sanitization)
- Zod schema validation (valid and invalid inputs)
- Text chunking algorithm
- Finding parsing / Zod schema validation for AI responses
- Date extraction and parsing
- Comparison difference detection helpers
- Error formatting utilities

Location: `tests/unit/`

### 3.2 Integration Tests (Vitest)

Target: Service layer with real or mocked dependencies.

**Database:** Integration tests use a **real PostgreSQL test database** with the
pgvector extension enabled. SQLite is not used — it does not support pgvector and
would not verify the queries that run in production. A dedicated test database
(e.g. `clausewise_test`) is created once and wiped between test runs using
Drizzle migrations.

Cover:
- `document-service` — upload, read, delete (real DB; mock Supabase Storage client)
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

| Scenario | Test type | Phase |
|---|---|---|
| Upload with invalid MIME type | Unit + E2E | Phase 1 |
| Upload oversized file | Unit + E2E | Phase 1 |
| Upload with path traversal in filename | Unit | Phase 1 |
| Access another user's document | Integration | Phase 1 |
| Prompt injection in document content | Integration (mock AI) | Phase 3 |
| Zod validation rejection on bad API input | Unit | Phase 0 |
| Missing required fields in API body | Unit | Phase 0 |
| Stack trace not exposed in error response | Integration | Phase 0 |

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

