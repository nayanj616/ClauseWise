"use client";

import * as React from "react";
import {
  Sparkles,
  Search,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  HelpCircle,
  Plus,
  Trash2,
  Square,
  MessageSquare,
  FileText,
  X,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  askDocumentQuestionApi,
  streamConversationMessageApi,
  fetchConversationsApi,
  createConversationApi,
  deleteConversationApi,
  fetchConversationWithMessagesApi,
} from "@/lib/qa/qa-client";
import type {
  AnswerQuestionResult,
  QaCitation,
  WorkspaceSection,
  ConversationSummary,
  Message,
} from "@/types";

export interface AskPanelProps {
  documentId: string;
  documentTitle?: string;
  sectionsById?: Map<string, WorkspaceSection>;
  sections?: WorkspaceSection[];
  activeSectionId?: string | null;
  onSelectContextSectionId?: (sectionId: string | null) => void;
  onNavigateToCitation?: (citation: QaCitation) => void;
  /** Custom ask function for testing or mock environments. */
  onAsk?: (
    documentId: string,
    question: string,
    sectionId?: string | null
  ) => Promise<AnswerQuestionResult>;
  /** Optional initial result to render (Phase 5.3 compatibility) */
  initialResult?: AnswerQuestionResult | null;
  /** Optional initial conversations for testing */
  initialConversations?: ConversationSummary[];
  /** Optional initial conversation ID */
  initialConversationId?: string | null;
  /** Optional initial messages */
  initialMessages?: Message[];
  className?: string;
}

const STARTER_QUESTIONS = [
  "What are the termination conditions and notice periods?",
  "What are the payment terms and invoice dispute deadlines?",
  "What is the governing law and dispute resolution mechanism?",
  "What are the key obligations and responsibilities of the parties?",
];

const CONTEXTUAL_STARTER_QUESTIONS = [
  "What are the core obligations and commitments in this section?",
  "Are there any deadlines, notice periods, or timing rules here?",
  "Does this section specify remedies, liabilities, or termination rights?",
  "What exceptions, conditions, or exclusions apply to this clause?",
];

/**
 * Document Q&A Panel — ClauseWise (Phase 5 Slice 5.4)
 *
 * Implements the multi-turn, streaming "Ask" navigator:
 * User Question → SSE Streaming → Provisional Deltas → Authoritative Verification → Grounded Citations.
 *
 * Invariants Enforced:
 * 1. Provisional vs. Authoritative Invariant:
 *    Delta events represent unverified text. Citations and grounding status are rendered ONLY
 *    upon terminal completion.
 * 2. Grounded Treatment Gate:
 *    An assistant response is treated as grounded ONLY when:
 *    hasSufficientEvidence === true && isGrounded === true && citationValidationPassed === true && citations.length > 0.
 * 3. Unverified Citations:
 *    If citationValidationPassed === false or citations.length === 0, the answer is flagged as unverified.
 * 4. Insufficient Evidence Refusal:
 *    If hasSufficientEvidence === false, an explicit refusal banner is rendered with ZERO LLM calls.
 * 5. Citation Privacy / Safety:
 *    Raw cosine similarity scores are stripped from the user interface.
 * 6. Actionable Evidence:
 *    Each citation links to the verbatim section in DocumentViewer with exact excerpt highlighting.
 */
