# ClauseWise — Phase Implementation Plan

**Version:** 0.1 (living document)

Each phase is an end-to-end vertical slice:
`Database → Domain service → API/Server Action → UI → Tests → Documentation`

Work one phase at a time. Do not start a new phase until the current phase
is complete and passing tests.

---

## Phase 0 — Foundation

**Goal:** A working Next.js application with infrastructure in place, real
user sessions, and document ownership enforced from day one.

### Deliverables

**Project scaffolding**
- `pnpm create next-app` with App Router, TypeScript, Tailwind
- Strict TypeScript config
- ESLint + Prettier config
- `.gitignore` (comprehensive)
- `.env.example` with placeholders only

**Authentication**
- **NextAuth.js (Auth.js v5)** — lightweight, server-side, zero third-party
  data sharing required
- Provider: email/password (credentials) for MVP simplicity; swap to OAuth
  provider (e.g. GitHub, Google) as a drop-in if preferred
- `User` table wired to NextAuth session; every subsequent request has a
  verified `userId`
- Sign-in / sign-up pages (minimal UI; functional)
- Protected route middleware: redirect unauthenticated users to sign-in
- Session cookie (HTTP-only, Secure, SameSite=Lax)

**Database**
- Drizzle ORM setup
- PostgreSQL connection (via environment variable)
- pgvector extension enabled
- Initial schema: `User`, `Session` (NextAuth tables), `Document`
  (status-only — content columns added in Phase 1)
- Migration workflow (`drizzle-kit`)

**Storage**
- Supabase Storage client setup (server-side only)
- Private bucket definition

**AI infrastructure**
- OpenAI client setup (server-side only)
- Embeddings client setup

**UI foundation**
- shadcn/ui installed and configured
- Tailwind palette and typography defined
- Global layout: sidebar navigation shell (shows current user, sign-out)
- Placeholder pages: Dashboard, Documents, Compare, Actions

**Security baseline**
- HTTP security headers in `next.config.ts`
- Environment variable validation on startup (fail-fast)
- All API routes and Server Actions assert `session.user.id` before use

**Tests**
- Vitest configured
- Playwright configured
- Unit: session utility helpers (extract userId, assert ownership shape)
- E2E smoke test: unauthenticated request → redirect to sign-in; sign in → reach dashboard

**Documentation**
- `README.md` with project overview, setup instructions, architecture summary
- `AGENTS.md` (already created)
- `docs/` (already created)

---

## Phase 1 — Secure Document Upload (✅ Complete)

**Goal:** Users can upload a PDF or DOCX. File is validated, stored securely in
private Supabase Storage, and a Document record is created with status `queued`.

### Deliverables (Implemented)

**Database**
- `Document` schema extended with storage and metadata columns:
  - `original_filename` (text, not null)
  - `storage_path` (text, not null)
  - `mime_type` (text, not null)
  - `file_size_bytes` (integer, not null)
  - `status` (initial value: `queued`)
- Drizzle migration generated and verified (`0001_freezing_true_believers.sql`)

**Validation & Upload Client**
- `lib/validation/document-validation.ts`
  - Server-side authoritative validation: MIME type, file extension, 10 MB maximum size
  - Magic byte inspection: `%PDF-` header and `%%EOF` trailer for PDF
  - Structural archive inspection: valid ZIP with `[Content_Types].xml` and `word/` for DOCX
  - Filename sanitization with URI decoding, path traversal prevention, and Windows reserved name guard
  - Server-controlled storage path generation with strict user namespace confinement
- `lib/upload/upload-client.ts`
  - Client-side UX validation (immediate user feedback before upload)
  - Safe API dispatch submitting multipart/form-data to `POST /api/documents/upload`

**Storage**
- `lib/storage/storage-client.ts`
  - Private Supabase Storage bucket (`documents`)
  - Server-side service-role client (credentials never exposed to browser)
  - Operations: `uploadDocumentFile()`, `deleteDocumentFile()`, `createSignedDocumentUrl()`

