# ClauseWise

**AI-powered legal document navigator** — built for the Prompt Wars "AI for Legal Assistance & Access" challenge.

> ClauseWise helps users understand, compare, and navigate legal documents in plain English. It is **not a substitute for professional legal advice** and does not replace a qualified lawyer.

---

## Core Principle: EVIDENCE → MEANING → ACTION

Every AI response is grounded in document evidence, translated to plain English, and converted to actionable guidance — never speculation.

---

## Features

### Phase 0 — Foundation
- ✅ Next.js 15 App Router + TypeScript (strict)
- ✅ NextAuth.js v5 credentials authentication
- ✅ Protected routes with server-side session enforcement
- ✅ PostgreSQL + Drizzle ORM + pgvector (ready for Phase 3 embeddings)
- ✅ Supabase Storage boundary
- ✅ OpenAI + Embeddings client boundaries (ready for Phase 3 analysis)
- ✅ shadcn/ui component foundation
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ Zod environment variable validation
- ✅ Vitest + Playwright test setup

### Phase 1 — Secure Document Upload
- ✅ Multi-format file support: PDF (`.pdf`) and Word (`.docx`)
- ✅ Strict 10 MB file size limit enforcement
- ✅ Deep server-side file validation (MIME type, file extension, magic bytes: `%PDF-` and OOXML ZIP package inspection)
- ✅ Strict filename sanitization (guards against path traversal, URI-encoded traversal, Windows reserved device names, and null bytes)
- ✅ Private Supabase Storage bucket (`clausewise-documents`) with automatic rollback on DB failure
- ✅ Authenticated NextAuth session enforcement with session-derived ownership (`session.user.id`)
- ✅ Production API route `POST /api/documents/upload` returning initial document state (`status: queued`)
- ✅ Accessible user-facing upload UI (`DocumentUpload`) with drag-and-drop, accessible names, live regions, and progress states
- ✅ Comprehensive test suite with 85 passing tests across 7 suites

### Phase 2 — Text Extraction & Document Viewer
- ✅ Pure in-memory extraction engine: native PDF extraction (`unpdf`), DOCX structure inspection (`mammoth`), and UTF-8 plain text
- ✅ Heuristic legal section detector and sequential section ordering
- ✅ Transactional section persistence (`document_sections` schema) with exact order, titles, and page coordinates
- ✅ Deterministic section-to-chunk segmentation (`document_chunks` schema) with paragraph/sentence preservation
- ✅ Extracted document viewer (`DocumentViewer`) with section navigation and responsive layouts
- ✅ Safe error and processing states (`DocumentProcessingState`, `DocumentErrorState`, `EmptyContentState`)

### Phase 3 — Document Intelligence & Grounded Workspace (CLOSED)
- ✅ Evidence-first intelligence contract: LLM is an inference mechanism, never the source of truth
- ✅ Server-side OpenAI infrastructure (`lib/ai/openai-client.ts`) with typed error handling
- ✅ Anti-injection security wrappers (`=== UNTRUSTED DOCUMENT CONTENT ===`) and deterministic context bounding (240k chars)
- ✅ Grounded document classification (`classifyDocument`) with explicit text-stated vs inferred provenance
- ✅ Structured metadata extraction (`extractDocumentMetadata`): parties, governing law, jurisdiction, dates, financial terms
- ✅ Grounded findings generation (`generateDocumentFindings`): obligations, key terms, attention items, ambiguities, inconsistencies
- ✅ Absence-based `missing_information` findings grounded strictly in `CORE_PROVISION_CATALOG` with zero fake citations
- ✅ Pure deterministic evidence validator (`verifySectionExcerptEvidence`): exact/whitespace-normalized matching, authoritative DB IDs
- ✅ Multi-document & cross-tenant isolation: mismatched document IDs deterministically rejected
- ✅ Atomic transactional persistence (`persistDocumentIntelligence`) with reprocessing idempotency
- ✅ Failure isolation: AI errors transition document to `status: error` without mutating Phase 2 sections or chunks
- ✅ Grounded Intelligence Workspace:
  - `DocumentHeader`: Document metadata, processing status, classification badge, and tab navigation
  - `DocumentOverview`: Structured cards for Parties, Governing Law, Jurisdiction, Key Dates, Financial Terms, and Executive Summary (display-only, Guardrail 1)
  - `ImportantSections`: Priority sections with jump-to-section navigation triggers
  - `FindingCard` & `EvidencePanel`: Master-detail inspector with verbatim excerpts, verified provenance, and "View in Document Text" action
  - `FindingList`: Deterministic filtering by priority (`All`, `Needs Attention`, `Important`, `Informational`) and finding types
- ✅ Strict absence of numerical legal-risk scores across schemas, domain types, and UI
- ✅ Comprehensive Phase 3 verification suite with 413 tests passing across 24 test files

