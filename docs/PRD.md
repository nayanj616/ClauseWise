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

| Capability | Description |
|---|---|
| Plain-English Summary | Translate the full document into accessible language |
| Clause Explanation | Explain any clause in plain English on demand |
| Key Terms | Extract parties, dates, financial terms, key obligations |
| Attention Items | Surface clauses or gaps that deserve a closer look |
| Document Q&A | Answer user questions grounded in the uploaded document |
| Compare | Identify meaningful differences between two documents/versions |
| Action Items | Convert findings into user-controlled review checklist |
| Professional Prep | Generate a structured briefing for a legal professional |

---

## 5. What ClauseWise Does NOT Do

- Provide legal advice
- Act as a lawyer or legal representative
- Make legally binding determinations
- Represent users in any legal proceeding
- Generate numerical legal risk scores
- Recommend which contract to sign
- Replace professional legal review

A disclaimer will appear on every substantive AI output:
> ClauseWise provides informational assistance only and is not a substitute for
> qualified legal advice. Consult a licensed attorney for legal guidance.

---

## 6. Supported Document Types (MVP)

Primary demo: **Employment Agreement**

Also designed to support:
- Rental / lease agreements
- NDAs
- Service agreements
- Loan / financial agreements
- Terms of service
- Membership agreements

File formats: **PDF** (primary), **DOCX** (secondary)

---

## 7. Primary Workflow

```
UPLOAD → EXTRACT → CLASSIFY → UNDERSTAND → ANALYZE → ASK → COMPARE → ACT / PREPARE
```

---

## 8. Application Areas

### 8.1 Dashboard
- Recent documents with status
- Continue analysis shortcut
- Items needing review
- Important upcoming dates
- Upload shortcut
- Compare shortcut

### 8.2 Document Library
- List of uploaded documents
- Search and filter by type, date, status
- Upload action
- Link to Document Workspace

### 8.3 Document Workspace *(flagship screen)*

Three-panel desktop layout:

| Left | Center | Right |
|---|---|---|
| Document navigation / sections | Document viewer | Intelligence panel |

Intelligence panel tabs:

**Overview**
- Plain-English summary
- Document type and parties
- Key terms
- Financial terms
- Important metadata

**Analyze**
- Important clauses
- Obligations
- Important dates
- Attention items (needs attention / ambiguous / missing information)
- Inconsistencies where evidence supports them

**Ask**
- Document-grounded Q&A
- Context-aware follow-up
- Clause explanation
- Source citations

Selecting a finding navigates the document viewer to the source section.

### 8.4 Compare
- Select two documents or two versions
- View added / removed / modified clauses
- View changed values
- Source references for every meaningful difference
- No recommendation of which contract to prefer

### 8.5 Action Center
- User-controlled review checklist generated from findings
- Examples: "Review termination provision", "Clarify renewal condition"
- Mark items complete / defer / dismiss

### 8.6 Professional Prep
- Structured briefing document
- Key terms and parties
- Important clauses
- Areas to discuss
- Questions to ask the lawyer
- Relevant source sections

---

## 9. Finding Taxonomy

Findings are the core intelligence unit. Every finding has two orthogonal
attributes:

- **`finding_type`** — *what category* of finding it is
- **`importance`** — *how urgently* the user should review it

These must not be conflated. A `clause` finding can be `informational` or
`needs_attention`. A `missing_provision` is almost always `needs_attention`.

### Finding Types

| Type | Meaning |
|---|---|
| `key_term` | Important defined term, party reference, or defined concept |
| `clause` | Substantive clause worth surfacing (termination, indemnity, IP assignment, etc.) |
| `obligation` | An explicit obligation — something a party must do or must not do |
| `ambiguity` | Language that is unclear or open to more than one reasonable interpretation |
| `date` | Important date or deadline with a value or formula stated in the document |
| `financial_term` | Fee, penalty, payment, salary, or monetary value stated in the document |
| `inconsistency` | Apparent conflict between two provisions, supported by evidence from both |
| `missing_provision` | A provision clearly expected for this document type appears absent; AI cites the basis for expecting it |
| `not_identified` | AI could not locate information on a topic; honest search-failure, not a claim of absence |

### Importance Levels

| Level | Meaning |
|---|---|
| `needs_attention` | Warrants careful review before signing |
| `important` | Notable; should be understood but not necessarily alarming |
| `informational` | Context or background; no action expected |

Every finding must carry a reference to source evidence (section, page, verbatim
text excerpt) — except `not_identified`, where source is null by definition.

Avoid numerical scores.

---

## 10. Non-Goals (MVP)

See `docs/PHASE_PLAN.md` for what is and is not in scope for MVP.

Explicitly out of scope:
- Legal representation / filing
- Lawyer marketplace
- Autonomous negotiation
- OCR
- Voice interface
- Mobile app
- Enterprise multi-tenancy
- Billing / subscriptions
- Multiple LLM providers
- Advanced analytics

