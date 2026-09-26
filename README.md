# ClauseWise

**AI-powered legal document navigator** — built for the Prompt Wars "AI for Legal Assistance & Access" challenge.

> ClauseWise helps users understand legal documents through **Evidence, Meaning, and Action**. It supports document understanding and structured preparation for attorney review; it is **not a substitute for professional legal advice** and does not replace legal counsel.

---

## Core Principle: EVIDENCE → MEANING → ACTION

Every AI response is anchored in verbatim document evidence, translated into plain English meaning, and connected to concrete review actions and questions for legal counsel — never speculation or numerical risk scores.

### Demonstrated Submission Workflow
The baseline ClauseWise workflow demonstrated in the submission covers:
1. **Document Analysis & Extracted Clauses**: Uploading and analyzing a legal agreement (such as a Mutual Non-Disclosure Agreement or Master Services Agreement) to identify document classification, parties, governing law, jurisdiction, key dates, financial terms, obligations, ambiguities, and absent standard provisions.
2. **Source-Linked Evidence**: Inspecting extracted findings alongside verbatim source excerpts, section headings, and page numbers, with one-click navigation (`View in Document Text`) that scrolls to and highlights the exact clause in the document viewer.
3. **Grounded Question Answering with Citations**: Asking natural-language questions about the agreement (for example, asking for the governing law in the demonstrated NDA workflow and receiving a grounded answer with a supporting citation to **Page 2**, or refusing to guess when the document lacks evidence).
4. **Structured Attorney Preparation Checklist**: Converting findings into trackable review checklist items in the **Action Center** and assembling a structured **Professional Prep** consultation briefing (key clauses, open review items, user Q&A history, and neutral discussion prompts for legal counsel) ready to copy as Markdown or print/save as PDF.

---

## Feature & Implementation Status

In accordance with repository documentation accuracy standards, capabilities are labeled as **Implemented**, **Partially Implemented**, **Planned**, or **Unverified**:

