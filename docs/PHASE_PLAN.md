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

**Goal:** Uploaded document text is extracted and sections are detected
asynchronously after upload. The document workspace shows extracted content
once processing completes. The upload HTTP request **does not block** on
extraction.

### Processing Model (established here, extended in Phase 3)

```
POST /api/documents/upload
  → validate + store file → create Document (status: queued) → return 201
  → [server] trigger processDocument(documentId) out-of-band

processDocument(documentId):
  → set status: extracting
  → extractText() + detectSections() → save DocumentSection rows
  → set status: extracted  (Phase 2 terminal state)
  → [Phase 3 extends this to: chunking → embedding → analysis → ready]
```

**Trigger mechanism (MVP):** A Next.js Route Handler that calls
`processDocument()` via a fire-and-forget `fetch` to itself using
`waitUntil` (Vercel) or an equivalent non-blocking call. No external
queue service is introduced in MVP.

**Status polling:** The UI polls `GET /api/documents/[id]/status`
(or uses a short-interval client refetch) until status reaches `extracted`
or `ready`. Document status is always visible in the workspace header and
document list card.

### Deliverables

**Database**
- `DocumentSection` schema
- Drizzle migration
- `Document.status` enum extended: `queued | extracting | extracted | chunking | analyzing | ready | error`

**Domain service**
- `extraction-service.ts`
  - `extractText()` — PDF (pdf-parse) and DOCX (mammoth)
  - `detectSections()` — heuristic heading/clause detection; saves sections to DB
  - `processDocument()` — orchestrates extraction pipeline for one document;
    updates status at each step; catches and records errors without crashing caller

**API**
- `POST /api/documents/[id]/process` — internal route that runs `processDocument()`;
  called fire-and-forget after upload; protected (server-to-server only, not browser-accessible)
- `GET /api/documents/[id]/status` — returns current `status` field for polling

**UI**
- Document Workspace shell (three-panel layout)
- Left panel: section navigation
- Center panel: document text viewer (rendered from extracted sections)
- Right panel: placeholder (Phase 3)
- Processing status banner in workspace and document list card
- Status values shown to user: "Queued", "Extracting…", "Ready", "Error"

**Tests**
- Unit: `detectSections()` with various heading formats
- Unit: `processDocument()` — status transitions (queued → extracting → extracted → error on failure)
- Integration: trigger processDocument → sections created in DB; status updated (PostgreSQL test DB)
- Integration: extraction failure → status set to `error`; no unhandled exception propagated
- E2E: upload document → status badge updates → open workspace → see section navigation

---

## Phase 3 — Document Intelligence

**Goal:** The async `processDocument()` pipeline established in Phase 2 is
extended to cover chunking, embedding, and AI analysis. Once extraction
completes, the pipeline continues automatically — no new HTTP request from
the browser is needed. The Document Workspace shows the Overview and Analyze
tabs once `status = ready`.

**Extended pipeline (Phase 3 adds the bottom half):**
```
processDocument(documentId):
  → [Phase 2] extracting → extracted
  → [Phase 3] chunking  → chunk + embed each section
  → [Phase 3] analyzing → classify document, extract findings
  → ready
  (error at any step → status: error, error_message saved)
```

### Deliverables

**Database**
- `DocumentChunk` schema (with `embedding vector(1536)`)
- `DocumentFinding` schema
- `Obligation` schema
- `ImportantDate` schema
- Drizzle migrations + pgvector index

**Domain service**
- `chunking-service.ts` — section-aware chunking, max ~500 tokens, overlap
- `embeddings-service.ts` — embed chunks, store vectors
- `analysis-service.ts`
  - `classifyDocument()` — document type, parties, governing law
  - `extractFindings()` — structured findings extraction (OpenAI structured output)
  - `extractObligations()`
  - `extractImportantDates()`
- `extraction-service.processDocument()` — extended to call chunking + embedding + analysis
  steps after extraction; sets `status: chunking` → `analyzing` → `ready`

**AI Prompts**
- System prompt template with security wrapper
- Classification prompt
- Findings extraction prompt (with Zod-validated output schema)

**UI**
- Right panel: Overview tab (summary, parties, key terms, financial terms)
- Right panel: Analyze tab (findings list, grouped by type)
- Finding card component with badge, summary, source reference
- Click finding → scroll center panel to source section
- Status polling continues: workspace reflects `chunking` → `analyzing` → `ready` states

**Tests**
- Unit: chunking algorithm (overlap, size limits)
- Unit: Zod schema for findings (valid + invalid AI responses)
- Unit: prompt injection test (document content cannot override system instructions — mock AI)
- Integration: full pipeline on extracted document → chunks + embeddings + findings in DB
  (mock OpenAI; real PostgreSQL + pgvector test DB)
- Integration: analysis pass → findings created (mock OpenAI with valid response)
- Integration: pipeline failure mid-way → status error; previously committed rows not corrupted
- E2E: upload document → status progresses through states → workspace populated

---

## Phase 4 — Evidence-backed Analysis Display

**Goal:** Findings are linked to source document sections. Clicking a finding
highlights and scrolls to the source in the document viewer.

### Deliverables

**Domain service**
- `retrieval-service.ts` — `findingsByDocument()`, `findingsByType()`, `findingWithEvidence()`

**UI**
- Source highlight on document viewer (highlight matched section when finding selected)
- "View in document" behavior
- Attention items summary section
- Important dates list with formatted dates
- Financial terms list

**Tests**
- Unit: source reference mapping (finding → section → page)
- E2E: click a finding → document scrolls to correct section and highlights it

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

## Phase 8 — Professional Preparation

**Goal:** Users can generate a structured briefing for their lawyer meeting.

### Deliverables

**Domain service**
- `preparation-service.ts`
  - `generateBriefing()` — structured briefing from findings, obligations, dates, actions

**AI**
- Briefing generation prompt (structured output: sections with source refs)

**UI**
- Professional Prep page (per document)
- Structured briefing display: key terms, important clauses, discussion areas, suggested questions
- Print / copy to clipboard action

**Tests**
- Unit: Zod schema for briefing output
- Integration: briefing generation (mock OpenAI)
- E2E: generate briefing → structured output rendered correctly

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

