/**
 * Conversation Domain Service — ClauseWise (Phase 5 Slice 5.4)
 *
 * Manages document-scoped multi-turn conversation threads and message persistence.
 *
 * Invariants & Security Boundaries:
 * 1. Strict Ownership Enforcement on EVERY Operation:
 *    - All reads and mutations verify conversation.documentId === documentId AND conversation.userId === userId.
 * 2. Anti-Oracle Protection:
 *    - Cross-tenant or non-existent requests throw uniform ConversationAccessError.
 * 3. Message-State Semantics:
 *    - User messages store null for citations, hasSufficientEvidence, isGrounded, and citationValidationPassed.
 *    - Only assistant messages store grounding booleans and verified QaCitation[] arrays.
 * 4. Deterministic Ordering:
 *    - Messages are strictly retrieved with ORDER BY createdAt ASC, id ASC.
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  conversations,
  messages,
  documents,
  type Conversation,
  type Message,
  type QaCitation,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Domain Errors
// ---------------------------------------------------------------------------

export class ConversationServiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConversationServiceError";
  }
}

export class ConversationAccessError extends ConversationServiceError {
  constructor(message = "Conversation not found or access denied") {
    super(message);
    this.name = "ConversationAccessError";
  }
}

export class ConversationValidationError extends ConversationServiceError {
  constructor(message: string) {
    super(message);
    this.name = "ConversationValidationError";
  }
}

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

const UUID_SCHEMA = z.string().uuid("Invalid UUID format");

export const ConversationContextSchema = z.object({
  documentId: UUID_SCHEMA,
  userId: z.string().trim().min(1, "User ID is required"),
});

export const ConversationMutationSchema = z.object({
  conversationId: UUID_SCHEMA,
  documentId: UUID_SCHEMA,
  userId: z.string().trim().min(1, "User ID is required"),
});

// ---------------------------------------------------------------------------
// Internal Ownership Verification Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies that the specified document exists and is owned by userId.
 * Throws ConversationAccessError if not found (anti-oracle).
 */
export async function verifyDocumentOwnership(
  documentId: string,
  userId: string
): Promise<{ id: string }> {
  try {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
      .limit(1);

    if (!doc) {
      throw new ConversationAccessError("Document not found or access denied");
    }

    return doc;
  } catch (error) {
    if (error instanceof ConversationAccessError) throw error;
    throw new ConversationServiceError("Failed to verify document ownership", {
      cause: error,
    });
  }
}

/**
 * Verifies that the conversation exists and matches BOTH documentId and userId.
 * Throws ConversationAccessError if not found (anti-oracle).
 */
export async function verifyConversationOwnership(
  conversationId: string,
  documentId: string,
  userId: string
): Promise<Conversation> {
  try {
    const [convo] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.documentId, documentId),
          eq(conversations.userId, userId)
        )
      )
      .limit(1);

    if (!convo) {
      throw new ConversationAccessError("Conversation not found or access denied");
    }

    return convo;
  } catch (error) {
    if (error instanceof ConversationAccessError) throw error;
    throw new ConversationServiceError("Failed to verify conversation ownership", {
      cause: error,
    });
  }
}

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export interface ConversationSummary {
  id: string;
  documentId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

/**
 * Lists all conversations for a document owned by the specified user.
 */
export async function getConversationsForDocument(input: {
  documentId: string;
  userId: string;
}): Promise<ConversationSummary[]> {
  const { documentId, userId } = ConversationContextSchema.parse(input);
  await verifyDocumentOwnership(documentId, userId);

  try {
    const rows = await db
      .select({
        id: conversations.id,
        documentId: conversations.documentId,
        title: conversations.title,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        messageCount: sql<number>`cast(count(${messages.id}) as integer)`,
      })
      .from(conversations)
      .leftJoin(messages, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.documentId, documentId),
          eq(conversations.userId, userId)
        )
      )
      .groupBy(conversations.id)
      .orderBy(desc(conversations.updatedAt));

    return rows;
  } catch (error) {
    throw new ConversationServiceError("Failed to retrieve conversations", {
      cause: error,
    });
  }
}

/**
 * Retrieves a single conversation and its full message history.
 * Enforces strict document and user ownership.
 * Order contract: ORDER BY createdAt ASC, id ASC.
 */
