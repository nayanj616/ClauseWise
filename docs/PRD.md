# ClauseWise — Product Requirements Document

**Version:** 0.1 (living document)
**Challenge:** Prompt Wars — "AI for Legal Assistance & Access"

---

## 1. Problem Statement

Legal documents are long, complex, and full of jargon. Most people sign
contracts they do not fully understand because accessing a lawyer is expensive
and time-consuming. ClauseWise bridges this gap by letting users upload a legal
document and immediately understand what it says, what obligations it creates,
what deserves attention, and what questions to bring to a professional.

---

## 2. Core Positioning

**ClauseWise — AI Legal Document Navigator**

**Tagline:** Understand what you're signing.

**Core principle:** EVIDENCE → MEANING → ACTION

---

## 3. Target Users

- Individuals reviewing employment agreements, leases, or service contracts
- Small business owners reviewing vendor or client agreements
- Anyone preparing for a meeting with a lawyer
- Anyone who wants to understand a legal document before signing

---

## 4. What ClauseWise Does

| Capability | Description | Implementation Status |
|---|---|---|
| Plain-English Summary & Metadata | Translate document overview, classification, parties, governing law, and jurisdiction into accessible language | **Implemented** (`DocumentOverview` & `DocumentHeader`) |
| Clause & Finding Extraction | Surface key terms, obligations, important dates, financial terms, ambiguities, inconsistencies, and absent standard provisions | **Implemented** (`intelligence-service.ts` + `FindingList`) |
| Source-Linked Evidence | Attach verbatim quotes, section titles, and page numbers to every substantive finding with one-click highlight in the viewer | **Implemented** (`EvidencePanel` + `DocumentViewer` `<mark>`) |
| Document-Grounded Q&A | Answer user questions with verified section/page citations (e.g., NDA governing-law question citing Page 2) or refuse when evidence is absent | **Implemented** (`AskPanel`, single-turn & SSE streaming) |
| Contextual Clause Assistant | Scope Q&A to a selected section ("Ask about this section") with transparent same-document fallback provenance | **Implemented** (Phase 6 contextual retrieval) |
| Side-by-Side Compare | Identify `Modified`, `Added`, `Removed`, and `Unchanged` clauses between two agreements with deep links | **Implemented** (`/compare`, deterministic 4-tier alignment) |
| Action Center Checklist | Convert findings into a user-controlled review checklist (`open` / `completed`) linked back to source clauses | **Implemented** (`/actions` & workspace action dialog) |
| Professional Prep Briefing | Assemble a structured attorney review briefing (key clauses, open review items, Q&A history, counsel discussion prompts, Markdown/PDF export) | **Implemented** (`ProfessionalPrepTab` in workspace) |

---

## 5. What ClauseWise Does NOT Do

- Provide legal advice
- Act as a lawyer or legal representative
- Make legally binding determinations
- Represent users in any legal proceeding
- Generate numerical legal risk scores
- Recommend which contract to sign
- Replace professional legal review

A disclaimer appears on every substantive AI output:
> ClauseWise provides informational assistance only and is not a substitute for
> qualified legal advice. Consult a licensed attorney for legal guidance.

---

## 6. Supported Document Types & Demonstrated Baseline (MVP)

Primary demonstrated workflows:
- **Non-Disclosure Agreement (NDA)** — Verified in the live submission workflow, including document classification, extracted confidentiality obligations and key terms, grounded Q&A on governing law with a supporting citation to **Page 2**, and structured attorney review preparation.
- **Employment & Master Services Agreements** — Supported across analysis, comparison, action tracking, and E2E verification suites.

Also designed and cataloged (`CORE_PROVISION_CATALOG`) to support:
- Rental / lease agreements (`lease_agreement`)
- Service agreements (`service_agreement`)
- Commercial contracts (`commercial_contract`)
- General legal contracts (`general`)

File formats: **PDF** (`.pdf`, primary) and **DOCX** (`.docx`, secondary) via the upload validator (`lib/validation/document-validation.ts`), with UTF-8 plain text (`.txt`) also supported in the extraction engine (`lib/services/extraction-service.ts`).

