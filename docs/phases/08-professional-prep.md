# Phase 8 — Professional Prep

This document specifies the architecture, data contracts, and implementation guidelines for Phase 8 of ClauseWise: Professional Prep.

---

## Phase Overview

The project plan defines Phase 8 as:
$$\text{Document} \longrightarrow \text{Findings} + \text{Actions} + \text{User Questions} \longrightarrow \text{Professional Prep}$$

Phase 8 helps users organize an existing document understanding into a concise, structured briefing package to prepare for a productive discussion with a qualified legal professional. It is an **organizational and preparation navigator**, not a legal advice engine or legal representative.

The core principle remains strictly: **EVIDENCE $\longrightarrow$ MEANING $\longrightarrow$ ACTION**.

---

## 1. Scope Boundary (MVP Consultation Briefing)

In strict adherence to the project plan and architectural safety constraints:

- **Included**:
  - **Deterministic Assembly**: Aggregates verified document intelligence, findings, open Action Center items, and user-recorded Q&A questions without speculative LLM inference.
  - **Zero Database Schema Change**: Reuses existing tables (`documents`, `document_sections`, `document_findings`, `actions`, `conversations`, `messages`).
  - **Prominent Disclaimers**: Banner and footer prominently emphasizing that ClauseWise is not a law firm or legal representative and the briefing is strictly for preparation and organization.
  - **Document Overview**: Document profile, parties, governing law, jurisdiction, page count, and executive summary.
  - **Key Clauses**: Core provisions extracted from validated document intelligence with page references, reasons, and jump navigation.
  - **Findings Review**: Grounded findings categorized into attention items, missing provisions, ambiguities/inconsistencies, and obligations/terms.
  - **Absence Truthfulness**: Absent standard provisions are clearly labeled without fabricated excerpts or fake quotes.
  - **Open Review Checklist**: Real-time actionable items linked to the document with in-place toggle and finding quote references.
  - **Discussion Prompts for Counsel**: Objective inquiry questions derived deterministically from document ambiguities, absent standard clauses, and high-priority obligations (e.g., *"Clarify the scope of...", "Discuss with counsel whether..."*).
  - **User Questions History**: Record of substantive questions previously asked by the user in Q&A turns.
  - **Bidirectional Source Navigation**: Clicking "View in Document Text" or "View Source Excerpt" switches to the Document tab, scrolls to the section, and highlights the verbatim quote.
  - **Export Capabilities**: Client-side Markdown briefing export to clipboard and Print / Save PDF view.
  - **Security & Tenant Isolation**: Anti-oracle 404 responses preventing document existence leakage across tenants.

- **Explicit Non-Goals (Strictly Excluded)**:
  - Legal advice, legal recommendations, legal conclusions presented as facts.
  - Numerical legal-risk scores.
  - Automated negotiation, contract rewriting, or redlining.
  - Lawyer matching, lawyer marketplace, or referral monetization.
  - Autonomous communication with lawyers, appointment scheduling, billing/payments.
  - Cross-document comparison or autonomous task execution.

---

## 2. Architecture & Data Contracts

### 2.1 Types (`types/index.ts`)

```typescript
export interface KeyClauseItem {
  sectionId: string;
  orderIndex: number;
  sectionNumber?: number | null;
  title: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  importanceReason?: string;
  verbatimExcerpt?: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  category: "missing_provision" | "ambiguity" | "inconsistency" | "attention_item";
  findingId?: string;
  sectionId?: string | null;
  sectionTitle?: string | null;
  pageNumber?: number | null;
  sourceText?: string | null;
  catalogTopic?: string | null;
}

export interface UserRecordedQuestion {
  id: string;
  question: string;
  askedAt: Date;
  conversationId: string;
}

export interface ProfessionalPrepData {
  document: {
    id: string;
    filename: string;
    documentType: string | null;
    isStatedType: boolean;
    parties: Array<{ name: string; role?: string | null }> | null;
    governingLaw: string | null;
    jurisdiction: string | null;
    pageCount: number | null;
    fileSizeBytes: number;
    createdAt: Date;
    executiveSummary?: string | null;
  };
  keyClauses: KeyClauseItem[];
  findingsSummary: {
    attentionItems: DocumentFinding[];
    ambiguitiesAndInconsistencies: DocumentFinding[];
    missingProvisions: DocumentFinding[];
    obligationsAndTerms: DocumentFinding[];
    totalFindingsCount: number;
  };
  openActions: ActionWithDetails[];
  completedActionsCount: number;
  userQuestions: UserRecordedQuestion[];
  clarificationQuestions: ClarificationQuestion[];
  generatedAt: Date;
}
```

