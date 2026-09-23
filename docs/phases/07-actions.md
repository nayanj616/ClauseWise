# Phase 7 — Action Center

This document specifies the architecture, data contracts, and implementation guidelines for Phase 7 of ClauseWise: Action Center.

---

## Phase Overview

The project plan defines Phase 7 as:
$$\text{Finding} \longrightarrow \text{Add Action} \longrightarrow \text{Action} \longrightarrow \text{Action Center}$$

Phase 7 turns substantive and missing-information document findings into trackable, actionable legal review items. The system automatically preserves the provenance relationship:
$$\text{Action} \longrightarrow \text{Document} \longrightarrow \text{Finding} \longrightarrow \text{Section} \cdot \text{Page} \cdot \text{Verbatim Source Text}$$

Users can manage review checklists, toggle completion status (`open` $\longleftrightarrow$ `completed`), filter by document and status, and jump directly back to the exact evidence in the document viewer.

---

## 1. Scope Boundary (MVP Review Checklist)

In strict adherence to project discipline:
- **Included**:
  - Review item creation from findings (with prefilled finding context).
  - Standalone review item creation per document.
  - Review item lifecycle: `open` $\longleftrightarrow$ `completed` (reopen capability).
  - Accurate `completedAt` timestamp tracking (set on complete, cleared on reopen).
  - Action Center dashboard with counters, status tabs, and document filters.
  - Bidirectional navigation: Finding $\rightarrow$ Action Center $\rightarrow$ Document Viewer (with section focus and evidence highlight).
  - Tenant isolation & anti-oracle 404 security.
- **Excluded**:
  - Assignees, priorities, due dates, reminder notifications, recurring actions, subtask dependencies, comments, collaboration, and autonomous AI task execution.

---

## 2. Database Schema & Migration

Implemented in PostgreSQL via Drizzle ORM table `actions` (Phase 7, migration `0007_fluffy_iron_lad.sql`):

```sql
CREATE TABLE IF NOT EXISTS "actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL REFERENCES "document"("id") ON DELETE cascade,
	"finding_id" uuid REFERENCES "document_findings"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_actions_user_id" ON "actions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_actions_document_id" ON "actions" ("document_id");
CREATE INDEX IF NOT EXISTS "idx_actions_finding_id" ON "actions" ("finding_id");
CREATE INDEX IF NOT EXISTS "idx_actions_status" ON "actions" ("status");
```

---

## 3. Domain Service (`lib/services/action-service.ts`)

| Function | Signature | Responsibility & Invariants |
|---|---|---|
| `createAction` | `(input: CreateActionInput) => Promise<Action>` | Validates document belongs to user; if `findingId` provided, validates finding belongs to document; inserts action with `status = "open"`, `completedAt = null`. |
| `updateActionStatus` | `(input: UpdateActionStatusInput) => Promise<Action>` | Validates action belongs to user; transitions `open` $\leftrightarrow$ `completed`; sets `completedAt` when completed and clears `completedAt` to `null` on reopen. |
| `listActionsByUser` | `(input: ListActionsInput) => Promise<ActionWithDetails[]>` | Returns user actions joined with `documents`, `documentFindings`, and `documentSections`; supports `documentId` and `status` filtering; enforces tenant isolation. |
| `getActionById` | `(actionId: string, userId: string) => Promise<ActionWithDetails>` | Returns single action with joined details, verifying ownership. |
| `deleteAction` | `(actionId: string, userId: string) => Promise<void>` | Deletes action, verifying ownership. |

### Domain Errors
- `ActionAccessError`: Thrown on unauthorized access, nonexistent resources, or cross-tenant attempts. Always maps to HTTP 404 (anti-oracle).
- `ActionValidationError`: Thrown on schema or semantic validation failures. Always maps to HTTP 400.
- `ActionServiceError`: Base domain service error.

---

## 4. API Route Handlers

### `GET /api/actions`
- **Auth**: Requires session (`401 Unauthorized`).
- **Query Parameters**:
  - `documentId?: string` (UUID)
  - `status?: "open" | "completed" | "all"`
- **Response**: `200 OK` `{ actions: ActionWithDetails[] }`.

### `POST /api/actions`
- **Auth**: Requires session (`401 Unauthorized`).
- **Body**: `{ documentId: string, findingId?: string, title: string, description?: string }`.
- **Validation**: Zod schema (`title` 1-300 chars, `description` max 2000 chars).
- **Response**: `201 Created` `{ action: Action }`.

### `GET /api/actions/[actionId]`
- **Auth**: Requires session (`401 Unauthorized`).
- **Response**: `200 OK` `{ action: ActionWithDetails }`.

### `PATCH /api/actions/[actionId]`
- **Auth**: Requires session (`401 Unauthorized`).
- **Body**: `{ status: "open" | "completed" }`.
- **Response**: `200 OK` `{ action: Action }`.

### `DELETE /api/actions/[actionId]`
- **Auth**: Requires session (`401 Unauthorized`).
- **Response**: `200 OK` `{ success: true }`.

---

## 5. UI Architecture

### 1. `CreateActionDialog` (`components/actions/CreateActionDialog.tsx`)
- Modal accessible dialog triggered from finding cards or evidence panels.
- Displays verified finding context: importance badge, finding type, label, section title, page number, and source excerpt quote (or absence notice for missing provisions).
- Prepopulates action title: `Review ${finding.label}`.
- Submits asynchronously with pending indicator and handles keyboard `Escape` closing.

### 2. `ActionCard` (`components/actions/ActionCard.tsx`)
- Checkbox toggle for status with instant feedback.
- Completed styling with strikethrough.
- Provenance box: Document name, Finding label, Section, Page number, and verbatim quote block.
- "View source in document" jump link returning directly to `/documents/[id]?sectionId=...&findingId=...&tab=document`.
- Delete action button.

### 3. `ActionCenter` (`components/actions/ActionCenter.tsx`)
- Accessible from main sidebar (`/actions`).
- Status tabs: All, Open, Completed with live counter pills.
- Document dropdown filter for multi-document filtering.
- Optimistic status toggling and deletions.
- Comprehensive empty states for initial state, all-completed state, and no-completed state.

### 4. Integration into Document Workspace
- `FindingCard` and `EvidencePanel` render accessible "Add action" buttons.
- `DocumentWorkspace` manages `actionFindingToCreate` state and renders `CreateActionDialog`.
- `DocumentWorkspace` accepts inbound `initialFindingId` and `initialSectionId` from URL query parameters and automatically focuses the section and highlights the evidence mark.

---

## 6. Verification Status

```text
- Unit/Integration test suites: 41 test files, 709 tests passing (100% green)
- Playwright E2E browser test suites: 31 browser tests passing (100% green)
- TypeScript strict check: 0 errors (npx tsc --noEmit)
- ESLint: 0 warnings/errors (npm run lint)
- Repository cleanliness & size: PASS (1.07 MiB, well under 10 MB limit)
```
