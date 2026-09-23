# Phase 6 — Contextual Assistant

This document specifies the architecture, data contracts, and implementation guidelines for Phase 6 of ClauseWise: Contextual Assistant.

---

## Phase Overview

The project plan defines Phase 6 as:
$$\text{Selected Section} + \text{Question} \longrightarrow \text{Targeted Retrieval} \longrightarrow \text{Evidence Check} \longrightarrow \text{Streaming Answer} \longrightarrow \text{Authoritative Citations}$$

Phase 6 upgrades the ClauseWise Document Workspace into a context-aware assistant. When a user selects a document section/clause and asks a question, the assistant answers using that selected context plus targeted document retrieval, preserving evidence grounding, tenant isolation, and the existing multi-turn SSE streaming behavior.

---

## 1. Existing Phase 5 Architecture Reused

ClauseWise Phase 5 (Document-Grounded Q&A) provides the complete foundation for retrieval, grounded answer generation, conversation persistence, and SSE streaming. Phase 6 extends these existing interfaces cleanly without introducing duplicate or parallel systems.

| Interface / Component | Repository Location | Role in Phase 5 | Phase 6 Extension |
|---|---|---|---|
| `retrieveDocumentEvidence` / `semanticSearch` | `lib/services/retrieval-service.ts` | Question embedding via OpenAI `text-embedding-3-small`, pgvector similarity search, tenant isolation | Accepts optional `sectionId`. If provided, performs targeted vector search constrained to the selected section first, followed by same-document fallback if the section lacks sufficient evidence. |
| `answerQuestion` | `lib/services/qa-service.ts` | Evidence-first answer generation, zero-LLM refusal on insufficient evidence, citation verification | Accepts optional `sectionId`. Passes it to retrieval, handles contextual insufficient evidence responses. |
| `answerConversationQuestionStream` | `lib/services/qa-service.ts` | Multi-turn SSE streaming (`status`, `delta`, `complete`, `error`), bounded context (up to 3 turns) | Accepts optional `sectionId`. Incorporates active section context into prompt, tracks provenance when same-document fallback is used, and emits terminal complete event with contextual metadata. |
| `appendUserMessage` / `appendAssistantMessage` | `lib/services/conversation-service.ts` | Multi-turn message persistence in PostgreSQL `messages` table | `appendUserMessage` accepts optional `metadata?: Record<string, unknown>` to record active `sectionId` context without requiring schema migrations. |
| `POST /api/documents/[documentId]/conversations/[conversationId]/messages` | `app/api/documents/[documentId]/conversations/[conversationId]/messages/route.ts` | Authenticated SSE streaming route handler | Accepts optional `sectionId` in request body, verifies section belongs to document (anti-oracle), persists metadata, and streams contextual answer. |
| `POST /api/documents/[documentId]/ask` | `app/api/documents/[documentId]/ask/route.ts` | Single-turn Q&A route handler | Accepts optional `sectionId`, validates section ownership, delegates to `answerQuestion`. |
| `streamConversationMessageApi` & `askDocumentQuestionApi` | `lib/qa/qa-client.ts` | Typed client communication with streaming and single-turn endpoints | Accepts optional `sectionId` in options and includes it in request payloads. |
| `DocumentWorkspace` | `components/workspace/DocumentWorkspace.tsx` | Master tab layout container | Tracks `selectedContextSectionId`, bridges section selection from `DocumentViewer` to `AskPanel`. |
| `DocumentViewer` | `components/workspace/DocumentViewer.tsx` | Verbatim text viewer & section list | Provides "Ask about this section" contextual entry point in section headers. |
| `AskPanel` | `components/workspace/AskPanel.tsx` | Chat thread, starter prompts, streaming response rendering | Renders active section context badge, context switcher dropdown, clear context action, contextual starter questions, and provenance indicators. |

---

## 2. Context Model

The section context is represented using the existing `documentSections` entity (`id`, `documentId`, `orderIndex`, `sectionNumber`, `title`, `pageStart`, `pageEnd`).

1. **State representation**:
   - In UI: `activeSectionId: string | null` (null represents whole-document scope).
   - In API requests: `{ "question": string, "sectionId"?: string | null }`.
   - In message persistence: `messages.metadata: { "sectionId": string }` (stored in the existing nullable `jsonb` metadata column).

