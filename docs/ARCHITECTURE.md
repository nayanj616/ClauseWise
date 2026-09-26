# ClauseWise — Architecture

**Version:** 0.1 (living document)

---

## 1. Overview

ClauseWise is a **Next.js App Router** full-stack application backed by
**PostgreSQL + pgvector**, supporting **local Ollama** (`qwen3:4b` and
`nomic-embed-text`) as well as **OpenAI** (`gpt-4o` and
`text-embedding-3-small`) for language understanding and embeddings, and
**Supabase Storage** for private file storage.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router) | Full-stack, file-based routing, Server Actions, RSC |
| Language | TypeScript (strict) | Type safety, IDE support |
| UI | Tailwind CSS + shadcn/ui | Accessible, composable, low overhead |
| Database | PostgreSQL | Relational integrity, pgvector extension |
| ORM | Drizzle ORM | Type-safe, lightweight, migration support |
| Vector search | pgvector | Co-located with relational data, no extra service |
| File storage | Supabase Storage | Managed, S3-compatible, integrates with Postgres auth |
| LLM & Embeddings | Ollama (`qwen3:4b`, `nomic-embed-text`) / OpenAI (`gpt-4o`, `text-embedding-3-small`) | Configurable local inference via `AI_PROVIDER=ollama` with OpenAI fallback preserved |
| Authentication | NextAuth.js (Auth.js v5) | Server-side sessions, credentials provider for MVP |
| Validation | Zod | Runtime schema validation on all API boundaries |
| Unit tests | Vitest | Fast, TypeScript-native |
| E2E tests | Playwright | Cross-browser, accessible selectors |
| Package manager | pnpm | Deterministic, disk-efficient |

---

## 3. Layered Architecture (Implemented)

```
┌──────────────────────────────────────────┐
│           Presentation Layer             │
│  app/  (pages, layouts) & components/    │
│  React Server Components + Client Comps  │
└──────────────────┬───────────────────────┘
                   │ Server Actions / Route Handlers
┌──────────────────▼───────────────────────┐
│         Application Layer                │
│  app/actions/    app/api/                │
│  Input validation (Zod)                  │
│  Session & ownership authorization       │
│  Orchestration of domain calls           │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│          Domain / Service Layer          │
│  lib/services/                           │
│  ├── document-service.ts                 │
│  ├── extraction-service.ts               │
│  ├── extraction-persistence-service.ts   │
│  ├── chunking-service.ts                 │
│  ├── chunk-persistence-service.ts        │
│  ├── intelligence-service.ts             │
│  ├── intelligence-persistence-service.ts │
│  ├── retrieval-service.ts (pgvector RAG) │
│  ├── qa-service.ts (single & SSE stream) │
│  ├── conversation-service.ts             │
│  ├── action-service.ts                   │
│  ├── preparation-service.ts              │
│  └── comparison-service.ts               │
│                                          │
│  lib/intelligence/ (Domain Core & Rules) │
│  ├── evidence-validator.ts               │
│  ├── expectation-catalog.ts              │
│  ├── schemas.ts                          │
│  └── prompts.ts                          │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│        Infrastructure Layer              │
│  lib/db/         — Drizzle + PostgreSQL  │
│                    (pgvector vector(768))│
│  lib/storage/    — Supabase Storage      │
│  lib/ai/         — ollama-client.ts &    │
│                    openai-client.ts      │
│  lib/embeddings/ — 768d adapter & guard  │
└──────────────────────────────────────────┘
```

Rules:
- UI components never call infrastructure directly
- Domain services own business logic and enforce tenant ownership (`userId`)
- Infrastructure modules are pure adapters with no business logic
- Server Actions and Route Handlers handle authentication, Zod input validation, and error sanitization

---

## 4. Directory Structure (Implemented)

