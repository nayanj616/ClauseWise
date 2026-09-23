# Phase 9 — Document Comparison

## Overview

**Phase 9 (Compare)** implements objective, evidence-grounded side-by-side comparison between two legal documents within ClauseWise.

Aligned with the core principle **EVIDENCE → MEANING → ACTION**, Compare allows users to select two uploaded documents (Document A and Document B) to inspect structural and substantive differences—including wording alterations, added clauses, removed clauses, unchanged provisions, and legal metadata changes.

Importantly, Compare maintains strict non-lawyer safety boundaries: it describes what differs between documents, where differences appear, and what the verbatim text says. It **never** provides legal advice, produces risk scores, or recommends which document or clause is legally preferable.

---

## Architecture & Design Decisions

### 1. Deterministic Multi-Tier Alignment (Strategy D)
Following the approved Phase 9 implementation plan, comparison alignment is performed deterministically using existing extracted sections and persisted intelligence:
- **Tier 1 — Metadata Alignment**: Compares document-level profile properties (governing law, dispute jurisdiction, document type, parties).
- **Tier 2 — Exact Normalized Title Matching**: Matches sections whose normalized titles are identical (e.g., `1. confidentiality` matches `section 1: confidentiality`).
- **Tier 3 — Canonical Provision Catalog Keyword Matching**: Recognizes standard contractual provisions using keyword expectations from the Core Provision Catalog (`EXPECTATION_CATALOG`).
- **Tier 4 — Controlled Jaccard Content Overlap Fallback**:
  - Unmatched sections with Jaccard token similarity $\ge 0.45$ and proximate order are aligned.
  - Strict 1:1 matching ceiling: no section can match multiple candidates.
  - Deterministic tie-breaking: highest similarity score first, closest `orderIndex` distance second, stable section ID third.
- **Unmatched Residue**: Sections unique to Document A are classified as `removed`; sections unique to Document B are classified as `added`.

### 2. Strict "Unchanged" Definition
A provision is classified as `unchanged` **only** if the normalized text is strictly identical (`normContentA === normContentB`). If there is any wording alteration, addition, or omission, the clause is classified as `modified` to ensure no substantive nuances are hidden from the user.

### 3. Metric Privacy & Presentation Guard
Alignment similarity metrics (e.g. Jaccard coefficient) are kept internal to the matching algorithm and are **never** presented in the user-facing UI as legal confidence, semantic quality, or risk scores.

### 4. Zero Schema Migrations (On-Demand Computation)
Consistent with the Phase 9 architecture plan, comparison is performed on demand by combining verified sections from `document_sections` and findings from `document_findings`. This avoids premature persistence tables or synchronization drift when documents are updated.

---

## Safety Guarantees & Non-Lawyer Constraints

1. **Strict Tenant Isolation**: Both Document A and Document B must belong to the authenticated session user (`userId`).
2. **Anti-Oracle Protection**: If either document does not exist, belongs to another tenant, or has an invalid UUID, the API and service throw a uniform `ComparisonAccessError` mapped to `404 Not Found`.
3. **Self-Comparison Guard**: Comparing a document with itself (`docA === docB`) throws `ComparisonValidationError` mapped to `400 Bad Request`.
4. **Processing Readiness Enforcement**: Both documents must have `status === "ready"`. If either document is in `queued`, `extracting`, `analyzing`, or `error` status, a `ComparisonReadinessError` is returned (`422 Unprocessable Entity`).
5. **Factual & Objective Language**: All explanations state factual differences (e.g., "Survival period for confidentiality obligations changed from 2 years to 5 years") without value judgments, recommendations, or risk ratings.
6. **Prominent Disclaimers**: Banner and footer prominently disclose that comparison is for organizational purposes only and is not legal advice.

---

## Domain Service & API

### Service: `lib/services/comparison-service.ts`
- `compareDocuments({ documentAId, documentBId, userId })`: Primary entry point returning `DocumentComparisonResult`.
- Text normalization utilities: `normalizeTitle`, `normalizeContent`, `calculateJaccardSimilarity`.
- Metadata comparator: `compareDocumentMetadata`.
- Multi-tier alignment algorithm: `alignDocumentSections`.