export function AskPanel({
  documentId,
  documentTitle,
  sectionsById,
  sections,
  activeSectionId,
  onSelectContextSectionId,
  onNavigateToCitation,
  onAsk,
  initialResult = null,
  initialConversations = [],
  initialConversationId = null,
  initialMessages = [],
  className,
}: AskPanelProps) {
  const [question, setQuestion] = React.useState<string>("");
  const [conversations, setConversations] =
    React.useState<ConversationSummary[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = React.useState<
    string | null
  >(initialConversationId || initialConversations[0]?.id || null);
  const [messages, setMessages] = React.useState<Message[]>(initialMessages);

  // Section context state (supports both controlled activeSectionId and internal state)
  const [internalSectionId, setInternalSectionId] = React.useState<string | null>(
    activeSectionId !== undefined ? activeSectionId : null
  );

  const currentSectionId =
    activeSectionId !== undefined ? activeSectionId : internalSectionId;

  const handleSelectContextSection = React.useCallback(
    (secId: string | null) => {
      setInternalSectionId(secId);
      onSelectContextSectionId?.(secId);
    },
    [onSelectContextSectionId]
  );

  // Derive flat sections list sorted by orderIndex
  const availableSections = React.useMemo(() => {
    if (sections && sections.length > 0) return sections;
    if (sectionsById) {
      return Array.from(sectionsById.values()).sort(
        (a, b) => a.orderIndex - b.orderIndex
      );
    }
    return [];
  }, [sections, sectionsById]);

  // Derive active section object
  const activeSection = React.useMemo(() => {
    if (!currentSectionId) return null;
    return (
      sections?.find((s) => s.id === currentSectionId) ||
      sectionsById?.get(currentSectionId) ||
      availableSections.find((s) => s.id === currentSectionId) ||
      null
    );
  }, [currentSectionId, sections, sectionsById, availableSections]);

  // Streaming and loading state
  const [isStreaming, setIsStreaming] = React.useState<boolean>(false);
  const [streamingPhase, setStreamingPhase] = React.useState<string | null>(null);
  const [streamingDelta, setStreamingDelta] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  // Single-turn fallback state (for Phase 5.3 initialResult backward compatibility)
  const [result, setResult] = React.useState<AnswerQuestionResult | null>(
    initialResult
  );

  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat when new messages or deltas arrive
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingDelta]);

  // Load conversations on mount if not provided in props
  React.useEffect(() => {
    if (initialConversations.length > 0) return;
    let isMounted = true;

    async function loadConversations() {
      try {
        const convos = await fetchConversationsApi(documentId);
        if (isMounted) {
          setConversations(convos);
          if (convos.length > 0 && !activeConversationId) {
            setActiveConversationId(convos[0].id);
          }
        }
      } catch {
        // Silent catch for initial load (e.g. offline/mock environments)
      }
    }

    void loadConversations();
    return () => {
      isMounted = false;
    };
  }, [documentId, initialConversations.length, activeConversationId]);

  // Load messages whenever activeConversationId changes
  React.useEffect(() => {
    if (!activeConversationId || initialMessages.length > 0) return;
    let isMounted = true;

    async function loadMessages() {
      try {
        const data = await fetchConversationWithMessagesApi(
          documentId,
          activeConversationId!
        );
        if (isMounted) {
          setMessages(data.messages);
        }
      } catch {
        // Non-blocking catch
      }
    }

    void loadMessages();
    return () => {
      isMounted = false;
    };
  }, [documentId, activeConversationId, initialMessages.length]);

  // Handle switching conversations
  const handleSwitchConversation = async (conversationId: string) => {
    if (isStreaming) return;
    setActiveConversationId(conversationId);
    setError(null);
    setResult(null);
    try {
      const data = await fetchConversationWithMessagesApi(
        documentId,
        conversationId
      );
      setMessages(data.messages);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load conversation"
      );
    }
  };

  // Handle creating a new conversation
  const handleNewConversation = async () => {
    if (isStreaming) return;
    setError(null);
    setResult(null);
    try {
      const created = await createConversationApi(documentId);
      const summary: ConversationSummary = {
        id: created.id,
        documentId: created.documentId,
        title: created.title,
        createdAt: new Date(created.createdAt),
        updatedAt: new Date(created.updatedAt),
        messageCount: 0,
      };
      setConversations((prev) => [summary, ...prev]);
      setActiveConversationId(created.id);
      setMessages([]);
      setQuestion("");
      inputRef.current?.focus();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start new conversation"
      );
    }
  };

  // Handle deleting current conversation
  const handleDeleteConversation = async () => {
    if (!activeConversationId || isStreaming) return;
    setError(null);
    try {
      await deleteConversationApi(documentId, activeConversationId);
      const remaining = conversations.filter(
        (c) => c.id !== activeConversationId
      );
      setConversations(remaining);
      const nextId = remaining[0]?.id || null;
      setActiveConversationId(nextId);
      setMessages([]);
      setResult(null);
      if (nextId) {
        const data = await fetchConversationWithMessagesApi(documentId, nextId);
        setMessages(data.messages);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete conversation"
      );
    }
  };

  // Stop streaming generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStreamingPhase(null);
    setStreamingDelta("");
  };

  // Question submission handler
  const handleAsk = React.useCallback(
    async (questionToAsk: string) => {
      const trimmed = questionToAsk.trim();
      if (!trimmed || isStreaming) return;

      setIsStreaming(true);
      setError(null);
      setStreamingDelta("");
      setStreamingPhase("retrieving_evidence");

      // Custom mock onAsk hook (if supplied in props)
      if (onAsk) {
        try {
          const response = await onAsk(documentId, trimmed, currentSectionId);
          setResult(response);
          // Also append to local messages list
          const userMsg: Message = {
            id: `usr-${Date.now()}`,
            conversationId: activeConversationId || "mock-convo",
            role: "user",
            content: trimmed,
            citations: null,
            hasSufficientEvidence: null,
            isGrounded: null,
            citationValidationPassed: null,
            metadata: currentSectionId ? { sectionId: currentSectionId } : null,
            createdAt: new Date(),
          };
          const asstMsg: Message = {
            id: `asst-${Date.now()}`,
            conversationId: activeConversationId || "mock-convo",
            role: "assistant",
            content: response.answer,
            citations: response.citations,
            hasSufficientEvidence: response.hasSufficientEvidence,
            isGrounded: response.isGrounded,
            citationValidationPassed: response.citationValidationPassed,
            metadata: currentSectionId ? { sectionId: currentSectionId } : null,
            createdAt: new Date(),
          };
          setMessages((prev) => [...prev, userMsg, asstMsg]);
          setQuestion("");
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to generate answer"
          );
        } finally {
          setIsStreaming(false);
          setStreamingPhase(null);
        }
        return;
      }

      // Standard multi-turn streaming flow
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Auto-create conversation if none is active
        let targetConvoId = activeConversationId;
        if (!targetConvoId) {
          try {
            const created = await createConversationApi(
              documentId,
              trimmed.slice(0, 50),
              { signal: controller.signal }
            );
            targetConvoId = created.id;
            setActiveConversationId(created.id);
            setConversations((prev) => [
              {
                id: created.id,
                documentId: created.documentId,
                title: created.title,
                createdAt: new Date(created.createdAt),
                updatedAt: new Date(created.updatedAt),
                messageCount: 0,
              },
              ...prev,
            ]);
          } catch (convoErr) {
            // Fallback for environments or tests where multi-turn conversation persistence
            // is not available or single-turn /ask route is intercepted (Phase 5.3 backward compatibility)
            try {
              const singleTurnResponse = await askDocumentQuestionApi(
                documentId,
                trimmed,
                { signal: controller.signal, sectionId: currentSectionId }
              );
              setResult(singleTurnResponse);
              setQuestion("");
              return;
            } catch {
              throw convoErr;
            }
          }
        }

        // Optimistically add user message to UI
        const tempUserMessage: Message = {
          id: `temp-user-${Date.now()}`,
          conversationId: targetConvoId,
          role: "user",
          content: trimmed,
          citations: null,
          hasSufficientEvidence: null,
          isGrounded: null,
          citationValidationPassed: null,
          metadata: currentSectionId ? { sectionId: currentSectionId } : null,
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, tempUserMessage]);
        setQuestion("");

        let accumulatedAnswer = "";

        await streamConversationMessageApi(
          documentId,
          targetConvoId,
          trimmed,
          {
            onStatus: (status) => {
              setStreamingPhase(status.phase);
            },
            onDelta: (delta) => {
              accumulatedAnswer += delta;
              setStreamingDelta((prev) => prev + delta);
            },
            onComplete: (complete) => {
              // Terminal complete event represents the authoritative answer with verified citations
              const finalAssistantMessage: Message = {
                id: complete.messageId,
                conversationId: targetConvoId!,
                role: "assistant",
                content: complete.answer,
                citations: complete.citations,
                hasSufficientEvidence: complete.hasSufficientEvidence,
                isGrounded: complete.isGrounded,
                citationValidationPassed: complete.citationValidationPassed,
                metadata:
                  complete.sectionId || complete.fallbackUsed !== undefined
                    ? {
                        sectionId: complete.sectionId,
                        fallbackUsed: complete.fallbackUsed,
                      }
                    : null,
                createdAt: new Date(),
              };

              setMessages((prev) => [...prev, finalAssistantMessage]);
              setStreamingDelta("");
              setIsStreaming(false);
              setStreamingPhase(null);

              // Update message count in conversation summary
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === targetConvoId
                    ? { ...c, messageCount: c.messageCount + 2, updatedAt: new Date() }
                    : c
                )
              );
            },
            onError: (err) => {
              setError(err);
              setIsStreaming(false);
              setStreamingPhase(null);
              setStreamingDelta("");
            },
          },
          { signal: controller.signal, sectionId: currentSectionId }
        );
      } catch (err) {
        if (controller.signal.aborted) {
          // Stream cancelled by user
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while analyzing the document."
        );
        setIsStreaming(false);
        setStreamingPhase(null);
        setStreamingDelta("");
      } finally {
        abortControllerRef.current = null;
      }
    },
    [documentId, activeConversationId, isStreaming, onAsk, currentSectionId]
  );

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    void handleAsk(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleAsk(question);
    }
  };

  const handleSelectStarter = (starterText: string) => {
    setQuestion(starterText);
    inputRef.current?.focus();
  };

  // Evaluate single-turn backward compatibility grounding (Phase 5.3 initialResult)
  const isSingleTurnGrounded =
    result &&
    result.hasSufficientEvidence === true &&
    result.isGrounded === true &&
    result.citationValidationPassed === true &&
    Array.isArray(result.citations) &&
    result.citations.length > 0;

  const isSingleTurnInsufficient = result !== null && result.hasSufficientEvidence === false;

  const isSingleTurnCitationFailure =
    result !== null &&
    result.hasSufficientEvidence === true &&
    (result.citationValidationPassed === false ||
      !result.citations ||
      result.citations.length === 0);

  const hasThreadMessages = messages.length > 0;

  return (
    <div
      className={cn("space-y-6 animate-fade-in", className)}
      data-testid="ask-panel-container"
    >
      {/* 1. Header with Conversation Switcher */}
      <section
        className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm space-y-3"
        aria-label="Ask ClauseWise Conversations"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles size={18} className="text-primary" aria-hidden="true" />
              <span>Ask ClauseWise</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {documentTitle
                ? `Conversational Q&A grounded in verified text of ${documentTitle}.`
                : "Multi-turn Q&A grounded in verified document evidence."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1 py-1">
              <Search size={12} aria-hidden="true" />
              <span>Document-Grounded</span>
            </Badge>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNewConversation}
              disabled={isStreaming}
              className="text-xs gap-1.5 h-8"
              data-testid="new-conversation-button"
            >
              <Plus size={14} aria-hidden="true" />
              <span>New Chat</span>
            </Button>
          </div>
        </div>

        {/* Conversation selector bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquare size={13} aria-hidden="true" />
            <span>Thread:</span>
            <select
              value={activeConversationId || ""}
              onChange={(e) => void handleSwitchConversation(e.target.value)}
              disabled={isStreaming}
              aria-label="Select conversation thread"
              className="bg-background border rounded px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary max-w-xs truncate"
              data-testid="conversation-selector"
            >
              {conversations.length === 0 ? (
                <option value="">New Conversation</option>
              ) : (
                conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.messageCount} msg{c.messageCount === 1 ? "" : "s"})
                  </option>
                ))
              )}
            </select>
          </div>

          {activeConversationId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDeleteConversation}
              disabled={isStreaming}
              className="text-xs h-7 px-2 text-muted-foreground hover:text-destructive"
              data-testid="delete-conversation-button"
              title="Delete this thread"
            >
              <Trash2 size={13} aria-hidden="true" />
              <span className="sr-only">Delete Thread</span>
            </Button>
          )}
        </div>

        {/* Scope selector bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers size={13} aria-hidden="true" />
            <span>Scope:</span>
            <select
              value={currentSectionId || ""}
              onChange={(e) => handleSelectContextSection(e.target.value || null)}
              disabled={isStreaming}
              aria-label="Filter context by document section"
              className="bg-background border rounded px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary max-w-xs truncate"
              data-testid="section-context-selector"
            >
              <option value="">Whole Document (Entire Scope)</option>
              {availableSections.map((s, idx) => (
                <option key={s.id} value={s.id}>
                  {s.title ? s.title : `Section ${idx + 1}`}
                  {typeof s.pageStart === "number" && s.pageStart > 0
                    ? ` (Page ${s.pageStart})`
                    : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Section Context Banner */}
        {currentSectionId && activeSection && (
          <div
            className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-xs animate-fade-in"
            data-testid="active-section-context-banner"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={15} className="text-primary shrink-0" aria-hidden="true" />
              <span className="text-muted-foreground font-medium shrink-0">Asking about:</span>
              <span className="font-semibold text-foreground truncate">
                {activeSection.title || `Section ${activeSection.orderIndex + 1}`}
              </span>
              {typeof activeSection.pageStart === "number" && activeSection.pageStart > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
                  Page {activeSection.pageStart}
                </Badge>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleSelectContextSection(null)}
              disabled={isStreaming}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              data-testid="clear-section-context-button"
              title="Clear section context and search entire document"
            >
              <X size={12} aria-hidden="true" />
              <span>Clear context</span>
            </Button>
          </div>
        )}
      </section>

      {/* 2. Scrollable Conversation Message History */}
      {hasThreadMessages && (
        <section
          aria-label="Conversation messages"
          className="space-y-4"
          data-testid="conversation-messages-list"
        >
          {messages.map((msg, index) => {
            if (msg.role === "user") {
              const metaSecId =
                msg.metadata &&
                typeof msg.metadata === "object" &&
                "sectionId" in msg.metadata &&
                typeof msg.metadata.sectionId === "string"
                  ? msg.metadata.sectionId
                  : null;

              const contextSection = metaSecId
                ? sectionsById?.get(metaSecId) ||
                  sections?.find((s) => s.id === metaSecId) ||
                  availableSections.find((s) => s.id === metaSecId)
                : null;

              return (
                <div
                  key={msg.id || `user-${index}`}
                  className="flex flex-col items-end gap-1.5"
                  data-testid={`user-message-${index}`}
                >
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 shadow-sm text-sm whitespace-pre-wrap">
                    <p className="font-sans">{msg.content}</p>
                  </div>
                  {metaSecId && (
                    <div
                      data-testid="user-message-context-badge"
                      className="flex items-center gap-1 text-[11px] text-muted-foreground pr-1"
                    >
                      <FileText size={11} className="text-primary/70" aria-hidden="true" />
                      <span>
                        Focused on:{" "}
                        <strong className="font-medium text-foreground/80">
                          {contextSection?.title || "Targeted Section"}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              );
            }

            // Assistant turn evaluation
            const hasSufficientEvidence = msg.hasSufficientEvidence === true;
            const isGrounded = msg.isGrounded === true;
            const citationValidationPassed = msg.citationValidationPassed === true;
            const hasCitations = Array.isArray(msg.citations) && msg.citations.length > 0;

            const isGroundedSuccess =
              hasSufficientEvidence &&
              isGrounded &&
              citationValidationPassed &&
              hasCitations;

            const isInsufficient = msg.hasSufficientEvidence === false;
            const isCitationFailure =
              hasSufficientEvidence && (!citationValidationPassed || !hasCitations);

            return (
              <div
                key={msg.id || `assistant-${index}`}
                className="flex justify-start"
                data-testid={`assistant-message-${index}`}
              >
                <div className="w-full space-y-3">
                  {/* Refusal Banner */}
                  {isInsufficient && (
                    <div
                      className="rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20 p-5 space-y-2.5 shadow-sm"
                      data-testid="insufficient-evidence-banner"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertCircle
                          size={18}
                          className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                              Insufficient Document Evidence
                            </h4>
                            <Badge variant="attention" className="text-[10px] py-0">
                              Grounded Refusal
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground/90 font-medium leading-relaxed">
                            {msg.content}
                          </p>
                          <p className="text-xs text-muted-foreground pt-1">
                            ClauseWise strictly refuses to guess or introduce outside assumptions when document evidence is absent.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Unverified Citation Warning */}
                  {isCitationFailure && (
                    <div
                      className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-2 shadow-sm"
                      data-testid="unverified-citations-banner"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle
                          size={18}
                          className="text-destructive shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-destructive">
                              Unverified Answer — Citations Missing or Discredited
                            </h4>
                            <Badge variant="destructive" className="text-[10px] py-0">
                              Unverified
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            The generated answer could not be verified against authentic document chunks. This answer cannot be presented as verified evidence.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fallback Provenance Notice */}
                  {msg.metadata &&
                    typeof msg.metadata === "object" &&
                    "fallbackUsed" in msg.metadata &&
                    msg.metadata.fallbackUsed === true && (
                      <div
                        className="rounded-lg border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 shadow-sm"
                        data-testid="fallback-provenance-notice"
                      >
                        <AlertCircle
                          size={15}
                          className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
                          aria-hidden="true"
                        />
                        <div className="space-y-0.5">
                          <span className="font-semibold block">Same-Document Fallback Used</span>
                          <span className="leading-relaxed">
                            Direct evidence was not found in the selected section. This answer incorporates relevant provisions found elsewhere in the document.
                          </span>
                        </div>
                      </div>
                    )}

                  {/* Grounded Answer Card */}
                  {isGroundedSuccess && (
                    <div
                      className="rounded-xl border bg-card p-5 sm:p-6 shadow-sm space-y-4"
                      data-testid="ask-grounded-answer"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                        <Badge variant="ready" className="gap-1.5 text-xs py-1 px-3">
                          <CheckCircle2 size={13} aria-hidden="true" />
                          <span>Grounded in Evidence</span>
                        </Badge>

                        <Badge variant="outline" className="text-xs font-medium">
                          {`${msg.citations!.length} ${msg.citations!.length === 1 ? "Citation" : "Citations"}`}
                        </Badge>
                      </div>

                      <div className="text-sm sm:text-base leading-relaxed text-foreground whitespace-pre-line bg-muted/20 p-4 rounded-lg border border-muted/40">
                        {msg.content}
                      </div>

                      {/* Supporting Citations Cards */}
                      <div
                        className="pt-2 space-y-3"
                        data-testid="ask-citations-section"
                      >
                        <div className="flex items-center justify-between border-t pt-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Search size={13} className="text-primary" aria-hidden="true" />
                            <span>Supporting Evidence</span>
                          </h4>
                        </div>

                        <div className="space-y-2.5">
                          {msg.citations!.map((citation, cIdx) => {
                            const section =
                              citation.sectionId && sectionsById
                                ? sectionsById.get(citation.sectionId)
                                : undefined;
                            const sectionTitle =
                              section?.title ||
                              (section
                                ? `Section ${section.orderIndex + 1}`
                                : "Document Section");

                            const pageLabel =
                              typeof citation.pageNumber === "number" &&
                              citation.pageNumber > 0
                                ? `Page ${citation.pageNumber}`
                                : "Page —";

                            return (
                              <div
                                key={citation.chunkId || `cite-${cIdx}`}
                                className="rounded-lg border bg-muted/15 p-3.5 space-y-2.5 transition-colors hover:border-primary/40"
                                data-testid={`citation-card-${cIdx}`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs font-mono">
                                      {pageLabel}
                                    </Badge>
                                    <span className="text-xs font-medium text-foreground truncate max-w-md">
                                      {sectionTitle}
                                    </span>
                                  </div>

                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onNavigateToCitation?.(citation)}
                                    className="text-xs gap-1 h-7 px-2.5 text-primary hover:text-primary hover:bg-primary/10"
                                    data-testid={`citation-view-btn-${cIdx}`}
                                  >
                                    <span>View in Document</span>
                                    <ArrowRight size={13} aria-hidden="true" />
                                  </Button>
                                </div>

                                <blockquote className="border-l-2 border-primary/50 pl-3 py-1 text-xs sm:text-sm text-foreground/90 font-mono bg-background/50 rounded-r break-words whitespace-pre-wrap">
                                  {citation.sourceText}
                                </blockquote>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Active Streaming Message Card */}
          {isStreaming && (
            <div
              className="flex justify-start animate-fade-in"
              data-testid="ask-streaming-message"
              role="status"
              aria-live="polite"
              aria-atomic="false"
            >
              <div className="w-full rounded-xl border border-primary/30 bg-card p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-primary" aria-hidden="true" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {streamingPhase === "retrieving_evidence"
                        ? "Retrieving document evidence…"
                        : "Generating verified answer…"}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] py-0 animate-pulse">
                    Provisional Text
                  </Badge>
                </div>

                <div className="text-sm leading-relaxed text-foreground whitespace-pre-line min-h-[40px]">
                  {streamingDelta ? (
                    <>
                      {streamingDelta}
                      <span className="inline-block w-1.5 h-4 ml-1 bg-primary animate-pulse align-middle" />
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      Formulating response from retrieved evidence…
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>
      )}

      {/* 3. Backward Compatibility Single-Turn Display (Phase 5.3 initialResult) */}
      {!hasThreadMessages && result && (
        <div className="space-y-6">
          {/* Insufficient Evidence */}
          {isSingleTurnInsufficient && (
            <section
              aria-label="Insufficient evidence warning"
              className="rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20 p-5 sm:p-6 space-y-3 shadow-sm"
              data-testid="insufficient-evidence-banner"
            >
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                      Insufficient Document Evidence
                    </h3>
                    <Badge variant="attention" className="text-[10px] py-0">
                      Grounded Refusal
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/90 font-medium leading-relaxed">
                    {result.answer}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                    ClauseWise strictly refuses to guess or introduce outside legal assumptions when document evidence is absent.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Citation Validation Failure */}
          {isSingleTurnCitationFailure && (
            <section
              aria-label="Unverified answer warning"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6 space-y-3 shadow-sm"
              data-testid="unverified-citations-banner"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-destructive shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-destructive">
                      Unverified Answer — Citations Missing or Discredited
                    </h3>
                    <Badge variant="destructive" className="text-[10px] py-0">
                      Unverified
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The generated answer could not be verified against authentic document chunks.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Single-turn Fallback Provenance Notice */}
          {result && result.fallbackUsed === true && (
            <div
              className="rounded-lg border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 shadow-sm"
              data-testid="fallback-provenance-notice"
            >
              <AlertCircle
                size={15}
                className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <span className="font-semibold block">Same-Document Fallback Used</span>
                <span className="leading-relaxed">
                  Direct evidence was not found in the selected section. This answer incorporates relevant provisions found elsewhere in the document.
                </span>
              </div>
            </div>
          )}

          {/* Grounded Answer Card */}
          {isSingleTurnGrounded && (
            <section
              aria-label="Grounded question answer"
              className="rounded-xl border bg-card p-5 sm:p-6 shadow-sm space-y-5"
              data-testid="ask-grounded-answer"
            >
              <div className="border-b pb-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="ready" className="gap-1.5 text-xs py-1 px-3">
                    <CheckCircle2 size={13} aria-hidden="true" />
                    <span>Grounded in Evidence</span>
                  </Badge>

                  <Badge variant="outline" className="text-xs font-medium">
                    {`${result.citations.length} ${result.citations.length === 1 ? "Citation" : "Citations"}`}
                  </Badge>
                </div>

                <div className="pt-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Question
                  </span>
                  <p className="text-base font-semibold text-foreground break-words pt-0.5">
                    {result.question}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Answer
                </span>
                <div className="text-sm sm:text-base leading-relaxed text-foreground whitespace-pre-line bg-muted/20 p-4 rounded-lg border border-muted/40">
                  {result.answer}
                </div>
              </div>

              {/* Citations Section */}
              <div className="pt-2 space-y-4" data-testid="ask-citations-section">
                <div className="flex items-center justify-between gap-2 border-t pt-4">
                  <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
                    <Search size={15} className="text-primary" aria-hidden="true" />
                    <span>Supporting Document Evidence</span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {result.citations.map((citation, index) => {
                    const section = citation.sectionId && sectionsById
                      ? sectionsById.get(citation.sectionId)
                      : undefined;
                    const sectionTitle =
                      section?.title ||
                      (section ? `Section ${section.orderIndex + 1}` : "Document Section");
                    const pageLabel =
                      typeof citation.pageNumber === "number" && citation.pageNumber > 0
                        ? `Page ${citation.pageNumber}`
                        : "Page —";

                    return (
                      <div
                        key={citation.chunkId || `citation-${index}`}
                        className="rounded-lg border bg-muted/15 p-4 space-y-3 transition-colors hover:border-primary/40"
                        data-testid={`citation-card-${index}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">
                              {pageLabel}
                            </Badge>
                            <span className="text-xs font-medium text-foreground truncate max-w-md">
                              {sectionTitle}
                            </span>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onNavigateToCitation?.(citation)}
                            className="text-xs gap-1.5 h-7 px-2.5 text-primary hover:text-primary hover:bg-primary/10"
                            data-testid={`citation-view-btn-${index}`}
                          >
                            <span>View in Document</span>
                            <ArrowRight size={13} aria-hidden="true" />
                          </Button>
                        </div>

                        <blockquote className="border-l-2 border-primary/50 pl-3 py-1 text-xs sm:text-sm text-foreground/90 font-mono bg-background/50 rounded-r break-words whitespace-pre-wrap">
                          {citation.sourceText}
                        </blockquote>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* 4. Empty State with Starter Prompts (when thread is empty) */}
      {!hasThreadMessages && !result && !isStreaming && (
        <section
          aria-label="Starter questions and instructions"
          className="rounded-xl border bg-card p-6 sm:p-8 space-y-5 shadow-sm text-center"
          data-testid="ask-empty-state"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HelpCircle size={24} aria-hidden="true" />
          </div>

          <div className="space-y-1.5 max-w-lg mx-auto">
            <h3 className="text-base font-semibold text-foreground">
              {activeSection
                ? `Ask About ${activeSection.title || "Selected Section"}`
                : "Ask Any Question About This Document"}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {activeSection
                ? "Targeted questions are evaluated against the selected section first, ensuring precise, grounded answers with citations."
                : "ClauseWise searches authentic document sections to provide concise, plain-English answers with clickable citations back to the source text."}
            </p>
          </div>

          <div className="space-y-2 pt-2 text-left max-w-xl mx-auto">
            <span className="text-xs font-medium text-muted-foreground block text-center sm:text-left">
              {activeSection
                ? `Suggested questions for ${activeSection.title || "this section"}:`
                : "Suggested questions to get started:"}
            </span>
            <div className="grid grid-cols-1 gap-2">
              {(activeSection ? CONTEXTUAL_STARTER_QUESTIONS : STARTER_QUESTIONS).map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectStarter(q)}
                  className="w-full text-left text-xs sm:text-sm px-3.5 py-2.5 rounded-lg border bg-muted/30 hover:bg-muted/70 hover:border-primary/40 transition-colors flex items-center justify-between gap-2 group text-foreground"
                >
                  <span className="truncate">{q}</span>
                  <ArrowRight
                    size={14}
                    className="text-muted-foreground group-hover:text-primary transition-colors shrink-0"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. Error Banner */}
      {error && !isStreaming && (
        <section
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5 space-y-3 shadow-sm"
          data-testid="ask-error-state"
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-destructive shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-destructive">
                Unable to complete question analysis
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {error}
              </p>
            </div>
          </div>
          <div className="pt-1 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleAsk(question)}
              className="text-xs gap-1.5"
            >
              <span>Retry</span>
            </Button>
          </div>
        </section>
      )}

      {/* 6. Question Input Form */}
      <section
        className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm space-y-3"
        aria-label="Submit question"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              ref={inputRef}
              id="ask-question-input"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              maxLength={2000}
              placeholder={
                activeSection
                  ? `Ask a question about ${activeSection.title || "the selected section"}...`
                  : "Ask a question about terms, deadlines, obligations, or provisions..."
              }
              aria-label="Question about document"
              className={cn(
                "w-full rounded-lg border bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 resize-y min-h-[75px]",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-muted-foreground">
              {question.length}/2000 characters • Enter to submit, Shift+Enter for new line
            </span>

            <div className="flex items-center gap-2">
              {isStreaming ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleStopGeneration}
                  className="gap-2 font-medium"
                  data-testid="ask-stop-button"
                >
                  <Square size={13} aria-hidden="true" />
                  <span>Stop Generating</span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!question.trim()}
                  className="gap-2 font-medium"
                  data-testid="ask-submit-button"
                >
                  <Sparkles size={15} aria-hidden="true" />
                  <span>Ask Question</span>
                </Button>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