**Domain Service**
- `lib/services/document-service.ts`
  - `uploadDocument()` — validates file, uploads to private storage, inserts DB record
  - Enforces document ownership strictly from authenticated `session.user.id`
  - Failure handling: rolls back storage object if database record creation fails to prevent orphaned files

**API**
- `POST /api/documents/upload`
  - Requires authenticated NextAuth session (`401` on unauthenticated requests)
  - Derives ownership strictly from `session.user.id` (ignores any client-supplied owner IDs)
  - Returns `201` with created Document record on success
  - Returns `400` with user-safe message on validation failure
  - Returns `500` with generic message on unexpected failure (no stack traces, database details, or credentials exposed)
  *(Note: Document retrieval `GET /api/documents` and deletion `DELETE /api/documents/[id]` belong to subsequent slices/phases.)*

**UI**
- `components/document/DocumentUpload.tsx`
  - Keyboard-accessible dropzone and file picker
  - Clear indicators for supported formats (PDF, DOCX) and 10 MB limit
  - Loading/progress spinner with `aria-busy` and disabled controls during upload
  - Error alert with safe messages and retry capability
  - Success state with document name and status badge, preserving document ID in state
- `app/(app)/documents/page.tsx`
  - Integrated upload UI replacing initial Phase 0 placeholder

**Tests**
- 85 automated tests passing across 7 suites covering:
  - Unit validation: MIME, extensions, magic bytes, OOXML structure, size limits, path sanitization
  - Domain service: storage upload, DB record insertion, session ownership, rollback on DB error
  - Route handler: authentication check, ownership isolation, error safety, multipart parsing
  - Client & UI: client UX validation, API dispatch mapping, accessible rendering, format indicators
- TypeScript check: 0 errors (`npx tsc --noEmit`)
- Production build: passed (`npx next build`)

---

## Phase 2 — Text Extraction and Document Viewer

**Goal:** Uploaded document text is extracted and sections are detected and persisted.
The document workspace shows extracted content once processing completes.

### Processing Model

```
Upload Request
  ↓
Validate file (MIME, magic bytes, OOXML structure, size limit)
  ↓
Store file to private Supabase Storage
  ↓
Create Document record (status: queued)
  ↓
processDocumentExtraction(documentId) [Synchronous Server Processing]
  ├─ update document status: extracting
  ├─ download stored file from private storage
  ├─ extractDocumentText()
  └─ persistDocumentExtraction() [TRANSACTION]
       ├─ delete previous document_chunks & document_sections (reprocessing idempotency)
       ├─ insert new document_sections (preserve order, title, content, page coords)
       ├─ chunkSections(insertedSections) (deterministic section-to-chunk transformation)
       ├─ insert new document_chunks (sequential chunk_index, section_id, content, page_number)
       └─ update document (status: ready, page_count)
       ↓
     COMMIT
  ↓
Return 201 Response with Processed Document
```

### Slice 2.1 — Extraction Infrastructure (✅ Complete)
- Pure in-memory extraction engine (`lib/services/extraction-service.ts`)
- PDF extraction via `unpdf` with native physical page mapping
- DOCX extraction via `mammoth` with structural inspection
- Plain text extraction with UTF-8 / ASCII encoding verification
- Heuristic legal section detector (`lib/extraction/section-detector.ts`)
- 36 dedicated unit tests covering format verification, section detection, and error safety

### Slice 2.2 — Extraction Persistence (✅ Complete)
- **Database**:
  - `document_sections` schema in `lib/db/schema.ts` (`id`, `document_id`, `order_index`, `section_number`, `title`, `content`, `page_start`, `page_end`, `created_at`, `updated_at`)
  - `page_count` column added to `document` table
  - Drizzle migration generated and applied (`0002_closed_living_tribunal.sql`)
  - Relations defined (`documentsRelations.sections`, `documentSectionsRelations.document`)
- **Storage Client**:
  - `downloadDocumentFile()` added to `lib/storage/storage-client.ts`
