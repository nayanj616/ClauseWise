# ClauseWise — Architecture

**Version:** 0.1 (living document)

---

## 1. Overview

ClauseWise is a **Next.js App Router** full-stack application backed by
**PostgreSQL + pgvector**, using **OpenAI** for language understanding and
embeddings, and **Supabase Storage** for file storage.

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
| LLM | OpenAI API | GPT-4o for analysis, chat; text-embedding-3-small for embeddings |
| Authentication | NextAuth.js (Auth.js v5) | Server-side sessions, credentials provider for MVP |
| Validation | Zod | Runtime schema validation on all API boundaries |
| Unit tests | Vitest | Fast, TypeScript-native |
| E2E tests | Playwright | Cross-browser, accessible selectors |
| Package manager | pnpm | Deterministic, disk-efficient |

---

## 3. Layered Architecture

```
┌──────────────────────────────────────────┐
│           Presentation Layer             │
│  app/  (pages, layouts, components)      │
│  React Server Components + Client Comps  │
└──────────────────┬───────────────────────┘
                   │ Server Actions / Route Handlers
┌──────────────────▼───────────────────────┐
│         Application Layer                │
│  app/actions/    app/api/                │
│  Input validation (Zod)                  │
│  Authorization checks                    │
│  Orchestration of domain calls           │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│          Domain / Service Layer          │
│  lib/services/                           │
│  document-service.ts                     │
│  analysis-service.ts                     │
│  retrieval-service.ts                    │
│  comparison-service.ts                   │
│  action-service.ts                       │
│  preparation-service.ts                  │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│        Infrastructure Layer              │
│  lib/db/         — Drizzle + PostgreSQL  │
│  lib/storage/    — Supabase Storage      │
│  lib/ai/         — OpenAI chat client    │
│  lib/embeddings/ — OpenAI embeddings     │
│  lib/vector/     — pgvector queries      │
└──────────────────────────────────────────┘
```

Rules:
- UI components never call infrastructure directly
- Domain services own business logic
- Infrastructure modules are pure adapters with no business logic
- Server Actions and Route Handlers handle authorization and input validation

---

## 4. Directory Structure (planned)

```
clausewise/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     # Landing / Dashboard
│   ├── documents/
│   │   ├── page.tsx                 # Document library
│   │   └── [id]/
│   │       └── page.tsx             # Document workspace
│   ├── compare/
│   │   └── page.tsx
│   ├── actions/
│   │   └── page.tsx                 # Action center
│   ├── prepare/
│   │   └── [documentId]/
│   │       └── page.tsx             # Professional prep
│   └── api/
│       ├── documents/
│       │   └── route.ts
│       ├── analysis/
│       │   └── route.ts
│       └── chat/
│           └── route.ts
├── components/
│   ├── ui/                          # shadcn/ui primitives
│   ├── document/
│   ├── workspace/
│   ├── compare/
│   └── shared/
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   └── index.ts
│   ├── storage/
│   │   └── storage-client.ts
│   ├── ai/
│   │   ├── openai-client.ts
│   │   ├── prompts/
│   │   └── response-schemas.ts
│   ├── embeddings/
│   │   └── embeddings-client.ts
│   ├── vector/
│   │   └── vector-search.ts
│   └── services/
│       ├── document-service.ts
│       ├── analysis-service.ts
│       ├── retrieval-service.ts
│       ├── comparison-service.ts
│       ├── action-service.ts
│       └── preparation-service.ts
├── types/
│   └── index.ts                     # Shared domain types
├── docs/
└── tests/
    ├── unit/
    └── e2e/
```

---

## 5. Document Processing Pipeline

The upload HTTP request and the processing pipeline are **deliberately
decoupled**. The upload returns a `201` as soon as the file is validated and
stored. Processing runs out-of-band via `processDocument()`.

```
POST /api/documents/upload
  ↓
File validation (type, MIME, size, filename sanitization)
  ↓
Store to Supabase Storage (server-side only)
  ↓
Create Document record (status: queued)
  ↓
Return 201 to client ◄── upload request ends here

[Out-of-band: processDocument(documentId)]
  ↓
status: extracting
  ↓
Text extraction (pdf-parse for PDF, mammoth for DOCX)
  ↓
Section detection (heuristic: headings, numbered clauses)
  ↓
status: chunking
  ↓
Chunking (section-aware, max ~500 tokens with overlap)
  ↓
Embedding each chunk (text-embedding-3-small)
  ↓
Store chunks + vectors in pgvector
  ↓
status: analyzing
  ↓
Document classification (type, parties, governing law/jurisdiction)
  ↓
AI Analysis pass (structured findings extraction)
  ↓
Store DocumentFinding / Obligation / ImportantDate records
  ↓
status: ready ◄── UI stops polling, renders findings
```

**Error handling:** Any failure in the pipeline sets `status: error` and
records an `error_message`. The UI surfaces a human-readable error and a
retry action. Errors do not propagate as unhandled exceptions to the caller.

**Trigger mechanism (MVP):** Fire-and-forget internal fetch using
`waitUntil()` on Vercel, or a self-call pattern. No external job queue
is introduced in MVP.

**Status visibility:** The browser polls `GET /api/documents/[id]/status`
at a short interval. Every status transition is user-visible in the document
list card and the workspace header.

---

## 6. Retrieval-Augmented Generation (RAG) Pattern

For every document-specific AI query:

```
User question
      │
      ▼
Embed question (text-embedding-3-small)
      │
      ▼
Vector search in pgvector (top-k chunks for this document)
      │
      ▼
Assemble context window
  [System prompt] + [Safety wrapper] + [Retrieved chunks] + [User question]
      │
      ▼
OpenAI GPT-4o call (structured output where applicable)
      │
      ▼
Parse and validate response
      │
      ▼
Attach source references (chunk → section → page)
      │
      ▼
Return answer + citations to UI
```

The system prompt always precedes document content and explicitly instructs the
model to ignore instructions embedded in documents.

---

## 7. Rendering Strategy

| Route | Rendering |
|---|---|
| Dashboard | Server Component (RSC) |
| Document library | RSC + client filter |
| Document workspace | RSC shell + client panels (streaming) |
| AI chat stream | Route Handler (streaming) |
| Compare | RSC + client diff view |
| Action center | RSC + client interactions |

---

## 8. Open Architectural Decisions

| Decision | Status | Notes |
|---|---|---|
| PDF rendering library | TBD | `react-pdf` vs `pdfjs-dist` — decide in Phase 2 |
| Streaming chat protocol | TBD | Vercel AI SDK vs manual SSE — decide in Phase 5 |
| Supabase vs raw PostgreSQL | TBD | Supabase for managed + storage integration is preferred |
| External job queue (post-MVP) | Deferred | Evaluate in Phase 10 if `waitUntil` proves insufficient for large documents |

