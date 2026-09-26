# ClauseWise — Conceptual & Implemented Data Model

**Version:** 0.2 (living document)

This document outlines the conceptual data model and implemented PostgreSQL schema for ClauseWise (`lib/db/schema.ts`, Drizzle migrations `0000_dusty_hemingway.sql` through `0009_great_vision.sql`).

### Schema Implementation Summary

| Entity | PostgreSQL Table (`lib/db/schema.ts`) | Status | Notes |
|---|---|---|---|
| `User`, `Account`, `Session`, `VerificationToken` | `user`, `account`, `session`, `verification_token` | **Implemented** | NextAuth.js v5 identity and session tables (`0000`) |
| `Document` | `document` | **Implemented** | Uploaded file metadata, lifecycle status, classification, parties, governing law, jurisdiction (`0000`, `0001`, `0002`, `0004`, `0008`) |
| `DocumentSection` | `document_sections` | **Implemented** | Logical sections/clauses with sequential `order_index` and PDF page bounds (`0002`, `0008`) |
| `DocumentChunk` | `document_chunks` | **Implemented** | Retrieval chunks with `vector(768)` embeddings (`nomic-embed-text`, migrated in `0003`, `0005`, `0008`, `0009`) |
| `DocumentFinding` | `document_findings` | **Implemented** | Unified evidence-backed intelligence unit covering `key_term`, `attention`, `obligation`, `ambiguity`, `date`, `financial_term`, `inconsistency`, and `missing_information` (`0004`) |
| `Obligation` & `ImportantDate` | Modeled via `document_findings` | **Implemented via `document_findings`** | Stored as `finding_type = 'obligation'` and `finding_type = 'date'` (with typed `metadata` JSONB) rather than separate tables |
| `Conversation` & `Message` | `conversations`, `messages` | **Implemented** | Persistent document-scoped Q&A threads and messages with verified `citations` JSONB (`0006`) |
| `Action` | `actions` | **Implemented** | User-controlled review checklist items (`open` / `completed`, `completed_at`) linked to documents and findings (`0007`) |
| `Comparison` & `ComparisonDifference` | Computed on-demand (`comparison-service.ts`) | **Implemented On-Demand (No Table)** | Computed deterministically on demand over `document_sections` and `document_findings` (Phase 9 design decision) |

---

## 1. Entity Overview

```
User (Implemented: user)
 └─ Document (many, Implemented: document)
      ├─ DocumentSection (many, Implemented: document_sections)
      │    └─ DocumentChunk (many, Implemented: document_chunks) ── [pgvector vector(768)]
      ├─ DocumentFinding (many, Implemented: document_findings) ── references section/chunk/page
      │    ├─ Specialisations in metadata: obligation, date, financial_term, missing_information
      ├─ Conversation (many, Implemented: conversations)
      │    └─ Message (many, Implemented: messages)
      └─ Action (many, Implemented: actions)

Comparison (Implemented On-Demand in lib/services/comparison-service.ts)
 ├─ aligns Document A sections & metadata
 ├─ aligns Document B sections & metadata
 └─ emits SectionDifference items (modified, added, removed, unchanged)
```

---

## 2. Entity Definitions

### User (`user`) — **Implemented**
Represents an application user.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | text | Optional display name |
| `email` | text | Unique, not null |
| `email_verified` | timestamp | Optional |
| `image` | text | Optional avatar URL |
| `password` | text | Hashed with `bcryptjs`; null for OAuth accounts |
| `created_at` | timestamp | Default `now()` |
| `updated_at` | timestamp | Default `now()` |

*Authentication is implemented in Phase 0 (NextAuth.js v5). The `user` table is managed alongside `session`, `account`, and `verification_token` tables. Every protected request to the application has a verified `session.user.id`.*

---