- **Domain Services**:
  - `lib/services/extraction-persistence-service.ts`:
    - `persistDocumentExtraction()`: transactional section persistence and document readiness
    - `processDocumentExtraction()`: end-to-end extraction orchestrator for existing documents
  - `lib/services/document-service.ts`:
    - `uploadDocument()` updated with `processExtraction` option for synchronous processing
    - Re-exports persistence functions and error classes
- **Orchestration**:
  - `POST /api/documents/upload` triggers synchronous extraction and persistence
- **Transaction & Failure Handling**:
  - Atomic transaction rollback prevents partial section commits or premature `ready` status
  - Best-effort fallback status update to `error` outside transaction on failure
  - Internal logging if fallback status update itself fails
  - Preserves exact section ordering, titles, verbatim text, and PDF page coordinates (null for DOCX/TXT)
  - Idempotent reprocessing: replaces existing sections without creating duplicates
- **Tests**:
  - 15 new persistence tests in `tests/unit/extraction-persistence.test.ts`
  - 137 total automated tests passing across 9 test suites

### Slice 2.3 — Document Workspace / Extracted Content Viewer (✅ Complete)
- **Route**:
  - `app/(app)/documents/[documentId]/page.tsx` (`/documents/[documentId]`)
  - Server Component enforcing verified session ownership via `requireSession()`
- **Domain Service**:
  - `getDocumentWorkspaceData(documentId, userId)` in `lib/services/document-service.ts`
  - Strictly requires `userId` and scopes queries to `and(eq(documents.id, cleanDocId), eq(documents.userId, cleanUserId))`
  - Loads sections ordered by `asc(documentSections.orderIndex)`
  - Explicitly strips `storagePath` and internal details from public workspace shape
  - Translates unexpected DB failures into safe `DatabaseError`
- **UI Components**:
  - `components/workspace/DocumentViewer.tsx`:
    - Header with document filename, status badge (`Ready`), format badge, size, page count, and back button
    - Multi-section layout: left sidebar navigation in persisted order, active section highlight (`aria-current="true"`), previous/next buttons
    - Single-section layout: direct content rendering without redundant sidebar
    - Source location formatting: `Page X`, `Pages X–Y`, null suppressed for DOCX/TXT
    - Local `useState` for active section selection
  - `components/workspace/WorkspaceStates.tsx`:
    - `DocumentProcessingState`: displays status and explains content is not yet available
    - `DocumentErrorState`: safe user-facing error message, no sensitive data exposed
    - `EmptyContentState`: explains no readable text was extracted
    - `DocumentNotFoundState`: friendly 404 message for nonexistent or unauthorized documents
  - `components/workspace/DocumentWorkspace.tsx`:
    - State router: `ready` (viewer/empty), `error` (error state), all other existing statuses (processing state)
  - `components/document/DocumentUpload.tsx`:
    - Success card renders "Open in Workspace" button linking to `/documents/${uploadedDocument.id}`
- **Tests**:
  - Service unit tests in `tests/unit/document-workspace-service.test.ts` (ownership, validation, sorting, error masking)
  - UI unit tests in `tests/unit/document-workspace-ui.test.tsx` (multi/single section, page coordinates, fallbacks, statuses, content safety)

### Slice 2.4 — Document Chunking & Retrieval-Ready Persistence (✅ Complete)
- **Database**:
  - `document_chunks` table in `lib/db/schema.ts` (`id`, `document_id`, `section_id`, `chunk_index`, `content`, `page_number`, `token_count`, `created_at`, `updated_at`)
  - Foreign key cascades on `document_id` and `section_id` (`onDelete: cascade`)
  - Drizzle migration generated (`0003_brief_iron_man.sql`)
  - Relations defined (`documentChunksRelations.document`, `documentChunksRelations.section`, `documentsRelations.chunks`, `documentSectionsRelations.chunks`)
  - pgvector and embeddings intentionally omitted until Phase 3