| Capability / Subsystem | Status | Implementation & Verification Notes |
|---|---|---|
| **Public Landing Page (`/`) & Auth (`/sign-in`, `/sign-up`)** | **Implemented** | NextAuth.js v5 credentials auth (`bcryptjs`), JWT session enforcement, protected route middleware, and public landing page with workflow overview and legal disclaimers. |
| **Secure Document Upload (`POST /api/documents/upload`)** | **Implemented** | Supports PDF (`.pdf`) and Word (`.docx`) up to 10 MB; server-side MIME, extension, magic-byte (`%PDF-`, `%%EOF`), and OOXML ZIP verification; filename sanitization; private Supabase Storage (`documents` bucket) with DB failure rollback. |
| **Text Extraction, Section Detection & Chunking** | **Implemented** | In-memory PDF (`unpdf`), DOCX (`mammoth`), and UTF-8 text extraction; heuristic legal section detection (`document_sections`); deterministic boundary-preserving chunking (`document_chunks`). |
| **Evidence-First Document Intelligence** | **Implemented** | Classification, structured metadata (parties, governing law, jurisdiction, dates, financials), up to 30 grounded findings per document, `CORE_PROVISION_CATALOG` absence detection (`missing_information`), and deterministic substring evidence validation (`verifySectionExcerptEvidence`). Zero numerical risk scores. |
| **Document Workspace & Source Highlighting** | **Implemented** | Tabbed workspace at `/documents/[documentId]` (`Intelligence & Findings`, `Document Text`, `Ask`, `Professional Prep`) with master-detail `FindingList` + `EvidencePanel` and verbatim `<mark>` highlighting in `DocumentViewer`. |
| **Grounded Q&A & Contextual Assistant** | **Implemented** | Single-turn (`POST /api/documents/[documentId]/ask`) and multi-turn SSE streaming (`POST /api/documents/[documentId]/conversations/[conversationId]/messages`), section-scoped context (`Ask about this section`), pgvector cosine similarity retrieval, citation coordinate verification, and zero-LLM refusal when evidence is insufficient. |
| **Action Center (`/actions`) & Professional Prep** | **Implemented** | Convert findings into review checklist items (`open` / `completed`) with source links; deterministic attorney consultation briefing (`GET /api/documents/[documentId]/prep`) with Markdown copy and Print/PDF export. |
| **Side-by-Side Document Comparison (`/compare`)** | **Implemented** | On-demand deterministic 4-tier section alignment (metadata, normalized title, provision catalog keywords, controlled Jaccard fallback $\ge 0.45$) categorizing clauses as `Modified`, `Added`, `Removed`, or `Unchanged` with deep links into both workspaces. |
| **Local Ollama (`qwen3:4b` + `nomic-embed-text` `768d`)** | **Implemented** | Default AI generation (`qwen3:4b`) and 768-dimensional embedding pipeline (`nomic-embed-text` with PostgreSQL `vector(768)` in migration `0009_great_vision.sql`). Verified locally against remote Supabase PostgreSQL and Storage. |
| **OpenAI Text-Generation Adapter (`gpt-4o`)** | **Partially Implemented** | Adapter code (`lib/ai/openai-client.ts`) is implemented for optional text generation (`AI_PROVIDER=openai`), but disabled by default (`OPENAI_API_KEY` unset). `1536d` OpenAI embeddings are intentionally blocked by `EmbeddingDimensionError` while the database column is `vector(768)`. |
| **Dashboard & Document Library (`/dashboard`, `/documents`)** | **Partially Implemented** | Live document/action counters, recent documents, onboarding state, and document library table are implemented. Client search/filter controls on `/documents` and a global upcoming-dates widget on `/dashboard` remain **Planned** (dates and filters are currently scoped inside the Document Workspace, `/compare`, and `/actions`). |
| **Asynchronous Background Processing & Status Polling** | **Planned** | Upload currently executes extraction, embedding, and AI analysis synchronously inside `POST /api/documents/upload`. Decoupled background job queuing (`waitUntil` / worker queue) and `GET /api/documents/[id]/status` polling are **Planned** for production scale. |
| **Application-Level API Rate Limiting (`429`)** | **Planned** | Per-user/per-IP `429 Too Many Requests` rate limiting on AI and upload routes is **Planned** (currently bounded only by edge payload limits and Ollama concurrency settings). |
| **Docker Compose + Caddy VM Deployment** | **Unverified (Staging Pending)** | `Dockerfile`, `docker-compose.yml`, and `Caddyfile` are implemented and locally validated with Caddy v2.9.1, but live cloud VM provisioning and public HTTPS deployment remain **Unverified / Pending**. |

---

## Architecture: Implemented vs. Intended Production

### 1. Application Layering (Implemented)

```
UI (app/, components/)
  ↓
Server Actions / Route Handlers (app/actions/, app/api/)
  ↓
Domain Services (lib/services/)
  ↓
Domain Core & Validation (lib/intelligence/, lib/validation/, lib/workspace/)
  ↓
Infrastructure Adapters (lib/db/, lib/storage/, lib/ai/, lib/embeddings/)
```

### 2. Evidence-First Intelligence Pipeline (Implemented)

```
Persisted Sections (document_sections)
    ↓
Deterministic Chunks (document_chunks) + 768d Embeddings (nomic-embed-text)
    ↓
Bounded Intelligence Input (max 240k chars, untrusted content delimiters)
    ↓
LLM Structured Output (Ollama qwen3:4b default / OpenAI gpt-4o optional)
    ↓
Zod Discriminated Schema Validation (strictly no numerical risk scores)
    ↓
Deterministic Evidence Validation (verifySectionExcerptEvidence against DB text)
    ↓
Atomic Transactional Persistence (document_findings + document status: ready)
    ↓
Grounded Intelligence Workspace (Analysis, Document Text, Ask, Professional Prep)
```

### 3. Currently Implemented vs. Intended Production Topology