### Phase 4 — Analysis / Findings & Grounded Evidence
- ✅ Master-detail finding inspector with verbatim excerpts and verified section/page coordinates
- ✅ Exact sentence and excerpt highlighting in `DocumentViewer` with automatic scrolling
- ✅ Strict absence discipline for `missing_information` findings (never fabricating fake citations or quotes)
- ✅ Formatted Important Dates & Financial Terms grids with deep links into source text
- ✅ Attention Items summary card prioritizing critical review clauses

### Phase 5 — Evidence-Backed Q&A
- ✅ Multi-turn conversational Q&A threads with persistent messages and conversation switcher
- ✅ Low-latency Server-Sent Events (SSE) streaming with provisional deltas and terminal authoritative verification
- ✅ Strict Grounded Treatment Gate: citations and grounding flags displayed only upon completion
- ✅ Deterministic retrieval engine combining section focus, pgvector embeddings, and keyword matching
- ✅ Automatic refusal banner when document evidence is insufficient (zero hallucination)

### Phase 6 — Contextual Assistant
- ✅ Section-scoped Q&A navigation ("Ask about this section") from Document Viewer and Findings
- ✅ Active section context indicator with easy clear-context action
- ✅ Transparent fallback provenance notice when evidence is retrieved outside the targeted clause

### Phase 7 — Action Center
- ✅ Convert any finding into a trackable legal review item with verified evidence references
- ✅ Dedicated Action Center workspace (`/actions`) with status tabs (`All`, `Open`, `Completed`)
- ✅ Optimistic status toggling with instant feedback and completed timestamp tracking
- ✅ Full provenance preservation: direct links back to verbatim clauses in Document Workspace

### Phase 8 — Professional Prep
- ✅ Deterministic consultation briefing assembling Executive Summary, Key Clauses, and Questions for Counsel
- ✅ Objective discussion prompts framed neutrally for attorney meetings (no legal advice or negotiation strategy)
- ✅ Integrated open review actions and user Q&A history
- ✅ Multi-format export: one-click copy briefing as Markdown and print / save as PDF

### Phase 9 — Document Comparison
- ✅ Side-by-side comparative analysis of two contracts (`/compare`) with symmetrical evidence references
- ✅ Deterministic hybrid alignment: normalized titles, canonical provision matching, and Jaccard fallback
- ✅ Categorized difference items: `Modified`, `Added`, `Removed`, and `Unchanged`
- ✅ Dynamic document selector pair with instant document swapping (`↔`) and URL state synchronization
- ✅ Deep-link return paths directly into Document A and Document B workspaces

### Phase 10 — Polish & Final Integration
- ✅ WCAG 2.1 AA accessibility: Skip-to-main-content link, mobile responsive navigation drawer, and form ARIA relationships (`aria-invalid`, `aria-describedby`)
- ✅ Accessible live regions: `role="status"` and `aria-live="polite"` during AI response streaming
- ✅ Route loading skeletons (`loading.tsx`) across Dashboard, Documents, Compare, Actions, and Workspace
- ✅ Robust error boundaries: root `app/error.tsx`, protected `app/(app)/error.tsx`, and branded `app/not-found.tsx`
- ✅ Document Library on `/documents` with status badges, page counts, and "Open Workspace" actions
- ✅ Real Dashboard mission control with live document metrics, recent documents, and empty-state onboarding guide
- ✅ Database performance indexes on foreign keys (`userId`, `documentId`, `sectionId`)
- ✅ Full regression test coverage: 48 unit test files and 9 Playwright E2E suites

---

## Architecture

```
UI (app/components)
  ↓
Server Actions / Route Handlers (app/actions, app/api)
  ↓
Domain Services (lib/services)
  ↓
Domain Core & Validation (lib/intelligence)
  ↓
Infrastructure (lib/db, lib/storage, lib/ai, lib/embeddings)
```

**Evidence-First Intelligence Pipeline:**
```
Persisted Sections
    ↓
Deterministic Chunks
    ↓
Bounded Intelligence Input (max 240k chars)
    ↓
LLM Structured Output (gpt-4o)
    ↓
Zod Schema Validation
    ↓
Deterministic Evidence Validation
    ↓
Atomic Persistence (document_findings)
    ↓
Grounded Intelligence Workspace
```

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| UI | Tailwind CSS + shadcn/ui |
| Database | PostgreSQL + pgvector |
| ORM | Drizzle ORM |
| Auth | NextAuth.js v5 (credentials, JWT sessions) |
| Storage | Supabase Storage |
| AI | OpenAI GPT-4o + text-embedding-3-small |
| Validation | Zod |
| Tests | Vitest + Playwright |
| Package manager | pnpm |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+ with **pgvector extension** available
- Supabase project (for Storage)
- OpenAI API key

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

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random string ≥ 32 chars (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Full URL of your deployment |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `OPENAI_API_KEY` | OpenAI API key |

### 3. Set up the database

```bash
# Enable the pgvector extension (run once)
pnpm db:setup

# Generate and run migrations
pnpm db:generate
pnpm db:migrate
```

### 4. Run the development server

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000). You will be redirected to `/sign-in`.