---

## 7. Primary Workflow

```
UPLOAD → EXTRACT → CLASSIFY → UNDERSTAND → ANALYZE → ASK → COMPARE → ACT / PREPARE
```

---

## 8. Application Areas & Implementation Status

### 8.1 Public Landing Page (`/`) — **Implemented**
- Presents the **EVIDENCE → MEANING → ACTION** workflow, sample grounded finding preview card, feature overview, privacy isolation summary, and mandatory legal-information disclaimer.
- Provides direct entry points to `/sign-in`, `/sign-up`, and `/dashboard`.

### 8.2 Dashboard (`/dashboard`) — **Partially Implemented**
- **Implemented**: Live summary counters (`Total Documents`, `Analyzed Documents`, `Open Review Actions`), 3-step onboarding card for empty accounts, recent documents grid with status/page badges and workspace links, quick action cards (`Upload a Document`, `Compare Documents`, `Action Center`), and legal notice banner.
- **Planned / Scoped to Workspace**: Dedicated global "Important upcoming dates" aggregation on `/dashboard` (currently surfaced per-document inside the Document Workspace `Important Dates` view).

### 8.3 Document Library (`/documents`) — **Partially Implemented**
- **Implemented**: Accessible drag-and-drop upload zone (`DocumentUpload`) and persisted user document library table displaying title, classification badge, processing status, page count, upload date, and `Open` workspace action.
- **Planned**: Client-side search and filter bars on `/documents` by document type, date, or status.

### 8.4 Document Workspace (`/documents/[documentId]`) *(flagship screen)* — **Implemented**

Conceptually structured around three functional domains (Section Navigation, Document Viewer, and Intelligence/Assistant Inspector) and implemented as a unified responsive workspace with **four top-level tabs** in `DocumentHeader`:

1. **`Intelligence & Findings` (`?tab=analysis`)** *(Combines Overview & Analyze)*
   - **Document Overview**: Classification badge (explicitly stated vs. inferred), parties, governing law, jurisdiction, and display-only executive summary.
   - **Important Sections**: Highlighted priority clauses with plain-English rationales and one-click section jump triggers.
   - **Attention Items, Important Dates & Financial Terms**: Dedicated summary cards and formatted grids linked directly to source text.
   - **Master-Detail Findings & Evidence Inspector**: Filterable `FindingList` (`All`, `Needs Attention`, `Important`, `Informational`, plus type filters) paired with `EvidencePanel` showing verbatim source excerpts, section/page coordinates, `View in Document Text`, and `Add action`.
2. **`Document Text` (`?tab=document`)**
   - Multi-section sidebar navigation + verbatim section text viewer (`DocumentViewer`).
   - Selecting `View in Document Text` on any finding or Q&A citation switches to this tab, scrolls to the target section, and highlights the exact excerpt (`<mark id="active-evidence-highlight">`).
   - Includes `Ask about this section` triggers for section-scoped Q&A.
3. **`Ask` (`?tab=ask`)**
   - Document-grounded Q&A (`AskPanel`) supporting both single-turn requests and persistent multi-turn SSE streaming conversations.
   - Section context selector and badge (`Phase 6`) with transparent same-document fallback notices.
   - Authoritative citation cards displaying section title, page badge (e.g., `Page 2` in the demonstrated NDA governing-law workflow), verbatim excerpt, and `View in Document` jump button.
   - Explicit zero-LLM refusal banner when document evidence is insufficient.
4. **`Professional Prep` (`?tab=prep`)**
   - Structured attorney consultation briefing (`ProfessionalPrepTab`) assembling document profile, key clauses, categorized findings, open review checklist items, neutral discussion prompts for legal counsel, and user-asked Q&A questions.
   - Includes one-click `Copy Briefing (Markdown)` and `Print / Save PDF` export controls.