### Document (`document`) — **Implemented**
Represents an uploaded legal document.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → `user(id)` (`onDelete: cascade`) |
| `title` | text | User-editable display name |
| `original_filename` | text | Sanitized original name |
| `storage_path` | text | Path in Supabase Storage (never exposed to browser) |
| `mime_type` | text | `application/pdf` or `application/vnd.openxmlformats...` |
| `file_size_bytes` | integer | Validated $\le 10\text{ MB}$ |
| `status` | enum | `queued`, `extracting`, `extracted`, `chunking`, `analyzing`, `ready`, `error` |
| `error_message` | text | Populated when `status = error`; not exposed verbatim to users |
| `document_type` | text | e.g. `nda`, `employment_agreement`, `lease_agreement`, `service_agreement` |
| `page_count` | integer | Extracted during processing (PDF only; null for DOCX/TXT) |
| `parties` | jsonb | Array of `{ name: string, role: string \| null }` |
| `governing_law` | text | Governing law clause if stated (e.g., "State of New York", "State of Delaware") |
| `jurisdiction` | text | Court or arbitration jurisdiction if stated |
| `metadata` | jsonb | Structured bag (e.g., `executiveSummary`, `classification`, `importantSections`) |
| `created_at` | timestamp | Default `now()` |
| `updated_at` | timestamp | Default `now()` |

*Indexes:* `idx_documents_user_id`, `idx_documents_status`, `idx_documents_created_at`.

---

### DocumentSection (`document_sections`) — **Implemented**
A logical section within a document (e.g., a numbered clause, a heading).
Implemented in PostgreSQL via Drizzle ORM table `document_sections` (Phase 2 Slice 2.2).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → `document(id)` (`onDelete: cascade`) |
| `order_index` | integer | 0-indexed sequence within document |
| `section_number` | integer | Section number or identifier matching `order_index` |
| `title` | text | Section heading or generated label |
| `content` | text | Raw extracted text for this section |
| `page_start` | integer | 1-indexed starting page (PDF only; null for DOCX/TXT) |
| `page_end` | integer | 1-indexed ending page (PDF only; null for DOCX/TXT) |
| `created_at` | timestamp | Creation timestamp |
| `updated_at` | timestamp | Last update timestamp |

*Indexes:* `idx_document_sections_document_id`, `idx_document_sections_order_index` on `(document_id, order_index)`.

---

### DocumentChunk (`document_chunks`) — **Implemented**
A vector-searchable chunk of text derived deterministically from a section.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → `document(id)` (`onDelete: cascade`) |
| `section_id` | UUID | FK → `document_sections(id)` (`onDelete: cascade`) |
| `chunk_index` | integer | 0-indexed global sequence within document |
| `content` | text | Verbatim chunk text (default max 1500 chars) |
| `embedding` | `vector(768)` | **Implemented (`0009_great_vision.sql`)**: Local Ollama `nomic-embed-text` 768-dimensional float vector (migrated from initial Phase 5 `vector(1536)`) |
| `page_number` | integer | Source page reference propagated from `section.page_start` |
| `token_count` | integer | Approximate token count heuristic (`Math.ceil(length / 4)`) |
| `created_at` | timestamp | Default `now()` |
| `updated_at` | timestamp | Default `now()` |

*Indexes:* `idx_document_chunks_document_id`, `idx_document_chunks_section_id`.

---

### DocumentFinding (`document_findings`) — **Implemented**
The central intelligence unit. Represents a single AI-identified finding within a document. Implemented in PostgreSQL via Drizzle ORM table `document_findings` (Phase 3).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → `document(id)` (`onDelete: cascade`) |
| `section_id` | UUID | FK → `document_sections(id)` (nullable, `onDelete: cascade`) |
| `chunk_id` | UUID | FK → `document_chunks(id)` (nullable, `onDelete: set null`) — for RAG traceability |
| `finding_type` | enum | Canonical taxonomy below |
| `importance` | enum | `needs_attention`, `important`, `informational` |
| `label` | text | Short human-readable label |
| `summary` | text | Plain-English explanation |
| `source_text` | text | Verbatim excerpt from document (evidence; strictly `null` for `missing_information`) |
| `page_number` | integer | 1-indexed source page resolved from persisted section/chunk |
| `metadata` | jsonb | Type-specific data (e.g., `dateValue`, `amount`, `expectedTopic`, `ruleBasis`) |
| `created_at` | timestamp | Default `now()` |
| `updated_at` | timestamp | Default `now()` |