Create an account at `/sign-up`, then sign in to reach the Dashboard.

### 5. Run tests

```bash
# Unit & integration tests (Vitest: 413 tests passing across 24 suites) — no database required
pnpm test
# or: npx vitest run

# E2E tests (Playwright) — requires running dev server + database
pnpm test:e2e
```

---

## Project Structure

```
clausewise/
├── app/
│   ├── (auth)/              # Sign-in and sign-up pages
│   ├── (app)/               # Protected pages (dashboard, documents, etc.)
│   │   ├── layout.tsx       # Protected layout — calls requireSession()
│   │   ├── dashboard/
│   │   ├── documents/       # Document library & upload workspace
│   │   │   └── [documentId]/# Grounded Intelligence Workspace
│   │   ├── compare/
│   │   └── actions/
│   ├── actions/             # Server Actions
│   │   └── auth.ts          # signInAction, signUpAction, signOutAction
│   └── api/
│       ├── auth/            # NextAuth Route Handler
│       └── documents/
│           └── upload/      # POST /api/documents/upload
├── components/
│   ├── auth/                # SignInForm, SignUpForm
│   ├── document/            # DocumentUpload (accessible UI)
│   ├── workspace/           # DocumentWorkspace, Header, Overview, FindingCard, EvidencePanel, FindingList
│   ├── shared/              # Sidebar, Logo
│   └── ui/                  # shadcn/ui components
├── lib/
│   ├── ai/                  # OpenAI client boundary (openai-client.ts)
│   ├── auth/                # Session utilities (requireSession, assertOwnership)
│   ├── db/                  # Drizzle schema, client, migrations
│   ├── embeddings/          # Embeddings client boundary
│   ├── env.ts               # Zod env validation
│   ├── extraction/          # Legal section detector heuristics
│   ├── intelligence/        # Evidence validator, expectation catalog, schemas, prompts
│   ├── services/            # Domain services (document, extraction, chunking, intelligence)
│   ├── storage/             # Supabase Storage client & helpers
│   ├── upload/              # Client-side upload handler (upload-client.ts)
│   ├── validation/          # Document validation & sanitization (document-validation.ts)
│   └── utils.ts             # cn(), formatDate(), truncate()
├── types/                   # Shared TypeScript types + NextAuth augmentation
├── tests/
│   ├── unit/                # Vitest unit & integration tests (413 passing tests across 24 suites)
│   └── e2e/                 # Playwright E2E tests
├── scripts/
│   └── db-setup.ts          # pgvector extension setup
├── auth.ts                  # NextAuth configuration
├── middleware.ts             # Route protection middleware
├── docs/                    # Architecture and planning documents
└── AGENTS.md                # AI agent / developer guidelines
```

---

## Implementation Phases

| Phase | Description | Status |
|---|---|---|
| 0 | Foundation (auth, DB, UI shell) | ✅ Complete |
| 1 | Secure document upload | ✅ Complete |
| 2 | Text extraction + document viewer | ✅ Complete |
| 3 | Document intelligence (AI analysis) | ✅ Complete |
| 4 | Analysis / Findings & Grounded Evidence | ✅ Complete |
| 5 | Evidence-backed Q&A (SSE streaming) | ✅ Complete |
| 6 | Contextual Assistant | ✅ Complete |
| 7 | Action Center | ✅ Complete |
| 8 | Professional Prep | ✅ Complete |
| 9 | Document Comparison | ✅ Complete |
| 10 | Polish & Final Integration | ✅ Complete |

See [`docs/PHASE_PLAN.md`](docs/PHASE_PLAN.md) for full details.

---

## Security

- All secrets are server-side only — never prefixed with `NEXT_PUBLIC_`
- Document ownership enforced via `assertOwnership()` before every data access
- HTTP security headers on all routes (CSP, X-Frame-Options, etc.)
- Inputs validated with Zod on all API/action boundaries
- Passwords hashed with bcrypt (cost 12)
- No stack traces exposed to users

See [`docs/SECURITY.md`](docs/SECURITY.md) for full details.

---

## Disclaimer

ClauseWise is a tool to help users understand legal documents. It is not a lawyer, legal advisor, or legal representative. Always consult a qualified legal professional before signing or acting on any legal document.

---

## Licence

Proprietary — Prompt Wars competition submission.