| Architectural Dimension | Currently Implemented Architecture | Intended Production Architecture (Planned) |
|---|---|---|
| **Upload & Analysis Execution** | **Synchronous in-request pipeline**: `POST /api/documents/upload` validates the file, stores to Supabase Storage, extracts sections/chunks, generates `768d` embeddings, runs `qwen3:4b` analysis, and returns HTTP `201` once `ready` (or `error`). | **Asynchronous background pipeline**: `POST /api/documents/upload` returns `201` (`status: queued`) immediately after storage write; background worker processes extraction and analysis out-of-band while the client polls `GET /api/documents/[id]/status`. |
| **AI & Embedding Runtime** | **Co-located Local Ollama**: `qwen3:4b` (chat/structured JSON) and `nomic-embed-text` (`768d` vectors stored in `document_chunks.embedding` `vector(768)`) running at `OLLAMA_BASE_URL` (`http://localhost:11434`), with `OLLAMA_TIMEOUT_MS=180000` for CPU inference. | **GPU-Accelerated Inference Host**: Dedicated VM with NVIDIA GPU (or hybrid cloud inference) running behind `docker-compose.yml` + `Caddyfile` reverse proxy on internal bridge network `clausewise_internal`, reducing multi-step analysis latency from ~100s (CPU) to ~8–15s (GPU). |
| **Workspace & Prep Routing** | **Unified Tabbed Document Workspace**: Overview, Findings, Document Viewer, Contextual Ask, and Professional Prep are unified under `/documents/[documentId]` (`?tab=analysis\|document\|ask\|prep`). | **Unified Workspace + Optional Standalone Routes**: Preserves `/documents/[documentId]` tabs with optional background PDF rendering and rate-limited public edge endpoints. |

---

## Tech Stack

| Concern | Choice | Status |
|---|---|---|
| Framework | Next.js 15 (App Router) | Implemented |
| Language | TypeScript (strict mode) | Implemented |
| UI | Tailwind CSS + shadcn/ui | Implemented |
| Database | PostgreSQL + `pgvector` (`vector(768)`) | Implemented |
| ORM | Drizzle ORM (`lib/db/schema.ts`, migrations `0000`–`0009`) | Implemented |
| Auth | NextAuth.js v5 (Credentials + `bcryptjs`, JWT sessions) | Implemented |
| File Storage | Supabase Storage (private `documents` bucket) | Implemented |
| AI Generation | Local Ollama `qwen3:4b` (default) / OpenAI `gpt-4o` (optional adapter) | Implemented |
| Embeddings | Local Ollama `nomic-embed-text` (`768` dimensions) | Implemented |
| Validation | Zod | Implemented |
| Testing | Vitest (`53` unit test files) + Playwright (`9` E2E spec files) | Implemented |
| Deployment Config | Docker Compose + Multi-stage `Dockerfile` + `Caddyfile` | Implemented (VM deployment pending) |
| Package Manager | pnpm | Implemented |

---

## Getting Started

### Prerequisites

- Node.js 20+ (Node.js 22 recommended)
- pnpm 9+
- PostgreSQL 15+ with the **`pgvector` extension** enabled (e.g., Supabase PostgreSQL)
- Supabase project with a private Storage bucket named `documents`
- [Ollama](https://ollama.com/) installed locally with `qwen3:4b` and `nomic-embed-text` pulled:
  ```bash
  ollama pull qwen3:4b
  ollama pull nomic-embed-text
  ```

### 1. Clone and install

```bash
git clone https://github.com/your-username/ClauseWise.git
cd ClauseWise
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local and fill in all required values
```

Key environment variables (see [`.env.example`](.env.example) for full documentation):

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`pgvector` enabled) |
| `NEXTAUTH_SECRET` | Yes | Random string $\ge$ 32 chars (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Yes | Canonical URL of deployment (e.g., `http://localhost:3000`) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only; never expose to client) |
| `AI_PROVIDER` | Yes (default `ollama`) | `"ollama"` (default) or `"openai"` (if valid `OPENAI_API_KEY` is provided) |
| `EMBEDDING_PROVIDER` | Yes (default `ollama`) | Must remain `"ollama"` (`768d` `nomic-embed-text`) to match `vector(768)` schema |
| `OLLAMA_BASE_URL` | Optional | Defaults to `http://localhost:11434` |
| `OLLAMA_CHAT_MODEL` | Optional | Defaults to `qwen3:4b` |
| `OLLAMA_EMBEDDING_MODEL` | Optional | Defaults to `nomic-embed-text` |
| `OLLAMA_TIMEOUT_MS` | Optional | Defaults to `180000` (3 minutes for local CPU inference) |
| `OPENAI_API_KEY` | Optional | Leave unset/empty in pure Ollama setups; required only if `AI_PROVIDER=openai` |

### 3. Set up the database

