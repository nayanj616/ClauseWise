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

### 3.1 Unit & Service Integration Tests (Vitest — `tests/unit/`)

Target: Pure domain logic, Zod schema contracts, domain services, route handlers, infrastructure adapters, and accessible React components.

Location: `tests/unit/` (**53 test files implemented across Phases 0–10 + Production Readiness**):

- **Phase 0 & 1 Baseline (7 suites):**
  - `document-validation.test.ts`, `upload-client.test.ts`, `document-service.test.ts`, `upload-route.test.ts`, `document-upload-ui.test.tsx`, `session.test.ts`, `utils.test.ts`
- **Phase 2 Extraction, Viewer & Chunking (6 suites):**
  - `extraction-service.test.ts`, `extraction-persistence.test.ts`, `chunking-service.test.ts`, `chunk-persistence-service.test.ts`, `document-workspace-service.test.ts`, `document-workspace-ui.test.tsx`
- **Phase 3 Intelligence Contract, Ollama/OpenAI Adapters & Workspace (13 suites):**
  - `intelligence-schemas.test.ts`, `openai-client.test.ts`, `ollama-client.test.ts`, `chunk-embedding-pipeline.test.ts`, `document-classification.test.ts`, `structured-extraction.test.ts`, `document-findings.test.ts`, `expectation-catalog.test.ts`, `evidence-validator.test.ts`, `intelligence-service.test.ts`, `intelligence-persistence.test.ts`, `intelligence-workspace.test.tsx`, `phase3-final-verification.test.tsx`
- **Phase 4 Evidence Display & Source Highlighting (5 suites):**
  - `retrieval-service.test.ts`, `evidence-highlighting.test.tsx`, `document-workspace-navigation.test.tsx`, `linked-views.test.tsx`, `phase4-final-verification.test.tsx`
- **Phase 5 Document-Grounded Q&A & Streaming Conversations (6 suites):**
  - `retrieval-evidence.test.ts`, `qa-service.test.ts`, `ask-ui.test.tsx`, `conversation-service.test.ts`, `conversation-routes.test.ts`, `qa-streaming.test.ts`
- **Phase 6 Contextual Assistant (3 suites):**
  - `contextual-retrieval.test.ts`, `contextual-assistant.test.ts`, `contextual-ask-ui.test.tsx`
- **Phase 7 Action Center (3 suites):**
  - `action-service.test.ts`, `action-routes.test.ts`, `action-ui.test.tsx`
- **Phase 8 Professional Prep (3 suites):**
  - `preparation-service.test.ts`, `preparation-routes.test.ts`, `preparation-ui.test.tsx`
- **Phase 9 Document Comparison (3 suites):**
  - `comparison-service.test.ts`, `comparison-routes.test.ts`, `comparison-ui.test.tsx`
- **Phase 10 & Production Readiness (4 suites):**
  - `phase10-polish.test.tsx`, `landing-page.test.tsx`, `document-authorization.test.ts`, `deployment-config.test.ts`