- **Domain Services**:
  - `lib/services/chunking-service.ts`:
    - Pure domain service with zero DB, storage, or external dependencies
    - Deterministic section-to-chunk segmentation with configurable `maxChunkChars` (default 1500)
    - Section isolation: chunks never span across section boundaries
    - Paragraph and sentence boundary preservation, avoiding splitting words
    - Substantive text preservation with whitespace normalization
    - Format-agnostic page reference propagation: `section.pageStart ?? null`
    - Globally sequential, zero-based `chunkIndex` across all sections in the document
    - Approximate token count heuristic: `Math.ceil(length / 4)`
    - Defensive empty content handling: whitespace-only sections emit 0 chunks
  - `lib/services/chunk-persistence-service.ts`:
    - `persistDocumentChunks`, `deleteDocumentChunks`, `getDocumentChunks`
    - Supports atomic participation in existing database transactions
    - Sanitizes database errors to prevent credential or URL leakage
- **Extraction Persistence Integration**:
  - `persistDocumentExtraction()` extended within single atomic transaction:
    1. Deletes previous chunks and sections for document (idempotency)
    2. Inserts new sections
    3. Transforms newly inserted sections via `chunkSections(insertedSections)`
    4. Guards against 0 chunks (empty content fails and aborts)
    5. Inserts chunks into `document_chunks`
    6. Updates document to `status: "ready"`
  - Rollback on failure ensures no partial records or premature `ready` state
- **Tests**:
  - `tests/unit/chunking-service.test.ts` (14 tests: sizing, paragraph/sentence boundaries, Unicode, empty content, determinism, page propagation)
  - `tests/unit/chunk-persistence-service.test.ts` (11 tests: insertion, ordering, deletion, error masking)
  - `tests/unit/extraction-persistence.test.ts` (16 tests: full transactional integration, reprocessing, rollback on chunk failure or 0 chunks)
  - 188 total tests passing across 13 test suites

---

## Phase 3 — Document Intelligence Contract & Infrastructure (✅ CLOSED)

**Goal:** Establish and implement the technical contract for AI-powered document
intelligence, strictly enforcing that the LLM is never the source of truth,
and ensuring all substantive findings and metadata have verifiable evidence
rooted in persisted Phase 2 sections.

### Status: PHASE 3 CLOSED
```text
3.0 Intelligence Contract       ✓ CLOSED
3.1 AI Infrastructure           ✓ CLOSED
3.2 Document Classification     ✓ CLOSED
3.3 Structured Extraction       ✓ CLOSED
3.4 Findings                    ✓ CLOSED
3.5 Evidence Validation         ✓ CLOSED
3.6 Intelligence Workspace      ✓ CLOSED
3.7 Final Verification          ✓ CLOSED

PHASE 3 CLOSED
```

### Completed Evidence-First Architecture:
```text
Persisted Sections
    ↓
Deterministic Chunks
    ↓
Bounded Intelligence Input (max 240,000 chars, no silent loss)
    ↓
LLM Structured Output (OpenAI gpt-4o Structured Outputs + security wrapper)
    ↓
Zod Schema Validation (discriminated unions, no risk scores)
    ↓
Deterministic Evidence Validation (verifies source text in section; matches chunk & page)
    ↓
Atomic Persistence (transactional commit, reprocessing idempotency)
    ↓
Grounded Intelligence Workspace (presentation & navigation over persisted data)
```

The LLM is **never the source of truth**. Authoritative evidence and provenance come exclusively from persisted document records.

### Slices Implemented & Closed:

#### Slice 3.0 — Intelligence Contract (✅ Closed)
- Established the boundary between persisted document data and AI intelligence.
- Discriminated union schemas (`lib/intelligence/schemas.ts`) enforcing `sourceText` and `sectionOrderIndex` for substantive findings, and strictly absence-based representation for `missing_information`.
- Pure expectation catalog (`lib/intelligence/expectation-catalog.ts`) grounding missing provisions in `CORE_PROVISION_CATALOG` to prevent arbitrary checklist invention.
- Strict absence of numerical legal risk scores (`.strict()` Zod schemas).