### 2.2 Domain Service (`lib/services/preparation-service.ts`)

`getProfessionalPrepData(documentId: string, userId: string): Promise<ProfessionalPrepData>`
- **Step 1**: Enforces strict user ownership check (`documents.userId === userId`). Non-existent or unauthorized documents throw `PrepAccessError` (mapped to 404).
- **Step 2**: Fetches document workspace sections and findings.
- **Step 3**: Retrieves linked review actions via `listActionsByUser` filtered to `documentId`.
- **Step 4**: Retrieves user questions asked in Q&A conversations via `getUserQuestionsForDocument`.
- **Step 5**: Extracts key clauses from `importantSections` metadata.
- **Step 6**: Categorizes findings into attention items, ambiguities, missing provisions, and obligations.
- **Step 7**: Derives objective discussion prompts for counsel using deterministic framing templates.

### 2.3 API Route (`app/api/documents/[documentId]/prep/route.ts`)

- `GET /api/documents/[documentId]/prep`
- Validates active NextAuth session and UUID format.
- Calls `getProfessionalPrepData(documentId, userId)`.
- Catches `PrepAccessError` and `PrepValidationError` and maps to uniform 404.
- Catches unexpected errors and logs safely without leaking credentials.

---

## 3. UI Component Architecture

Located under `components/prep/`:
- `ProfessionalPrepTab.tsx`: Master tab assembling all briefing cards with export controls and action toggles.
- `PrepDisclaimerBanner.tsx`: Prominent warning banner & footer clarifying non-lawyer status.
- `PrepExportControls.tsx`: "Copy Briefing (Markdown)" & "Print / Save PDF" buttons.
- `PrepDocumentOverview.tsx`: Metadata grid displaying classification, parties, governing law, jurisdiction.
- `PrepKeyClauses.tsx`: Highlights core clauses from document intelligence with jump navigation.
- `PrepFindingsReview.tsx`: Attention items, missing provisions, ambiguities, obligations.
- `PrepOpenActions.tsx`: Action checklist with real-time checkbox status toggle and quote references.
- `PrepQuestionsForCounsel.tsx`: Discussion prompts for counsel with category badges.
- `PrepUserQuestions.tsx`: Questions asked in Q&A turns with timestamps.

Integrated into `components/workspace/DocumentHeader.tsx` (new `prep` tab with action count badge) and `DocumentWorkspace.tsx` (`activeTab === "prep"` rendering `ProfessionalPrepTab`).

---

## 4. Verification & Testing

- **Service Unit Tests (`tests/unit/preparation-service.test.ts`)**: 7 tests covering deterministic assembly, tenant isolation, anti-oracle 404 handling, objective question framing, key clause extraction, and missing information truthfulness.
- **Route Unit Tests (`tests/unit/preparation-routes.test.ts`)**: 5 tests covering 401 unauthorized, invalid UUID 404, valid briefing 200, cross-tenant 404 anti-oracle mapping, and 500 error sanitization.
- **UI Unit Tests (`tests/unit/preparation-ui.test.tsx`)**: 13 tests verifying rendering of all components, disclaimer copy, button handlers, and workspace tab integration.
- **E2E Playwright Tests (`tests/e2e/professional-prep-flow.spec.ts`)**: 4 tests verifying complete browser journey:
  1. Professional Prep tab rendering and all sections.
  2. Key clause jump navigation to Document Text.
  3. Finding evidence navigation with text highlight and focus.
  4. Direct URL navigation with `?tab=prep`.
- **Full Regressions**: All 44 unit test suites (737 tests) and all 35 Playwright E2E tests passing.