*Indexes:* `idx_document_findings_document_id`, `idx_document_findings_finding_type`, `idx_document_findings_importance`.

**Canonical `finding_type` taxonomy:**

> **Design rule:** `finding_type` describes the *category* of the finding.
> The `importance` column (`needs_attention` / `important` / `informational`)
> describes *how urgently* the user should review it. Do not conflate the two.
> Numerical legal risk scores are strictly forbidden.

| Value | Description |
|---|---|
| `key_term` | Important defined term, party reference, or defined concept |
| `attention` | A clause or matter requiring explicit human review |
| `obligation` | An explicit obligation — something a party is required to do or not do |
| `ambiguity` | Language that is unclear or open to more than one interpretation |
| `date` | Important date or deadline with a value or formula stated in the document |
| `financial_term` | Fee, penalty, payment, salary, or monetary value stated in the document |
| `inconsistency` | Apparent conflict between two provisions, supported by evidence from both |
| `missing_information` | An expected core provision is absent given the document type and grounded in the Core Provision Catalog (carries `null` `source_text` and `null` `section_id`) |

---

### Obligation & ImportantDate — **Implemented via `DocumentFinding` (No Separate Table)**
In the conceptual model, `Obligation` and `ImportantDate` were sketched as candidate specialized tables. In the implemented Drizzle schema (`lib/db/schema.ts`), they are unified inside `document_findings`:
- **Obligations** are persisted with `finding_type = 'obligation'`, verbatim `source_text`, `section_id`, `page_number`, and optional party metadata in `metadata`.
- **Important Dates** are persisted with `finding_type = 'date'`, verbatim `source_text`, `section_id`, `page_number`, and `metadata: { dateValue, dateDescription }`, and surfaced in the Workspace via `FormattedDatesList`.
- **Financial Terms** follow the same pattern (`finding_type = 'financial_term'`, `metadata: { amount, currency, frequency }`, surfaced via `FormattedFinancialList`).

---

### Action (`actions`) — **Implemented**
A user-controlled review checklist item derived from a finding or created manually per document (Phase 7, migration `0007_fluffy_iron_lad.sql`).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → `document(id)` (`onDelete: cascade`) |
| `finding_id` | UUID | FK → `document_findings(id)` (nullable, `onDelete: cascade`) |
| `user_id` | UUID | FK → `user(id)` (`onDelete: cascade`) |
| `title` | text | Short review item label (1–300 chars) |
| `description` | text | Optional review notes (max 2000 chars) |
| `status` | enum | **Implemented**: `open`, `completed` *(Conceptual draft also considered `in_progress`, `dismissed`)* |
| `created_at` | timestamp | Default `now()` |
| `updated_at` | timestamp | Default `now()` |
| `completed_at` | timestamp | Set when transitioned to `completed`; cleared to `null` when reopened |

*Indexes:* `idx_actions_user_id`, `idx_actions_document_id`, `idx_actions_finding_id`, `idx_actions_status`.

---

### Conversation (`conversations`) — **Implemented**
A document-scoped Q&A thread associated with a document and user.
Implemented in PostgreSQL via Drizzle ORM table `conversations` (Phase 5 Slice 5.4, migration `0006_pale_ezekiel_stane.sql`).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → `document(id)` (`onDelete: cascade`) |
| `user_id` | UUID | FK → `user(id)` (`onDelete: cascade`) |
| `title` | text | Thread title (default: `"New Conversation"`) |
| `created_at` | timestamp | Creation timestamp (`now()`) |
| `updated_at` | timestamp | Last message / activity timestamp (`now()`) |