export async function getConversationWithMessages(input: {
  conversationId: string;
  documentId: string;
  userId: string;
}): Promise<{ conversation: Conversation; messages: Message[] }> {
  const { conversationId, documentId, userId } =
    ConversationMutationSchema.parse(input);

  const conversation = await verifyConversationOwnership(
    conversationId,
    documentId,
    userId
  );

  try {
    const convoMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    return {
      conversation,
      messages: convoMessages,
    };
  } catch (error) {
    throw new ConversationServiceError(
      "Failed to retrieve conversation messages",
      { cause: error }
    );
  }
}

/**
 * Creates a new conversation thread for a document.
 */
export async function createConversation(input: {
  documentId: string;
  userId: string;
  title?: string;
}): Promise<Conversation> {
  const { documentId, userId } = ConversationContextSchema.parse({
    documentId: input.documentId,
    userId: input.userId,
  });

  await verifyDocumentOwnership(documentId, userId);

  const cleanTitle = input.title?.trim() || "New Conversation";

  try {
    const [created] = await db
      .insert(conversations)
      .values({
        documentId,
        userId,
        title: cleanTitle,
      })
      .returning();

    return created;
  } catch (error) {
    throw new ConversationServiceError("Failed to create conversation", {
      cause: error,
    });
  }
}

/**
 * Deletes a conversation thread and cascades to all its messages.
 */
export async function deleteConversation(input: {
  conversationId: string;
  documentId: string;
  userId: string;
}): Promise<{ success: true }> {
  const { conversationId, documentId, userId } =
    ConversationMutationSchema.parse(input);

  await verifyConversationOwnership(conversationId, documentId, userId);

  try {
    await db
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.documentId, documentId),
          eq(conversations.userId, userId)
        )
      );

    return { success: true };
  } catch (error) {
    throw new ConversationServiceError("Failed to delete conversation", {
      cause: error,
    });
  }
}

/**
 * Appends a user message to a conversation.
 * User message semantics: citations, hasSufficientEvidence, isGrounded, and
 * citationValidationPassed are explicitly stored as null.
 */
export async function appendUserMessage(input: {
  conversationId: string;
  documentId: string;
  userId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<Message> {
  const { conversationId, documentId, userId } =
    ConversationMutationSchema.parse({
      conversationId: input.conversationId,
      documentId: input.documentId,
      userId: input.userId,
    });

  const trimmedContent = input.content.trim();
  if (!trimmedContent) {
    throw new ConversationValidationError("Message content must not be empty");
  }

  await verifyConversationOwnership(conversationId, documentId, userId);

  try {
    const [newMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        role: "user",
        content: trimmedContent,
        citations: null,
        hasSufficientEvidence: null,
        isGrounded: null,
        citationValidationPassed: null,
        metadata: input.metadata ?? null,
      })
      .returning();

    // Touch conversation updatedAt
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return newMessage;
  } catch (error) {
    throw new ConversationServiceError("Failed to append user message", {
      cause: error,
    });
  }
}

/**
 * Appends a completed assistant answer message with verified citations.
 */
export async function appendAssistantMessage(input: {
  conversationId: string;
  documentId: string;
  userId: string;
  content: string;
  citations: QaCitation[] | null;
  hasSufficientEvidence: boolean;
  isGrounded: boolean;
  citationValidationPassed: boolean;
  metadata?: Record<string, unknown>;
}): Promise<Message> {
  const { conversationId, documentId, userId } =
    ConversationMutationSchema.parse({
      conversationId: input.conversationId,
      documentId: input.documentId,
      userId: input.userId,
    });

  await verifyConversationOwnership(conversationId, documentId, userId);

  try {
    const [newMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        role: "assistant",
        content: input.content,
        citations: input.citations,
        hasSufficientEvidence: input.hasSufficientEvidence,
        isGrounded: input.isGrounded,
        citationValidationPassed: input.citationValidationPassed,
        metadata: input.metadata ?? null,
      })
      .returning();

    // Touch conversation updatedAt
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return newMessage;
  } catch (error) {
    throw new ConversationServiceError("Failed to append assistant message", {
      cause: error,
    });
  }
}

