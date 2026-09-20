# ClauseWise — Conceptual Data Model

**Version:** 0.1 (living document)

This document outlines the conceptual data model and schema roadmap for ClauseWise.
The `users`, `accounts`, `sessions`, `verification_tokens`, and `documents` tables
have been formally defined and migrated in PostgreSQL using Drizzle ORM (Phase 0 and Phase 1).
Downstream entities (sections, chunks, findings, actions, conversations) and processing-specific
columns are scheduled for implementation in subsequent phases.

---

## 1. Entity Overview

```
User
 └─ Document (many)
      ├─ DocumentSection (many)
      │    └─ DocumentChunk (many) ── [pgvector embedding]
      ├─ DocumentFinding (many) ── references section/chunk/page
      ├─ Obligation (many) ── a specialisation of Finding
      ├─ ImportantDate (many) ── a specialisation of Finding
      ├─ Conversation (many)
      │    └─ Message (many)
      └─ Action (many)

Comparison
 ├─ references Document A
 ├─ references Document B
 └─ ComparisonDifference (many) ── references sections in A and B
```

---

## 2. Entity Definitions

### User
Represents an application user.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | string | Unique |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

*Authentication is included in Phase 0 (NextAuth.js v5). The `User` table is
managed by NextAuth alongside its `Session`, `Account`, and `VerificationToken`
tables. Every request to the application has a verified `session.user.id`.*

---

### Document
Represents an uploaded legal document.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → User |
| `title` | string | User-editable display name |
| `original_filename` | string | Sanitized original name |
| `storage_path` | string | Path in Supabase Storage (never exposed to browser) |
| `mime_type` | string | `application/pdf` or `application/vnd.openxmlformats...` |
| `file_size_bytes` | integer | |
| `status` | enum | `queued`, `extracting`, `extracted`, `chunking`, `analyzing`, `ready`, `error` |
| `error_message` | string | Populated when `status = error`; not exposed verbatim to users |
| `document_type` | string | e.g. `employment_agreement`, `nda`, `lease` |
| `page_count` | integer | Extracted during processing |
| `parties` | jsonb | Array of identified party names |
| `governing_law` | string | Jurisdiction or governing law clause, if found (e.g. "New York", "England and Wales") |
| `jurisdiction` | string | Court or arbitration jurisdiction, if stated separately from governing law |
| `metadata` | jsonb | Flexible key-value bag for any additional extracted metadata |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

*Implementation status (Phase 1 & Phase 2 Slice 2.2): `id`, `user_id`, `title`, `original_filename`, `storage_path`, `mime_type`, `file_size_bytes`, `page_count`, `status` (initial value: `queued`), `error_message`, `governing_law`, `jurisdiction`, `created_at`, and `updated_at` are implemented in Drizzle ORM (`lib/db/schema.ts`). Downstream extraction columns (`document_type`, `parties`, `metadata`) are introduced in subsequent slices/phases.*

---

### DocumentSection
A logical section within a document (e.g., a numbered clause, a heading).
Implemented in PostgreSQL via Drizzle ORM table `document_sections` (Phase 2 Slice 2.2).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → Document (`onDelete: cascade`) |
| `order_index` | integer | 0-indexed sequence within document |
| `section_number` | integer | Section number or identifier matching order_index |
| `title` | string | Section heading or generated label |
| `content` | text | Raw extracted text for this section |
| `page_start` | integer | 1-indexed starting page (PDF only; null for DOCX/TXT) |
| `page_end` | integer | 1-indexed ending page (PDF only; null for DOCX/TXT) |
| `created_at` | timestamp | Creation timestamp |
| `updated_at` | timestamp | Last update timestamp |

---

### DocumentChunk
A vector-searchable chunk of text derived from a section.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → Document |
| `section_id` | UUID | FK → DocumentSection (nullable) |
| `chunk_index` | integer | Sequence within document |
| `content` | text | Chunk text (max ~500 tokens) |
| `embedding` | vector(1536) | OpenAI text-embedding-3-small output |
| `page_number` | integer | Page this chunk primarily falls on |
| `token_count` | integer | Approximate token count |
| `created_at` | timestamp | |

---

### DocumentFinding
The central intelligence unit. Represents a single AI-identified finding
within a document.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → Document |
| `section_id` | UUID | FK → DocumentSection (nullable) |
| `chunk_id` | UUID | FK → DocumentChunk (nullable) — for RAG traceability |
| `finding_type` | enum | See taxonomy below |
| `label` | string | Short human-readable label |
| `summary` | text | Plain-English explanation |
| `source_text` | text | Verbatim excerpt from document (evidence) |
| `page_number` | integer | Source page |
| `importance` | enum | `needs_attention`, `important`, `informational` |
| `metadata` | jsonb | Type-specific data (e.g. date value, amount) |
| `created_at` | timestamp | |