#### Slice 3.1 — AI Infrastructure (✅ Closed)
- Server-side OpenAI integration boundary (`lib/ai/openai-client.ts`) with zero document business logic.
- Structured output generation with automated error wrapping (`OpenAiInferenceError`, timeouts, rate limits, refusals).
- Security prompt formatting (`lib/intelligence/prompts.ts`) wrapping sections in `=== UNTRUSTED DOCUMENT CONTENT ===` delimiters with anti-injection instructions.
- Deterministic input bounding capping context at 240,000 characters while preserving preambles and closings.

#### Slice 3.2 — Document Classification (✅ Closed)
- Grounded document type classification (`classifyDocument`).
- Explicit distinction between text-stated classifications (with verified section citation) and inferred classifications (with non-empty `inferenceReason` and null citations).

#### Slice 3.3 — Structured Extraction (✅ Closed)
- Evidence-backed extraction of parties, governing law, jurisdiction, key dates, and financial terms (`extractDocumentMetadata`).
- Verbatim grounding requirement for all extracted entities.

#### Slice 3.4 — Findings (✅ Closed)
- Extraction of obligations, key terms, attention items, ambiguities, inconsistencies, and missing provisions (`generateDocumentFindings`).
- Bounded to 30 findings per document; review priority separated into `needs_attention`, `important`, and `informational`.

#### Slice 3.5 — Evidence Validation (✅ Closed)
- Pure domain engine (`lib/intelligence/evidence-validator.ts`) with zero network, DB, or OpenAI dependencies.
- Standardized core primitive `verifySectionExcerptEvidence` using exact and whitespace-normalized substring matching.
- Authoritative resolution of `sectionId`, `chunkId`, and `pageNumber` from persisted records; model-supplied UUIDs are disregarded.
- Cross-document isolation: sections or chunks with mismatched `documentId` are deterministically rejected.

#### Slice 3.6 — Intelligence Workspace (✅ Closed)
- Comprehensive user-facing presentation and navigation layer (`components/workspace/`):
  - `DocumentHeader`: Document metadata, status badge, classification badge (with stated vs inferred indicators), and tab navigation (`Intelligence & Findings` vs `Document Text`).
  - `DocumentOverview`: Structured cards for Parties, Governing Law & Jurisdiction, Key Dates, Financial Terms, and Executive Summary.
  - `ImportantSections`: Highlighted key sections with plain-English rationales and jump-to-section navigation triggers.
  - `FindingCard`: Accessible finding cards (`aria-pressed`) displaying labels, plain-English summaries, canonical type badges, and review priority badges.
  - `EvidencePanel`: Master-detail inspector displaying verbatim source excerpts with verified coordinates and "View in Document Text" action; renders absence explanations with zero fake citations for `missing_information`.
  - `FindingList`: Deterministic filtering by priority (`All`, `Needs Attention`, `Important`, `Informational`) and finding types.
  - `DocumentViewer`: Synchronized section viewer supporting bi-directional navigation from findings and important sections.
  - `DocumentWorkspace`: Top-level coordinator managing tabs, active finding selection, and cross-tab navigation.
- **Workspace Invariants:**
  - Executive Summary is display-only: rendered strictly when already present in persisted `metadata.executiveSummary`, never synthesized to fill gaps.
  - Canonical `DOCUMENT_STATUS` state machine governs all views (`queued`, `extracting`, `chunking`, `analyzing`, `ready`, `error`). No duplicate UI state machine.
  - Presentation only: zero LLM calls, embeddings, or vector queries in workspace UI or client components.

#### Slice 3.7 — Final Verification (✅ Closed)
- Dedicated cross-slice regression test suite (`tests/unit/phase3-final-verification.test.tsx`) covering 7 substantive verification groups:
  1. Cross-slice pipeline flow & evidence enforcement
  2. Evidence integrity & absence invariants
  3. Failure isolation & Phase 2 data immutability
  4. Multi-document & cross-tenant isolation
  5. Prompt & data security
  6. Persistence & reprocessing correctness
  7. Workspace regressions & absence of legal risk scores