```bash
# Enable the pgvector extension (run once)
pnpm db:setup

# Apply Drizzle migrations (0000 through 0009, including vector(768))
pnpm db:migrate
```

### 4. Run the development server

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the public Landing Page. From there, navigate to `/sign-up` to create an account or `/sign-in` to access the protected `/dashboard` and `/documents` workspaces.

### 5. Run tests

```bash
# Unit & service tests (Vitest: 53 test files in tests/unit/)
pnpm test

# E2E browser tests (Playwright: 9 spec files in tests/e2e/)
pnpm test:e2e
```

---

## Project Structure

```
clausewise/
├── app/
│   ├── page.tsx                 # Public Landing Page (Evidence → Meaning → Action)
│   ├── (auth)/                  # Sign-in (/sign-in) and sign-up (/sign-up) pages
│   ├── (app)/                   # Protected routes (enforced via requireSession())
│   │   ├── layout.tsx           # Protected shell with Sidebar, MobileNav & skip-link
│   │   ├── dashboard/           # Mission control metrics, onboarding & recent docs
│   │   ├── documents/           # Document upload & library table
│   │   │   └── [documentId]/    # Grounded Intelligence Workspace (4 tabs)
│   │   ├── compare/             # Side-by-side document comparison workspace
│   │   └── actions/             # Action Center review checklist
│   ├── test-workspace/          # E2E test harness route (guarded in production)
│   ├── test-actions/            # E2E test harness route (guarded in production)
│   ├── test-compare/            # E2E test harness route (guarded in production)
│   ├── actions/                 # Server Actions (auth.ts)
│   └── api/
│       ├── auth/                # NextAuth Route Handler
│       ├── actions/             # GET/POST /api/actions, GET/PATCH/DELETE /api/actions/[actionId]
│       └── documents/
│           ├── upload/          # POST /api/documents/upload
│           ├── compare/         # GET /api/documents/compare
│           └── [documentId]/
│               ├── ask/         # POST /api/documents/[documentId]/ask
│               ├── conversations/# Multi-turn Q&A threads & SSE streaming messages
│               └── prep/        # GET /api/documents/[documentId]/prep
├── components/
│   ├── actions/                 # ActionCenter, ActionCard, CreateActionDialog
│   ├── auth/                    # SignInForm, SignUpForm
│   ├── compare/                 # ComparisonWorkspace, DifferenceCard, DifferencesList, etc.
│   ├── document/                # DocumentUpload (accessible dropzone)
│   ├── prep/                    # ProfessionalPrepTab, export controls, counsel questions
│   ├── workspace/               # DocumentWorkspace, Header, Overview, Viewer, AskPanel, etc.
│   ├── shared/                  # Sidebar, MobileNav, Logo
│   └── ui/                      # shadcn/ui primitives
├── lib/
│   ├── ai/                      # ollama-client.ts & openai-client.ts boundaries
│   ├── auth/                    # Session utilities (requireSession, assertOwnership)
│   ├── db/                      # Drizzle schema (schema.ts), client, migrations (0000–0009)
│   ├── embeddings/              # 768d embeddings client & dimension guard
│   ├── env.ts                   # Lazy Zod environment variable validation
│   ├── extraction/              # PDF/DOCX/TXT extractors & heuristic section detector
│   ├── intelligence/            # Evidence validator, expectation catalog, schemas, prompts
│   ├── prep/                    # Markdown consultation briefing exporter
│   ├── qa/                      # Client Q&A and SSE stream consumer helpers
│   ├── services/                # Domain services (document, extraction, chunk, intelligence, retrieval, qa, conversation, action, preparation, comparison)
│   ├── storage/                 # Private Supabase Storage client (documents bucket)
│   ├── upload/                  # Client upload validation & dispatch
│   ├── validation/              # Server-side magic-byte, OOXML & path sanitization
│   └── workspace/               # Verbatim text highlight engine & date/financial formatters
├── tests/
│   ├── unit/                    # 53 Vitest unit & service test suites
│   └── e2e/                     # 9 Playwright E2E test specs
├── Dockerfile                   # Multi-stage non-root Node 22 container definition
├── docker-compose.yml           # Co-located Ollama + Next.js + Caddy topology
├── Caddyfile                    # Reverse proxy with unbuffered SSE & 25 MB limit
├── docs/                        # Product, architecture, data model, phase specs & audit docs
└── AGENTS.md                    # Engineering & AI safety rules
```