### API Handler: `app/api/documents/compare/route.ts`
- `GET /api/documents/compare?docA={docAId}&docB={docBId}`
- Enforces session authentication via `auth()`.
- Validates query parameter presence and UUID formats.
- Maps domain errors to HTTP statuses:
  - 401 Unauthorized (missing session)
  - 400 Bad Request (missing params, malformed UUID, self-comparison)
  - 404 Not Found (inaccessible or non-existent document)
  - 422 Unprocessable Entity (unready document)
  - 500 Internal Server Error (sanitized, no internal database strings exposed)

---

## UI Components (`components/compare/`)

| Component | Purpose |
|---|---|
| `ComparisonWorkspace` | Master coordinator managing document selection, API fetching, URL query parameter synchronization, and state rendering. |
| `CompareDisclaimerBanner` | Top warning banner and footer establishing non-lawyer status and absence of attorney-client relationship. |
| `DocumentSelectorPair` | Two responsive dropdown selectors for Document A and Document B with status badges, disable rules, and swap button (`↔`). |
| `ComparisonSummaryCard` | Document identity overview (titles, pages, types) and breakdown metrics (`Modified`, `Added`, `Removed`, `Unchanged`). |
| `MetadataDiffCard` | Side-by-side comparison table of governing law, jurisdiction, document type, and parties with difference badges. |
| `DifferencesList` | Filterable list with category filter pills (`All`, `Modified`, `Added`, `Removed`, `Unchanged`) and live text search. |
| `DifferenceCard` | Side-by-side clause diff card with verbatim text quotes, page numbers, difference badges, and deep links. |
| `ComparisonEmptyState` | Empty states for `< 2` uploaded documents, pending selection, identical selection, and unready documents. |

### Evidence Traceability
Every difference card includes:
- Deep links back to the Document Workspace:
  - `View in Document A`: `/documents/[id]?tab=document&sectionId=...&findingId=...`
  - `View in Document B`: `/documents/[id]?tab=document&sectionId=...&findingId=...`
- Opening the link switches the target workspace directly to the Document Text tab, scrolls to the referenced section, and highlights the verbatim quote.

---

## Verification & Testing

### Unit Tests
- `tests/unit/comparison-service.test.ts` (13 tests):
  - Normalization, Jaccard similarity, 1:1 tie-breaking, metadata diffing, title matching, catalog keyword matching, Jaccard fallback, identical vs modified classification, tenant isolation, readiness checks, self-comparison guards.
- `tests/unit/comparison-routes.test.ts` (8 tests):
  - 401 unauthorized, 400 missing params, 400 invalid UUID, 400 self-comparison, 404 anti-oracle, 422 unready, 200 valid comparison, 500 sanitized unexpected errors.
- `tests/unit/comparison-ui.test.tsx` (8 tests):
  - Banner & footer copy, selector pair options & swap button, summary card counters, metadata diff card, difference cards, category filter tabs & search input, empty state variations, workspace assembly.

### E2E Tests (`tests/e2e/compare-flow.spec.ts`)
- 7 comprehensive browser tests with Playwright:
  1. Compare workspace access and legal disclaimers.
  2. Summary overview counts and metadata comparison.
  3. Section differences with side-by-side evidence quotes and deep links.
  4. Category filter tabs (`Modified`, `Added`, `Removed`, `Unchanged`, `All`) and keyword search.
  5. Swap button toggling Document A and Document B.
  6. Empty state for fewer than two uploaded documents.
  7. Empty state for unselected documents.

### Full Regression Results
- **Unit Tests**: 47 / 47 test files passing (766 passing tests).
- **E2E Tests**: 42 / 42 tests passing across all 8 test specs.
- **TypeScript**: 0 type errors (`npx tsc --noEmit`).
- **ESLint**: 0 warnings, 0 errors (`next lint`).
- **Build**: Production build succeeded cleanly (`next build`).
- **Repository Size**: 1.24 MiB (well below 10 MiB limit).