### Phase 3 Final Verification Status:
```text
- 24 test files passing
- 413 tests passing (100% green)
- TypeScript strict check: 0 errors (npx tsc --noEmit)
- ESLint: 0 warnings/errors (pnpm lint)
- Next.js Production Build: PASS (pnpm build)
- Repository cleanliness & size: PASS (~700 KiB, well under 10 MB limit)
```

---

## Phase 4 — Evidence-backed Analysis Display (✅ Closed)

**Goal:** Findings are linked to source document sections. Clicking a finding
highlights and scrolls to the source in the document viewer.

### Vertical Slices

#### Slice 4.1 — Retrieval Domain Service (✅ Closed)
- Implemented `lib/services/retrieval-service.ts` with strict tenant isolation:
  - `findingsByDocument(documentId, userId)`: retrieves persisted findings ordered canonically by `pageNumber ASC NULLS LAST, createdAt ASC`.
  - `findingsByType(documentId, findingType, userId)`: filters findings by canonical type with ownership verification.
  - `findingWithEvidence(findingId, userId)`: resolves finding with source section and chunk evidence; preserves `section: null, chunk: null` for `missing_information`.
  - Input validation with strict UUID regex and user ID checks.
  - Unexpected database errors caught and re-thrown as safe `DatabaseError`.

#### Slice 4.2 — Source Text Highlighting Engine (✅ Closed)
- Pure domain utility in `lib/workspace/highlight.ts`:
  - `findHighlightRange(sectionContent, sourceText)`: identifies exact character offsets (`startIndex`, `endIndex`, `matchedText`) without modifying the original text.
  - `getHighlightSegments(sectionContent, sourceText)`: partitions content into `[before, highlighted, after]` segments (`before + highlighted + after === sectionContent` exactly).
  - Whitespace-tolerant regex token matching across layout variations (newlines, multiple spaces, tabs, straight vs curly quotes).
  - Missing-information invariant: `null`/undefined `sourceText` returns `hasMatch: false, range: null` deterministically (zero fabricated highlights).
- DocumentViewer integration: renders `<mark id="active-evidence-highlight">` with accessibility styles and focus management.

#### Slice 4.3 — Finding-to-Viewer Navigation (✅ Closed)
- Cross-panel navigation coordinator in `components/workspace/DocumentWorkspace.tsx`:
  - `handleNavigateToEvidence(finding)`: selects target section, sets active evidence excerpt, and activates `document` tab.
  - `FindingCard`: accessible "View in document" button for substantive findings with evidence; suppressed for `missing_information`.
  - `EvidencePanel`: "View in Document Text" action button wiring.
  - `DocumentViewer`: `scrollAndFocusHighlight()` brings active `<mark>` into viewport and programmatically focuses it.

#### Slice 4.4 — Dedicated Attention Items, Dates, and Financial Terms Linked Views (✅ Closed)
- Presentation components surfacing existing persisted findings without modifying intelligence pipeline:
  - `AttentionItemsSummary`: surfaces items where `importance === "needs_attention"`.
  - `FormattedDatesList`: surfaces items where `findingType === "date"`.
  - `FormattedFinancialList`: surfaces items where `findingType === "financial_term"`.
  - Pure formatters in `lib/workspace/formatters.ts`: `formatFindingDate` and `formatFinancialTerm`.
  - FindingCard metadata badges for date and financial values.

#### Slice 4.5 — Final Phase 4 Verification & E2E Coverage (✅ Closed)
- Comprehensive Playwright E2E browser test suite (`tests/e2e/evidence-navigation.spec.ts`):
  - Complete user journey: FindingCard -> "View in document" -> Document tab -> section -> `<mark>` highlight -> focus.
  - EvidencePanel "View in Document Text" navigation path.
  - Attention Items, Dates, and Financial Terms linked views & navigation in browser.
  - Missing-information truthfulness invariant verified in browser (visible absence, no fake excerpts, no navigation button).
  - Multiple findings navigation and isolation regression.
  - Manual document navigation regression.
  - Status-state handling regressions (processing, error, empty, not-found).
  - Accessibility & security verification (keyboard interaction, focus management, prominent legal disclaimer).