```
clausewise/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     # Public Landing Page (Implemented)
│   ├── (auth)/
│   │   ├── sign-in/page.tsx         # Credentials sign-in
│   │   └── sign-up/page.tsx         # Account registration
│   ├── (app)/                       # Protected application routes
│   │   ├── layout.tsx               # Sidebar, MobileNav & session guard
│   │   ├── dashboard/page.tsx       # Mission control dashboard
│   │   ├── documents/
│   │   │   ├── page.tsx             # Upload dropzone & document library
│   │   │   └── [documentId]/
│   │   │       └── page.tsx         # Flagship Document Workspace (4 tabs:
│   │   │                            #   analysis, document, ask, prep)
│   │   ├── compare/page.tsx         # Side-by-side comparison workspace
│   │   └── actions/page.tsx         # Action Center review checklist
│   ├── actions/
│   │   └── auth.ts                  # signInAction, signUpAction, signOutAction
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── actions/
│       │   ├── route.ts             # GET, POST /api/actions
│       │   └── [actionId]/route.ts  # GET, PATCH, DELETE /api/actions/[actionId]
│       └── documents/
│           ├── upload/route.ts      # POST /api/documents/upload
│           ├── compare/route.ts     # GET /api/documents/compare
│           └── [documentId]/
│               ├── ask/route.ts     # POST /api/documents/[documentId]/ask
│               ├── conversations/   # Thread CRUD & SSE streaming messages
│               └── prep/route.ts    # GET /api/documents/[documentId]/prep
├── components/
│   ├── ui/                          # shadcn/ui primitives
│   ├── auth/                        # SignInForm, SignUpForm
│   ├── document/                    # DocumentUpload
│   ├── workspace/                   # DocumentWorkspace, Header, Overview, Viewer,
│   │                                # FindingCard, FindingList, EvidencePanel, AskPanel
│   ├── prep/                        # ProfessionalPrepTab & briefing cards
│   ├── compare/                     # ComparisonWorkspace & diff components
│   ├── actions/                     # ActionCenter, ActionCard, CreateActionDialog
│   └── shared/                      # Sidebar, MobileNav, Logo
├── lib/
│   ├── db/                          # schema.ts, index.ts, migrations (0000–0009)
│   ├── storage/                     # storage-client.ts (Supabase private bucket)
│   ├── ai/                          # ollama-client.ts & openai-client.ts
│   ├── embeddings/                  # embeddings-client.ts (768d nomic-embed-text)
│   ├── extraction/                  # PDF (unpdf), DOCX (mammoth), TXT & section detector
│   ├── intelligence/                # schemas.ts, prompts.ts, evidence-validator.ts,
│   │                                # expectation-catalog.ts
│   ├── prep/                        # markdown-export.ts
│   ├── qa/                          # qa-client.ts (HTTP & SSE client helpers)
│   ├── upload/                      # upload-client.ts
│   ├── validation/                  # document-validation.ts
│   ├── workspace/                   # highlight.ts & formatters.ts
│   └── services/                    # Domain services (see Section 3)
├── types/                           # Shared domain & NextAuth types
├── Dockerfile                       # Multi-stage non-root Node 22 build
├── docker-compose.yml               # Co-located Ollama + Next.js + Caddy topology
├── Caddyfile                        # HTTPS edge proxy (unbuffered SSE, 25 MB limit)
├── docs/                            # Product, architecture, phase & audit docs
└── tests/
    ├── unit/                        # 53 Vitest unit & service test suites
    └── e2e/                         # 9 Playwright E2E test suites
```

*(Note: In the initial conceptual layout, Professional Prep was sketched as a separate `/prepare/[documentId]` page. In the implemented architecture, Professional Prep is integrated directly as the `Professional Prep` tab inside `/documents/[documentId]?tab=prep` backed by `GET /api/documents/[documentId]/prep` so users can jump seamlessly between the consultation briefing and highlighted verbatim source clauses without leaving the workspace.)*

---

## 5. Document Processing Pipeline: Implemented vs. Intended Production

### 5.1 Currently Implemented Pipeline (Synchronous Request Execution)

In the current codebase (`app/api/documents/upload/route.ts` and `lib/services/document-service.ts`), `POST /api/documents/upload` invokes `uploadDocument({ userId, file, processExtraction: true })`, which executes extraction, chunking, 768d embedding generation, and AI intelligence **synchronously** within the upload request:

```
POST /api/documents/upload
  ↓
1. Server-side file validation (MIME, extension, 10 MB limit, %PDF- / OOXML ZIP magic bytes, filename sanitization)
  ↓
2. Upload to private Supabase Storage bucket ("documents")
  ↓
3. Insert Document record in PostgreSQL (status: queued; rolls back Storage on DB failure)
  ↓
4. processDocumentExtraction(documentId) [Synchronous]
     ├─ status: extracting
     ├─ Download file buffer from private Supabase Storage
     ├─ Extract text (unpdf for PDF, mammoth for DOCX, UTF-8 for TXT) & detect legal sections
     └─ Atomic DB Transaction (persistDocumentExtraction):
          ├─ Replace document_sections & document_chunks (idempotent)
          ├─ Deterministic section-aware chunking (max 1500 chars)
          └─ Update document page_count & status: ready (Phase 2 baseline)
  ↓
5. processDocumentIntelligence(documentId) [Synchronous]
     ├─ status: analyzing
     ├─ Generate & persist 768-dimensional embeddings (Ollama nomic-embed-text -> document_chunks.embedding vector(768))
     ├─ Bounded input context (max 240,000 chars) wrapped in === UNTRUSTED DOCUMENT CONTENT === delimiters
     ├─ Structured LLM inference (Ollama qwen3:4b default; OpenAI gpt-4o optional adapter)
     ├─ Discriminated Zod schema validation (strictly zero numerical risk scores)
     ├─ Deterministic Evidence Validation (verifySectionExcerptEvidence against persisted section text; authoritative DB UUIDs)
     └─ Atomic DB Transaction (persistDocumentIntelligence):
          ├─ Replace document_findings & update classification/parties/governing_law/jurisdiction/metadata
          └─ Update document status: ready
  ↓
6. Return 201 Created with processed Document record ◄── UI navigates to /documents/[documentId]
```

**Failure Isolation (Implemented):** If any step in `processDocumentExtraction` or `processDocumentIntelligence` fails, the transaction rolls back partial writes, preserves Phase 2 sections/chunks if already extracted, transitions the document to `status: error` with a sanitized `error_message`, and renders `DocumentErrorState` in the workspace.

### 5.2 Intended Production Target Pipeline (Planned Asynchronous Queue)

Because synchronous CPU-bound inference with `qwen3:4b` takes ~103–111 seconds for a 2-page NDA (or ~8–15 seconds on GPU), the **intended production target architecture** decouples the HTTP upload response from background processing:

- **Upload Decoupling (Planned)**: `POST /api/documents/upload` returns `201 Created` (`status: queued`) immediately after step 3 (database record creation) and dispatches `processDocument(documentId)` out-of-band via a background job queue or `waitUntil()`.
- **Status Polling Endpoint (Planned — Not Yet Implemented)**: A lightweight `GET /api/documents/[id]/status` endpoint polled by the browser to observe live transitions (`queued` $\rightarrow$ `extracting` $\rightarrow$ `chunking` $\rightarrow$ `analyzing` $\rightarrow$ `ready` / `error`) before opening the workspace.

### 5.3 Evidence-First Intelligence Invariant (Implemented)
The LLM is an inference mechanism, **never the source of truth**.
Every substantive finding and metadata item is grounded in persisted document evidence. Model-generated UUIDs are disregarded; section and chunk IDs are resolved strictly from database records. Missing provisions (`missing_information`) are strictly absence-based and grounded in the Core Provision Catalog (`CORE_PROVISION_CATALOG`) with zero fabricated citations. Phase 2 sections and chunks remain completely immutable during intelligence processing.

---

## 6. Retrieval-Augmented Generation (RAG) Pattern (Implemented)

For every document-specific Q&A query (`POST /api/documents/[documentId]/ask` and SSE streaming `POST /api/documents/[documentId]/conversations/[conversationId]/messages`):