### 8.5 Compare (`/compare`) — **Implemented**
- Select two ready documents (`DocumentSelectorPair`) with instant swap (`↔`) and URL state synchronization (`?docA=...&docB=...`).
- View metadata differences (governing law, jurisdiction, document type, parties) and categorized section differences (`Modified`, `Added`, `Removed`, `Unchanged`) with category filters and keyword search.
- Side-by-side verbatim source references and deep links (`View in Document A`, `View in Document B`).
- Strictly factual descriptions — never recommends which contract or clause to prefer.

### 8.6 Action Center (`/actions`) — **Implemented**
- User-controlled review checklist generated from findings (e.g., `Review Confidentiality Obligations`) or created manually per document.
- Status tabs (`All`, `Open`, `Completed`) and document filter dropdown.
- Optimistic status toggling (`open` $\leftrightarrow$ `completed` with `completedAt` timestamp) and deletion, preserving full section/page/quote provenance and deep links back to the Document Workspace.

---

## 9. Finding Taxonomy

Findings are the core intelligence unit (`document_findings`). Every finding has two orthogonal attributes:

- **`finding_type`** — *what category* of finding it is
- **`importance`** — *how urgently* the user should review it

These must not be conflated. Numerical legal risk scores are strictly forbidden.

### Canonical `finding_type` Values (Implemented in `lib/db/schema.ts`)

| Canonical Value | Meaning | Evidence Requirement |
|---|---|---|
| `key_term` | Important defined term, party reference, or core structural concept | Verbatim `source_text` + verified `section_id` required |
| `attention` | Substantive clause or matter warranting closer human review (e.g., broad indemnity, unilateral termination, restrictive covenant; corresponds to conceptual `clause` / attention category) | Verbatim `source_text` + verified `section_id` required |
| `obligation` | An explicit obligation — something a party must do or must not do | Verbatim `source_text` + verified `section_id` required |
| `ambiguity` | Language that is unclear, subjective, or open to more than one reasonable interpretation | Verbatim `source_text` + verified `section_id` required |
| `date` | Important date, term duration, notice window, or deadline stated in the document | Verbatim `source_text` + verified `section_id` required |
| `financial_term` | Fee, penalty, payment schedule, salary, cap, or monetary value stated in the document | Verbatim `source_text` + verified `section_id` required |
| `inconsistency` | Apparent conflict between two provisions, supported by evidence from the document | Verbatim `source_text` + verified `section_id` required |
| `missing_information` | An expected standard provision is absent given the document type and grounded in `CORE_PROVISION_CATALOG` (corresponds to conceptual `missing_provision`) | `source_text` and `section_id` are strictly `null` (never fabricated); `metadata` records `expectedTopic` and `ruleBasis` |

*(Note on `not_identified`: Rather than persisting speculative search-failure rows in `document_findings`, honest search failure when a user asks about an unmentioned topic is handled deterministically by the Q&A sufficiency gate (`hasSufficientEvidence: false`), which returns an explicit "insufficient information" message without calling the LLM.)*

### Canonical `importance` Levels

| Level | Meaning |
|---|---|
| `needs_attention` | Warrants careful review or counsel discussion before signing |
| `important` | Notable term or obligation that should be understood |
| `informational` | Context or background reference |

---

## 10. Non-Goals (MVP)

See [`docs/PHASE_PLAN.md`](PHASE_PLAN.md) for the full MVP vertical slice scope.

Explicitly out of scope:
- Legal representation, legal advice, or court filing
- Lawyer marketplace or referral monetization
- Autonomous contract negotiation or automated redlining
- Optical Character Recognition (OCR) for scanned image-only PDFs
- Voice interface or native mobile app
- Enterprise multi-tenancy / organization RBAC
- Billing / subscriptions
- Arbitrary multi-provider LLM routing (ClauseWise strictly bounds inference to local **Ollama** `qwen3:4b` + `nomic-embed-text` `768d` by default, with an optional server-side **OpenAI** `gpt-4o` structured-output adapter)
- Advanced user telemetry or analytics