- Dedicated cross-slice unit/integration verification suite (`tests/unit/phase4-final-verification.test.tsx`).

### Phase 4 Final Verification Status:
```text
- 29 unit/integration test files passing (521 tests, 100% green)
- 2 Playwright E2E test files passing (25 browser tests, 100% green)
- TypeScript strict check: 0 errors (npx tsc --noEmit)
- ESLint: 0 warnings/errors (pnpm lint)
- Next.js Production Build: PASS (pnpm build)
- Repository cleanliness & size: PASS (well under 10 MB limit)
```

---

## Phase 5 — Document-Grounded Q&A

**Goal:** Users can ask questions about their document and receive cited answers.

### Deliverables

**Domain service**
- `retrieval-service.ts`
  - `semanticSearch()` — embed query, pgvector similarity search, return top-k chunks
- `qa-service.ts`
  - `answerQuestion()` — retrieve → compose prompt → call OpenAI → validate → return with citations

**Database**
- `Conversation` schema
- `Message` schema
- Drizzle migration

**API**
- `POST /api/chat` — streaming or non-streaming response with citations

**UI**
- Right panel: Ask tab
- Chat interface (message list + input)
- Citation display (section reference, page, excerpt)
- "Not enough information" state
- Loading state per message

**Tests**
- Unit: `semanticSearch()` returns ranked chunks (mock pgvector)
- Unit: Zod schema for Q&A response
- Integration: question → retrieval → answer (mock OpenAI)
- Security: prompt injection in question — should be handled safely
- E2E: ask a question → receive cited answer → citation links to section

---

## Phase 6 — Context-Aware Assistant

**Goal:** The Ask tab is upgraded with context awareness, clause explanation,
and suggested questions.

### Deliverables

**Domain service**
- `qa-service.ts` extended:
  - `explainClause()` — explain selected section in plain English
  - `suggestQuestions()` — generate relevant questions for this document type
  - Conversation history in prompt context (last N turns)

**UI**
- Suggested question chips above chat input
- "Explain this clause" button on section navigation
- Conversation history displayed correctly
- Clear conversation action

**Tests**
- Unit: conversation history truncation (too long)
- E2E: click "Explain this clause" → plain-English explanation appears with source

---

## Phase 7 — Action Center

**Goal:** Users can convert findings into review items and manage a checklist.

### Deliverables

**Database**
- `Action` schema
- Drizzle migration

**Domain service**
- `action-service.ts`
  - `createAction()` — from finding or manual
  - `updateActionStatus()`
  - `listActions()` — by document or all

**API / Server Actions**
- Create action from finding
- Update action status
- Delete action

**UI**
- Finding card: "Add to review list" button
- Action Center page: checklist with status badges
- Inline status update (open → in progress → complete → dismissed)
- Filter by document / status

**Tests**
- Integration: create action → persisted → status updates correctly
- E2E: add finding to review list → appears in Action Center → mark complete

---

## Phase 8 — Professional Preparation [COMPLETE]

