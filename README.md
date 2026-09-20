# ClauseWise

**AI-powered legal document navigator** — built for the Prompt Wars "AI for Legal Assistance & Access" challenge.

> ClauseWise helps users understand, compare, and navigate legal documents in plain English. It is **not a substitute for professional legal advice** and does not replace a qualified lawyer.

---

## Core Principle: EVIDENCE → MEANING → ACTION

Every AI response is grounded in document evidence, translated to plain English, and converted to actionable guidance — never speculation.

---

## Features (Phase 0 — Foundation)

- ✅ Next.js 15 App Router + TypeScript (strict)
- ✅ NextAuth.js v5 credentials authentication
- ✅ Protected routes with server-side session enforcement
- ✅ PostgreSQL + Drizzle ORM + pgvector (ready for Phase 3 embeddings)
- ✅ Supabase Storage boundary (ready for Phase 1 uploads)
- ✅ OpenAI + Embeddings client boundaries (ready for Phase 3 analysis)
- ✅ shadcn/ui component foundation
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ Zod environment variable validation
- ✅ Vitest + Playwright test setup

---

## Architecture

```
UI (app/components)
  ↓
Server Actions / Route Handlers (app/actions, app/api)
  ↓
Domain Services (lib/services)        ← Phase 1+ adds services here
  ↓
Infrastructure (lib/db, lib/storage, lib/ai, lib/embeddings)
```

**Document Processing Pipeline** (Phase 2+, async by design):
```
POST /api/documents/upload  →  validate → store → DB record (status: queued) → return 201
[Out-of-band] processDocument(id): extracting → chunking → analyzing → ready
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
# Unit tests (Vitest) — no database required
pnpm test

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
│   │   ├── documents/
│   │   ├── compare/
│   │   └── actions/
│   ├── actions/             # Server Actions
│   │   └── auth.ts          # signInAction, signUpAction, signOutAction
│   └── api/auth/            # NextAuth Route Handler
├── components/
│   ├── auth/                # SignInForm, SignUpForm
│   ├── shared/              # Sidebar, Logo
│   └── ui/                  # shadcn/ui components
├── lib/
│   ├── ai/                  # OpenAI client boundary
│   ├── auth/                # Session utilities (requireSession, assertOwnership)
│   ├── db/                  # Drizzle schema, client, migrations
│   ├── embeddings/          # Embeddings client boundary
│   ├── env.ts               # Zod env validation
│   ├── storage/             # Supabase Storage boundary
│   └── utils.ts             # cn(), formatDate(), truncate()
├── types/                   # Shared TypeScript types + NextAuth augmentation
├── tests/
│   ├── unit/                # Vitest unit tests
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
| 1 | Secure document upload | 🔜 |
| 2 | Text extraction + document viewer | 🔜 |
| 3 | Document intelligence (AI analysis) | 🔜 |
| 4 | Evidence-backed analysis display | 🔜 |
| 5 | AI QA chat | 🔜 |
| 6 | Document comparison | 🔜 |
| 7 | Action plans | 🔜 |
| 8 | Professional prep | 🔜 |
| 9 | Polish and disclaimer hardening | 🔜 |
| 10 | Accessibility, dark mode, CI | 🔜 |

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