---

## Implementation Phases

| Phase | Vertical Slice | Status |
|---|---|---|
| 0 | Foundation (Auth, DB, UI shell, security baseline) | ✅ Implemented |
| 1 | Secure Document Upload (PDF/DOCX validation, Supabase Storage) | ✅ Implemented |
| 2 | Text Extraction, Section Detection, Viewer & Deterministic Chunking | ✅ Implemented |
| 3 | Document Intelligence Contract, Evidence Validation & Workspace | ✅ Implemented |
| 4 | Evidence-Backed Analysis Display & Source Text Highlighting | ✅ Implemented |
| 5 | Document-Grounded Q&A, Citations & Multi-Turn SSE Streaming | ✅ Implemented |
| 6 | Contextual Assistant (Section-Scoped Q&A & Provenance Fallback) | ✅ Implemented |
| 7 | Action Center (Review Checklist & Provenance Links) | ✅ Implemented |
| 8 | Professional Prep (Attorney Consultation Briefing & Export) | ✅ Implemented |
| 9 | Document Comparison (Deterministic Multi-Tier Alignment) | ✅ Implemented |
| 10 | Accessibility, Error Boundaries, Library Polish & Deployment Config | ✅ Implemented (Cloud VM rollout pending) |

See [`docs/PHASE_PLAN.md`](docs/PHASE_PLAN.md) and [`docs/PRODUCTION_AUDIT.md`](docs/PRODUCTION_AUDIT.md) for detailed slice documentation and production validation logs.

---

## Known Limitations & Pending Production Work

1. **Synchronous Upload Processing Latency on CPU**: `POST /api/documents/upload` currently runs extraction, 768-dimensional embedding generation, and `qwen3:4b` structured analysis synchronously in a single request. On CPU-only hardware (`size_vram: 0`), processing a 2-page NDA takes ~103–111 seconds and grounded Q&A takes ~30–34 seconds. Moving to an asynchronous background job queue with status polling and GPU-backed Ollama inference is planned for production scale.
2. **Embedding Dimension Pinning (`vector(768)`)**: Because `public.document_chunks.embedding` is migrated to `vector(768)` (`nomic-embed-text`), `EMBEDDING_PROVIDER` must remain `"ollama"`. Calling 1,536-dimensional OpenAI embeddings is blocked by `EmbeddingDimensionError` unless a future schema migration alters the vector column.
3. **Sub-Clause Granularity & Heuristic Section Detection**: Section boundaries are detected heuristically from headings and numbering (`lib/extraction/section-detector.ts`), and scanned image-only PDFs without an embedded text layer are not supported (OCR is out of scope for MVP).
4. **Pending Production Infrastructure Rollout**: While `Dockerfile`, `docker-compose.yml`, and `Caddyfile` are validated locally, provisioning the target production Linux VM, configuring public DNS/TLS certificates, and adding application-level `429` rate limiting remain pending.

---

## Security & Privacy Summary

- **Server-Only Secrets**: `DATABASE_URL`, `NEXTAUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and AI credentials are restricted to server-side modules and never exposed in client bundles.
- **Tenant & Document Isolation**: Every query in `lib/services/` scopes access by authenticated `session.user.id` and returns uniform anti-oracle `404` responses on unauthorized or nonexistent IDs.
- **Prompt Injection Defense**: Document text is isolated inside explicit untrusted delimiters (`=== UNTRUSTED DOCUMENT CONTENT ===` / `=== UNTRUSTED DOCUMENT EVIDENCE ===`), constrained by JSON schemas, and verified against persisted database excerpts before display.
- **HTTP Security Headers**: Enforces `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy` in `next.config.ts`.

See [`docs/SECURITY.md`](docs/SECURITY.md) for full details.

---

## Disclaimer

ClauseWise is an informational document navigation and review preparation tool. It is **not a lawyer, law firm, legal advisor, or legal representative**, and using ClauseWise does not create an attorney-client relationship. Always consult a qualified legal professional before signing or acting on any legal document.

---

## Licence

Proprietary — Prompt Wars competition submission.