**Goal:** Users can generate a structured briefing for their lawyer meeting.
**Documentation:** See [Phase 8 Specification](file:///c:/Users/jain_/Documents/PromptwarsExclusive/ClauseWise/docs/phases/08-professional-prep.md)

### Deliverables

**Domain service**
- `lib/services/preparation-service.ts`
  - `getProfessionalPrepData(documentId, userId)` — deterministic assembly of document profile, key clauses, categorized findings, open actions, discussion prompts for counsel, and user Q&A questions.
- `lib/prep/markdown-export.ts`
  - `formatBriefingAsMarkdown()` — zero-DB client-safe markdown formatter for copy-to-clipboard.

**API Route**
- `GET /api/documents/[documentId]/prep` — authenticated, anti-oracle protected retrieval of complete briefing.

**UI**
- `components/prep/`
  - `ProfessionalPrepTab`: Full briefing workspace tab.
  - `PrepDisclaimerBanner` & `PrepDisclaimerFooter`: Explicit non-lawyer disclaimers.
  - `PrepExportControls`: Copy Markdown & Print/Save PDF controls.
  - `PrepDocumentOverview`: Metadata grid (parties, governing law, jurisdiction).
  - `PrepKeyClauses`: Core clauses with section jump navigation.
  - `PrepFindingsReview`: Categorized grounded findings (attention, absent provisions, ambiguities, obligations).
  - `PrepOpenActions`: Review checklist with status toggle and quote references.
  - `PrepQuestionsForCounsel`: Objective inquiry prompts for legal counsel.
  - `PrepUserQuestions`: User-recorded questions from Q&A history.
- `components/workspace/DocumentHeader.tsx` & `DocumentWorkspace.tsx`: Integrated `prep` tab with action badge and bidirectional source navigation.

**Tests**
- Unit: Service tests (`tests/unit/preparation-service.test.ts`), route tests (`tests/unit/preparation-routes.test.ts`), UI tests (`tests/unit/preparation-ui.test.tsx`).
- E2E: Complete journey (`tests/e2e/professional-prep-flow.spec.ts`) covering briefing rendering, key clause jumping, finding excerpt navigation with highlight/focus, and direct URL routing.

---

## Phase 9 — Document Comparison

**Goal:** Users can compare two documents and see meaningful, source-referenced differences.

### Deliverables

**Database**
- `Comparison` schema
- `ComparisonDifference` schema
- Drizzle migrations

**Domain service**
- `comparison-service.ts`
  - `createComparison()` — align sections, identify differences (AI-assisted)
  - `listComparisons()`
  - `getComparison()` with differences

**AI**
- Comparison prompt (structured output: differences with source refs from both documents)

**UI**
- Compare page: document selector (A and B)
- Differences list: added / removed / modified / value changed badges
- Source text from both documents displayed per difference
- No "choose this one" recommendation UI

**Tests**
- Unit: difference type classification
- Unit: Zod schema for comparison output
- Integration: comparison → differences created (mock OpenAI)
- E2E: select two documents → compare → differences listed with sources

---

## Phase 10 — Accessibility, Security, Performance, Testing & Polish

**Goal:** Competition-ready quality pass.

### Deliverables

**Accessibility**
- Full keyboard navigation audit
- Screen reader testing
- ARIA label audit
- Color contrast check
- Focus state review

**Security**
- Rate limiting on upload and AI endpoints
- Full HTTP security headers review
- `pnpm audit` clean pass
- Dependency review

**Performance**
- Image optimization
- Component code splitting
- Database query optimization (indexes review)
- Consider background processing for analysis (if needed)

**Testing**
- Fill gaps in unit coverage
- Full E2E suite green
- Security edge case tests complete

**Polish**
- Loading / error / empty states on all screens
- Responsive layout adjustments
- Disclaimer visibility audit
- README finalized

---

## MVP Scope Summary

| Included | Excluded |
|---|---|
| PDF + DOCX upload | OCR |
| Text extraction | Voice interface |
| Section detection | Mobile app |
| AI findings (analysis) | Enterprise multi-tenancy |
| Document Q&A with citations | Billing |
| Action Center | Lawyer marketplace |
| Professional Prep | Legal advice |
| Document Comparison | Autonomous negotiation |
| Accessible UI | Multiple LLM providers |

---

## Definition of Done (per phase)

- [ ] Database migration applied
- [ ] Domain service implemented and covered by tests
- [ ] API / Server Action validated with Zod
- [ ] UI renders correct states (loading, error, empty, success)
- [ ] Relevant unit tests pass
- [ ] Relevant E2E test passes
- [ ] No secrets committed
- [ ] `pnpm build` succeeds without errors
- [ ] Documentation updated if architecture changed

