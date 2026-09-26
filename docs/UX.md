# ClauseWise — UX Principles

**Version:** 0.1 (living document)

---

## 1. Design Philosophy

**Clarity over cleverness.** Legal documents are stressful. The UI must reduce
cognitive load, not add to it. Every screen should answer the question:
"What does this mean for me, and what should I do next?"

**Evidence-first.** Users need to trust the AI findings. Every finding shows
where it came from. Clicking a finding scrolls the document to the source.

**Non-threatening.** The UI should feel like a knowledgeable assistant, not a
courtroom. Warm, readable typography; human-first language; no legal jargon in
UI copy.

**Responsible.** ClauseWise is not a lawyer. The disclaimer is always present
but not intrusive. Trust is earned through transparency, not suppressed through
hiding limitations.

---

## 2. Core Workflows and UX Goals

| Workflow | UX Goal |
|---|---|
| Upload | Drag-and-drop friendly; clear progress; clear success/error |
| Document Workspace | Three-panel; left = navigation, center = document, right = insights |
| Overview | Scannable; key info at a glance; no jargon |
| Analyze | Grouped findings; badge labels; click → scroll to source |
| Ask | Feels like a knowledgeable colleague, not a search engine |
| Compare | Clear side-by-side; changes highlighted; source-linked |
| Action Center | Simple checklist; status badges; bulk actions |
| Professional Prep | Clean, printable, shareable briefing |

---

## 3. Document Workspace Layout (Conceptual & Implemented)

### 3.1 Conceptual Three-Domain Model
```
┌────────────────────────────────────────────────────────────┐
│ Header: ClauseWise logo | Document title | Actions         │
├──────────┬──────────────────────────┬─────────────────────┤
│ LEFT     │ CENTER                   │ RIGHT               │
│ Section  │ Document Viewer          │ Intelligence Panel  │
│ Nav      │                          │                     │
│          │ Rendered PDF / text      │ Tabs:               │
│ § 1.     │                          │  Overview / Analyze │
│ § 2.     │ Highlighted evidence     │  Ask                │
│ § 3.     │ when finding selected    │  Professional Prep  │
│ ...      │                          │                     │
└──────────┴──────────────────────────┴─────────────────────┘
```

### 3.2 Implemented Workspace Layout (`/documents/[documentId]`)
To maximize readability and prevent horizontal crowding across desktop (`1280px`–`1920px`) and mobile (`< 768px`) viewports, `DocumentWorkspace.tsx` and `DocumentHeader.tsx` implement a unified header with **four dedicated workspace views**:

1. **`Intelligence & Findings` (`?tab=analysis`)**:
   - Displays `DocumentOverview` (parties, governing law, jurisdiction, executive summary), `ImportantSections`, `AttentionItemsSummary`, `FormattedDatesList`, and `FormattedFinancialList`.
   - Below the overview, renders a two-column **master-detail inspector**: filterable `FindingList` on the left and `EvidencePanel` on the right showing verbatim source quotes, page coordinates, `View in Document Text`, and `Add action`.
2. **`Document Text` (`?tab=document`)**:
   - Displays a two-column split (`DocumentViewer.tsx`): collapsible section navigation sidebar on the left and the verbatim section content reader on the right.
   - Clicking `View in Document Text` on any finding or Q&A citation switches to this tab, selects the target section, scrolls to `<mark id="active-evidence-highlight">`, and focuses the highlighted passage.
   - Each section header includes an `Ask about this section` action that opens the `Ask` tab scoped to that clause.
3. **`Ask` (`?tab=ask`)**:
   - Renders `AskPanel.tsx` with a conversation thread switcher, section context badge, SSE streaming response area (`role="status"`, `aria-live="polite"`), and verified citation cards (e.g., citing **Page 2** in the demonstrated NDA governing-law query) with `View in Document` jump buttons.
4. **`Professional Prep` (`?tab=prep`)**:
   - Renders `ProfessionalPrepTab.tsx` assembling the consultation briefing (document overview, key clauses, categorized findings, open review checklist items, neutral questions for legal counsel, and user Q&A history) with `Copy Briefing (Markdown)` and `Print / Save PDF` controls.

---

## 4. Finding Cards

Each finding card must display:
- Type badge (e.g. "Needs Attention", "Obligation", "Important Date")
- Short label
- Plain-English summary (1–3 sentences)
- Source reference (section title + page)
- "View in document" link → scrolls center panel to source

Do NOT display:
- Numerical scores
- Legal verdicts
- "This clause is illegal" type statements

---

## 5. Accessibility Requirements