### Phase 1 Detail:
- `tests/unit/document-validation.test.ts`:
  - Magic byte verification: PDF (`%PDF-` and `%%EOF`), DOCX (ZIP `PK\x03\x04` and OOXML `[Content_Types].xml`).
  - Size boundary validation: $\le 10\text{ MB}$ accepted, $> 10\text{ MB}$ rejected.
  - Extension and MIME mismatch rejection.
  - Filename sanitization: path traversal (`../`, `..\`), absolute paths, URI-encoded directory traversals (`%2e%2e%2f`), null bytes, Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), double extension prevention, punctuation normalization, length truncation.
- `tests/unit/upload-client.test.ts`:
  - Client-side validation, `FormData` construction, API response parsing, and error normalization.
- `tests/unit/document-service.test.ts`:
  - Upload orchestration to private Supabase Storage (`documents` bucket), `Document` record creation (`status: queued`), and storage rollback on database insert failure.
- `tests/unit/upload-route.test.ts`:
  - `POST /api/documents/upload` authentication enforcement (`401`), session-derived ownership (`session.user.id`), `400` validation responses, `201` creation, and `500` error masking.
- `tests/unit/document-upload-ui.test.tsx`:
  - Accessible upload container (`role="region"`), screen reader live regions (`aria-live="polite"`), and keyboard interaction.
- `tests/unit/session.test.ts` & `tests/unit/utils.test.ts`:
  - `requireSession()`, `assertOwnership()`, and formatting utilities.

### 3.2 Live Database & Runtime Verification (`docs/PRODUCTION_AUDIT.md`)

In addition to deterministic Vitest unit/service tests (which mock external network and database adapters so `pnpm test` runs offline without external credentials), live integration checks against remote Supabase PostgreSQL (`pgvector` `vector(768)`), private Supabase Storage (`documents` bucket), and local Ollama (`qwen3:4b` + `nomic-embed-text`) are documented in [`docs/PRODUCTION_AUDIT.md`](PRODUCTION_AUDIT.md).

### 3.3 E2E Browser Tests (Playwright — `tests/e2e/`)

Target: Critical user journeys in a real browser across desktop and mobile viewports.

Location: `tests/e2e/` (**9 Playwright E2E spec files implemented**):
- `auth.spec.ts` — Unauthenticated redirect to `/sign-in`, sign-in/sign-up form validation, and protected route enforcement.
- `evidence-navigation.spec.ts` — Finding selection, `View in Document Text` jump navigation, `<mark>` excerpt highlighting, and `missing_information` absence truthfulness.
- `ask-flow.spec.ts` — Single-turn document-grounded Q&A, citation card rendering, verbatim source jump, and insufficient-evidence refusal banner.
- `conversation-streaming-flow.spec.ts` — Multi-turn conversational threads, SSE token streaming, thread switching, and deletion.
- `contextual-assistant-flow.spec.ts` — Section-scoped Q&A (`Ask about this section`), context badge, clear-context action, and same-document fallback provenance.
- `action-center-flow.spec.ts` — Creating review checklist actions from findings, status filtering (`All`, `Open`, `Completed`), status toggling, and source jump links.
- `professional-prep-flow.spec.ts` — Consultation briefing tab (`?tab=prep`), key clause navigation, counsel discussion prompts, and export controls.
- `compare-flow.spec.ts` — Side-by-side contract comparison (`/compare`), swap button (`↔`), category filtering (`Modified`, `Added`, `Removed`, `Unchanged`), keyword search, and deep links.
- `final-integration-flow.spec.ts` — Full cross-phase journey including mobile navigation drawer (`< 768px`) and keyboard skip-link accessibility.

*(Note: E2E browser suites utilize deterministic test harness routes `/test-workspace`, `/test-actions`, and `/test-compare`—which are guarded in production unless `ENABLE_TEST_ROUTES=true`—as well as authenticated route tests.)*

---

## 4. Security Tests

Treated as a first-class test category across `tests/unit/`:

| Scenario | Test File | Phase | Status |
|---|---|---|---|
| Upload with invalid MIME type or extension | `document-validation.test.ts` | Phase 1 | ✅ Tested |
| Upload oversized file ($> 10\text{ MB}$) | `document-validation.test.ts` | Phase 1 | ✅ Tested |
| Upload with path traversal / URI-encoded traversal | `document-validation.test.ts` | Phase 1 | ✅ Tested |
| Upload with Windows reserved device name | `document-validation.test.ts` | Phase 1 | ✅ Tested |
| Storage rollback on database insert failure | `document-service.test.ts` | Phase 1 | ✅ Tested |
| Unauthenticated upload rejection (`401`) | `upload-route.test.ts` | Phase 1 | ✅ Tested |
| Session-derived ownership & cross-tenant isolation | `document-authorization.test.ts` | Phase 1–10 | ✅ Tested |
| Stack trace & credential redaction in errors | `openai-client.test.ts`, `ollama-client.test.ts` | Phase 3 | ✅ Tested |
| Prompt injection delimiters & untrusted content isolation | `phase3-final-verification.test.tsx`, `qa-service.test.ts` | Phase 3 & 5 | ✅ Tested |
| Anti-oracle uniform `404` on foreign document/section/action/prep/compare IDs | `retrieval-evidence.test.ts`, `action-routes.test.ts`, `preparation-routes.test.ts`, `comparison-routes.test.ts` | Phase 5–9 | ✅ Tested |
| `vector(768)` dimension guard blocking `1536d` OpenAI embedding calls | `chunk-embedding-pipeline.test.ts` | Production Audit | ✅ Tested |
| Dockerfile, `.dockerignore`, `docker-compose.yml` & `Caddyfile` security invariants | `deployment-config.test.ts` | Production Audit | ✅ Tested |

---

## 5. AI Response & Evidence Validation Tests

Because AI responses can be malformed, hallucinated, or contain reasoning tags:

- Every Zod schema (`RawAiClassificationSchema`, `RawAiStructuredExtractionSchema`, `RawAiFindingsResponseSchema`, `ModelQaOutputSchema`) is tested against valid payloads, missing required fields, wrong types, and forbidden risk-score properties (`.strict()`).
- `ollama-client.test.ts` verifies `<think>...</think>` tag stripping, markdown fence removal, GBNF schema formatting, timeout handling, and connection/model-not-found errors.
- `evidence-validator.test.ts` and `qa-service.test.ts` verify that candidate excerpts not present in the persisted section text and unknown `citedChunkIds` are deterministically rejected.

---

## 6. Test Structure & Conventions

```
tests/
├── unit/                  # 53 Vitest unit, service, route, UI & deployment config suites
│   ├── document-validation.test.ts
│   ├── evidence-validator.test.ts
│   ├── qa-service.test.ts
│   ├── comparison-service.test.ts
│   ├── deployment-config.test.ts
│   └── ...
└── e2e/                   # 9 Playwright browser E2E suites
    ├── auth.spec.ts
    ├── evidence-navigation.spec.ts
    ├── ask-flow.spec.ts
    ├── conversation-streaming-flow.spec.ts
    ├── contextual-assistant-flow.spec.ts
    ├── action-center-flow.spec.ts
    ├── professional-prep-flow.spec.ts
    ├── compare-flow.spec.ts
    └── final-integration-flow.spec.ts
```

---

## 7. What Is Not Automated in MVP Test Suites

- Load and multi-user concurrency stress testing
- Automated `axe-core` full-page accessibility crawler (WCAG 2.1 AA semantics, ARIA attributes, keyboard focus, and mobile drawer interactions are tested directly in Vitest and Playwright)
- Pixel-diff visual regression snapshots
- Automated CI/CD pipeline execution against a cloud GPU Ollama runner