*Indexes:* `idx_conversations_document_id`, `idx_conversations_user_id`, `idx_conversations_user_doc`.

---

### Message (`messages`) — **Implemented**
A single turn in a Conversation.
Implemented in PostgreSQL via Drizzle ORM table `messages` (Phase 5 Slice 5.4, migration `0006_pale_ezekiel_stane.sql`).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK → `conversations(id)` (`onDelete: cascade`) |
| `role` | enum | `user`, `assistant` |
| `content` | text | Message content / answer |
| `citations` | jsonb | Array of authoritative `QaCitation` objects; strictly `null` for `user` role |
| `has_sufficient_evidence` | boolean | Sufficiency flag; strictly `null` for `user` role |
| `is_grounded` | boolean | Grounding flag; strictly `null` for `user` role |
| `citation_validation_passed` | boolean | Citation verification flag; strictly `null` for `user` role |
| `metadata` | jsonb | Optional metadata bag (e.g., active `sectionId` for Phase 6 contextual Q&A) |
| `created_at` | timestamp | Message creation timestamp (`now()`) |

*Indexes & Ordering:*
- `idx_messages_conversation_id` on `(conversation_id)`
- `idx_messages_convo_created` on `(conversation_id, created_at)`
- Deterministic query ordering contract: `ORDER BY created_at ASC, id ASC`

---

### Comparison & ComparisonDifference — **Implemented On-Demand (Zero Schema Migrations)**
In the initial conceptual model, `Comparison` and `ComparisonDifference` were sketched as candidate persistence tables. In Phase 9 (`lib/services/comparison-service.ts`, documented in [`docs/phases/09-comparison.md`](phases/09-comparison.md)), comparison is computed deterministically **on demand** over existing `document_sections`, `document_findings`, and `document` metadata:
- Avoids stale comparison rows if a document is re-extracted or re-analyzed.
- Emits structured `DocumentComparisonResult` containing `metadataDiffs` and `sectionDifferences` (`modified`, `added`, `removed`, `unchanged`) with verbatim excerpts and section/page coordinates for both Document A and Document B.

---

## 3. Key Relationships Summary

- Every AI finding is tied to a `document`, and (for all substantive findings) to a verified `document_sections` row and `page_number`.
- Every substantive finding carries verbatim `source_text` verified against the section content; `missing_information` findings carry `null` `source_text` and `null` `section_id`.
- Obligations, Important Dates, and Financial Terms are specialized `finding_type` views inside `document_findings` with structured `metadata`.
- Actions reference `document_findings` and preserve provenance back to the source section and quote.
- Assistant `messages` carry verified `citations` (`chunkId`, `sectionId`, `pageNumber`, `sourceText`) back to `document_chunks` and `document_sections`.
- On-demand comparisons reference sections and findings across Document A and Document B.

---

## 4. Design Decisions

| Decision | Choice | Status & Rationale |
|---|---|---|
| Finding as central concept | Single `document_findings` table with `finding_type` enum and `metadata` JSONB | **Implemented** — Unified querying, filtering, and provenance validation across all 8 finding types |
| Verbatim source text on finding | Required for all substantive finding types; `null` enforced for `missing_information` | **Implemented** — Enforces the Evidence-First invariant and prevents fabricated citations |
| Embeddings co-located with chunks | `embedding` column (`vector(768)`) on `document_chunks` | **Implemented** — Local Ollama `nomic-embed-text` (`768d`) co-located in PostgreSQL via `pgvector` |
| Obligations & Dates representation | Stored in `document_findings` (`finding_type` + `metadata` JSONB) instead of separate tables | **Implemented** — Eliminates join duplication while preserving dedicated UI views (`FormattedDatesList`, `FormattedFinancialList`) |
| Document Comparison storage | Computed deterministically on demand (`comparison-service.ts`) | **Implemented** — Zero schema drift and instant side-by-side alignment over `document_sections` |