The application must meet WCAG 2.1 AA as a baseline.

### Keyboard Navigation
- All interactive elements reachable by `Tab`
- Modal dialogs trap focus correctly
- `Escape` closes modals and popovers
- Document viewer supports keyboard scroll
- Finding navigation accessible by keyboard

### Semantic HTML
- Use `<main>`, `<nav>`, `<aside>`, `<section>`, `<article>` correctly
- Headings follow a logical hierarchy (`h1` → `h2` → `h3`)
- Use `<button>` for actions, `<a>` for navigation
- Never use `<div onClick>` as an interactive element without ARIA role

### ARIA Labels
- All icon-only buttons have `aria-label`
- Complex components (tabs, dialogs, accordions) use correct ARIA patterns
- File upload input has a visible or screen-reader-accessible label
- Loading states use `aria-busy` or live regions

### Color and Contrast
- Do not convey meaning by color alone
- Finding type badges use both color AND text label
- Minimum contrast ratio 4.5:1 for normal text, 3:1 for large text

### Focus States
- Visible focus rings on all interactive elements (not removed with `outline: none`)
- Use Tailwind `focus-visible:ring` utilities

### Typography
- Minimum body font size: 16px
- Line height: 1.5 minimum for body text
- Avoid justified text (causes readability issues)
- Use a readable font stack (system fonts or Inter)

### Loading / Error / Empty States
Every async operation must have:
- **Loading:** skeleton or spinner with `aria-busy`
- **Error:** user-friendly message + recovery action
- **Empty:** informative message + clear call to action

---

## 6. Responsive Design

Primary target: **desktop** (legal document review is a desktop task)

Must not break on:
- 1280px wide viewport (minimum desktop)
- 1440px (common desktop)
- 1920px (large monitor)

Mobile breakpoints:
- Document Workspace collapses to stacked layout
- Global navigation collapses into an accessible mobile drawer (`MobileNav.tsx`) with `Escape` key dismissal and scroll lock
- Core functionality remains usable

---

## 7. Copy and Tone

- Write UI copy in plain English, not legalese
- Avoid "AI says...", "the model determined...", "according to my analysis..."
- Prefer: "This clause states...", "The document mentions...", "You may want to review..."
- Never overstate certainty: use "appears to", "may", "seems to"
- Disclaimer text is always present but concise:
  > For informational purposes only. Not legal advice.

---

## 8. Loading and Processing States

- **Implemented**:
  - Route-level accessible loading skeletons (`loading.tsx` with `role="status"` and `aria-busy="true"`) across Dashboard, Documents, Compare, Actions, and Workspace.
  - Explicit workspace states in `WorkspaceStates.tsx` (`DocumentProcessingState`, `DocumentErrorState`, `EmptyContentState`, `DocumentNotFoundState`) driven by the canonical `DOCUMENT_STATUS` enum (`queued`, `extracting`, `extracted`, `chunking`, `analyzing`, `ready`, `error`).
  - SSE streaming status phases (`retrieving_evidence`, `generating_answer`) announced via `aria-live="polite"` in `AskPanel`.
- **Planned (With Async Upload Queue)**:
  - Live step-by-step progress polling (`GET /api/documents/[id]/status`) during out-of-band upload processing:
    ```
    ✓ File uploaded
    ⏳ Extracting text...
    ⏳ Analyzing document...
    ✓ Ready
    ```

---

## 9. Navigation (Implemented)

```
/ (Public Landing Page)
├── /sign-in & /sign-up
└── Protected App Shell (Sidebar on desktop / MobileNav drawer on mobile)
    ├── /dashboard
    ├── /documents
    │   └── /documents/[documentId] (Workspace tabs: analysis, document, ask, prep)
    ├── /compare
    └── /actions
```

Global navigation: fixed left `Sidebar.tsx` on desktop (`>= md`) or hamburger drawer `MobileNav.tsx` on mobile (`< md`), with a keyboard-accessible `Skip to main content` link at the top of the layout.


---

## 10. Design System

Base: **shadcn/ui** components on **Tailwind CSS**

- Use shadcn primitives: Button, Card, Tabs, Dialog, Tooltip, Badge,
  Separator, Skeleton, Toast, Progress
- Extend primitives via `cn()` class merging; do not fork primitives
- Define a consistent color palette in `tailwind.config.ts`
- Define typography scale in Tailwind config

Primary palette direction: professional, trustworthy, calm.
Avoid: bright red danger colors for findings (findings are information, not alarms).
Use: subtle amber for attention, muted blue for informational, neutral gray for background.