2. **Context Switching**:
   - The user can select a section, ask a question, and subsequently switch to a different section or clear context back to the entire document.
   - The selected section for any turn is explicit and authoritative for that turn's retrieval request.
   - Prior conversation history is retained (bounded to 3 turns), but subsequent turns execute against the newly active section constraint.

---

## 3. Targeted Retrieval Behavior & Provenance

Retrieval follows a strict tiered constraint pipeline:

```text
Selected Section (sectionId)
       ↓
pgvector search restricted to chunks where document_id = documentId AND section_id = sectionId
       ↓
Any chunk meeting minSimilarity threshold?
 ├── YES → Use section chunks as qualified evidence (fallbackUsed = false)
 └── NO  → Fallback: pgvector search across remainder of same document (section_id != sectionId)
            ↓
            Any chunk meeting minSimilarity threshold?
             ├── YES → Use document chunks as qualified evidence (fallbackUsed = true)
             └── NO  → Return hasSufficientEvidence = false (no LLM call)
```

### Provenance Invariant
To ensure the user is never misled into believing an answer derived from the selected clause when it actually came from another part of the document:
1. `RetrievalResult` records `fallbackUsed: boolean`.
2. When `fallbackUsed = true`:
   - The prompt explicitly informs the LLM that the selected section lacked direct evidence and that evidence from other sections of the document is provided.
   - Citations accurately report the actual source section and page number where the chunk originated.
   - The assistant answer explicitly identifies the source section used.

---

## 4. Evidence-First Behavior & Insufficient Evidence

1. **Zero-LLM Insufficient Gate**:
   - If neither the selected section nor the fallback search yields chunks meeting `minSimilarity`, the service makes **zero LLM calls**.
   - If a specific `sectionId` was targeted:
     ```text
     "I couldn't find enough information in the selected section to answer that reliably."
     ```
   - If the entire document lacked evidence:
     ```text
     "The document does not appear to contain sufficient information to answer this question."
     ```

2. **No Hallucination**:
   - General LLM knowledge is never substituted for missing document evidence.
   - Answers remain strictly grounded in retrieved chunks.

---

## 5. Security & Tenant Isolation

1. **Anti-Oracle Section Ownership**:
   - When `sectionId` is provided in API requests, the server validates:
     `SELECT id FROM document_sections WHERE id = sectionId AND document_id = documentId`
   - If the section does not exist or belongs to another document/tenant, the server returns a uniform:
     `404 "Section not found or access denied"`
   - Attackers cannot test for the existence of sections across documents or tenants.

2. **Document Isolation**:
   - Vector search queries always include `eq(documentChunks.documentId, documentId)`.
   - Chunks from other documents can never be retrieved under any circumstance.

---

## 6. Streaming

Phase 6 reuses the Phase 5 SSE protocol without modification:
- `event: status` (`retrieving_evidence`, `generating_answer`)
- `event: delta` (incremental provisional tokens)
- `event: complete` (terminal authoritative event with verified citations and messageId)
- `event: error` (sanitized user-safe errors)

Interrupted streams never persist a partial assistant answer to the database.

---

## 7. Testing Strategy

1. **Unit & Service Tests**:
   - `tests/unit/contextual-retrieval.test.ts`: Targeted section retrieval, same-document fallback, foreign section rejection, threshold filtering.
   - `tests/unit/contextual-assistant.test.ts`: Prompt formatting with section context, contextual insufficient response, context switching across turns, user message metadata persistence.
   - `tests/unit/contextual-ask-ui.test.tsx`: Active context banner, context selector, clear context action, contextual starter questions, "Ask about this section" navigation.

2. **E2E Tests**:
   - `tests/e2e/contextual-assistant-flow.spec.ts`: Full browser flow from section selection in DocumentViewer, asking contextual questions, receiving streamed grounded answers with citations, switching sections, and verifying source navigation.

---

## 8. Known Limitations

- Sub-clause targeting is bounded to the logical section boundaries produced by the Phase 2 extractor (`document_sections`). If a single section contains multiple lengthy sub-clauses, the active context encompasses the whole logical section.