```
User question (+ optional active sectionId context)
      │
      ▼
Verify document & section ownership (anti-oracle 404 on mismatch)
      │
      ▼
Embed question via local Ollama nomic-embed-text (768 dimensions)
  [EmbeddingDimensionError blocks 1536d OpenAI calls while DB is vector(768)]
      │
      ▼
Tiered pgvector cosine distance search (<=>) in document_chunks:
  1. If sectionId provided: search within target section first
  2. If insufficient section evidence: fallback to remainder of same document (fallbackUsed = true)
  3. Filter candidates by similarity >= minSimilarity (default 0.20, topK = 5)
      │
      ├─► If 0 chunks pass threshold (hasSufficientEvidence = false):
      │     Return deterministic refusal banner immediately (ZERO LLM calls)
      │
      ▼
Assemble 3-tier prompt window:
  [System instructions & non-lawyer persona]
  + [Bounded conversational history (<= 3 turns, labeled non-evidence)]
  + [=== UNTRUSTED DOCUMENT EVIDENCE === (retrieved chunks)]
  + [Current user question]
      │
      ▼
Structured LLM generation:
  Ollama qwen3:4b (default, with <think> tag stripping & GBNF JSON schema)
  or OpenAI gpt-4o (optional when AI_PROVIDER=openai and valid key configured)
      │
      ▼
Parse & validate against ModelQaOutputSchema ({ answer, citedChunkIds })
      │
      ▼
Authoritative Citation Verification:
  Match citedChunkIds strictly against retrieved application chunks;
  derive sectionId, pageNumber (e.g., Page 2 in the NDA governing-law demo),
  and verbatim sourceText exclusively from DB records; strip unknown IDs
      │
      ▼
Return / stream grounded answer + verified citations to AskPanel
```

---

## 7. Rendering Strategy (Implemented)

| Route | Rendering Strategy | Status |
|---|---|---|
| `/` (Landing Page) | Static Server Component (RSC) | **Implemented** |
| `/dashboard` | Dynamic Server Component (`requireSession`) | **Implemented** |
| `/documents` | RSC library table + client `DocumentUpload` dropzone | **Implemented** |
| `/documents/[documentId]` | RSC shell + tabbed client `DocumentWorkspace` (`analysis`, `document`, `ask`, `prep`) | **Implemented** |
| `/api/documents/[documentId]/conversations/[conversationId]/messages` | Streaming Route Handler (`text/event-stream` SSE) | **Implemented** |
| `/compare` | RSC shell + client `ComparisonWorkspace` (`GET /api/documents/compare`) | **Implemented** |
| `/actions` | RSC shell + client `ActionCenter` (`GET/POST/PATCH/DELETE /api/actions`) | **Implemented** |

---

## 8. Architectural Decisions & Status

| Decision | Status | Resolution & Notes |
|---|---|---|
| Text extraction & viewer | **Implemented (Phase 2)** | Pure in-memory extraction (`unpdf` for PDF with physical page mapping, `mammoth` for DOCX, UTF-8 for TXT) paired with section-navigable `DocumentViewer` and `<mark>` excerpt highlighting. |
| Streaming chat protocol | **Implemented (Phase 5)** | Server-Sent Events (SSE) with `status`, provisional `delta`, and terminal authoritative `complete` event carrying verified citations. |
| Database & file storage | **Implemented (Phases 0–1)** | Supabase PostgreSQL (`pgvector`) + private Supabase Storage (`documents` bucket) accessed exclusively via server-side service role key. |
| Local Ollama + `vector(768)` migration | **Implemented (Production Audit)** | Migrated `document_chunks.embedding` to `vector(768)` (`0009_great_vision.sql`) for local `nomic-embed-text` (`768d`) and `qwen3:4b` generation, with `EmbeddingDimensionError` guarding against 1536d mismatch. |
| Containerized VM + Caddy topology | **Implemented Locally / Unverified in Cloud** | `Dockerfile`, `docker-compose.yml` (`ollama`, `ollama-init`, `app`, `caddy`), and `Caddyfile` validated locally; cloud VM provisioning remains pending. |
| Asynchronous upload queue & status polling | **Planned (Post-MVP)** | Transition `POST /api/documents/upload` from synchronous execution to background worker + `GET /api/documents/[id]/status` polling for large documents. |