**Finding type taxonomy:**

> **Design rule:** `finding_type` describes the *category* of the finding.
> The `importance` column (`needs_attention` / `important` / `informational`)
> describes *how urgently* the user should review it. Do not conflate the two.

| Value | Description |
|---|---|
| `key_term` | Important defined term, party reference, or defined concept |
| `clause` | A substantive clause worth surfacing (e.g. termination, indemnity, IP assignment) |
| `obligation` | An explicit obligation — something a party is required to do or not do |
| `ambiguity` | Language that is unclear or open to more than one interpretation |
| `date` | Important date or deadline with a value or formula stated in the document |
| `financial_term` | Fee, penalty, payment, salary, or monetary value stated in the document |
| `inconsistency` | Apparent conflict between two provisions, supported by evidence from both |
| `missing_provision` | An expected provision is clearly absent, inferred from the document type and surrounding context — AI must cite the basis for expecting it |
| `not_identified` | The AI could not locate information on a topic; used to surface gaps without asserting the document is deficient |

---

### Obligation
A structured representation of a specific obligation extracted from the document.
May be modelled as a specialised finding or a separate table.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → Document |
| `finding_id` | UUID | FK → DocumentFinding (optional) |
| `obligated_party` | string | Who bears the obligation |
| `description` | text | Plain-English description |
| `source_text` | text | Verbatim excerpt |
| `section_id` | UUID | FK → DocumentSection |
| `due_date` | date | If applicable |
| `created_at` | timestamp | |

---

### ImportantDate
A structured date or deadline extracted from the document.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → Document |
| `finding_id` | UUID | FK → DocumentFinding (optional) |
| `label` | string | e.g. "Start Date", "Notice Period" |
| `date_value` | date | Parsed date if deterministic |
| `date_description` | text | If date is conditional/relative |
| `source_text` | text | Verbatim excerpt |
| `section_id` | UUID | FK → DocumentSection |
| `created_at` | timestamp | |

---

### Action
A user-controlled review item derived from findings.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → Document |
| `finding_id` | UUID | FK → DocumentFinding (nullable) |
| `user_id` | UUID | FK → User |
| `title` | string | Short review item label |
| `description` | text | What needs to be done / reviewed |
| `status` | enum | `open`, `in_progress`, `complete`, `dismissed` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### Conversation
A Q&A session associated with a document.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK → Document |
| `user_id` | UUID | FK → User |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### Message
A single turn in a Conversation.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK → Conversation |
| `role` | enum | `user`, `assistant` |
| `content` | text | Message text |
| `citations` | jsonb | Array of `{section_id, page, excerpt}` |
| `created_at` | timestamp | |

---

### Comparison
A comparison between two documents.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → User |
| `document_a_id` | UUID | FK → Document |
| `document_b_id` | UUID | FK → Document |
| `status` | enum | `processing`, `ready`, `error` |
| `summary` | text | Overall comparison summary |
| `created_at` | timestamp | |

---

### ComparisonDifference
A single identified difference between two documents.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `comparison_id` | UUID | FK → Comparison |
| `difference_type` | enum | `added`, `removed`, `modified`, `value_changed` |
| `label` | string | Short description |
| `description` | text | Plain-English explanation |
| `section_a_id` | UUID | FK → DocumentSection (nullable) |
| `section_b_id` | UUID | FK → DocumentSection (nullable) |
| `source_text_a` | text | Verbatim from document A |
| `source_text_b` | text | Verbatim from document B |
| `created_at` | timestamp | |

---

## 3. Key Relationships Summary

- Every AI finding is tied to a document, and optionally to a section and chunk
- Every finding carries verbatim `source_text` as evidence
- Obligations and ImportantDates are specialised views of Findings
- Actions reference Findings (user decides what to act on)
- Messages carry citations back to sections
- ComparisonDifferences reference sections in both documents

---

## 4. Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Finding as central concept | Single `DocumentFinding` table with type enum | Flexible, queryable, consistent |
| Verbatim source text on finding | Required field | Enforces evidence-backed principle |
| `metadata` as jsonb | Type-specific extra fields | Avoids wide sparse tables |
| Embeddings co-located with chunks | `embedding` column on `DocumentChunk` | pgvector in same DB, no extra service |
| Obligations/Dates as separate tables | Yes | Structured querying (sort by date, filter by party) |
