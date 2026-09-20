/**
 * Session utility helpers — ClauseWise
 *
 * Provides typed wrappers around the NextAuth auth() function for use in
 * Server Components and Server Actions.
 *
 * SERVER-SIDE ONLY — do not import in client components.
 *
 * Usage in a Server Component:
 *   const session = await requireSession()
 *   const userId = session.user.id
 *
 * Usage in a Server Action (after calling requireSession):
 *   const userId = getCurrentUserId(session)
 */
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";

export type AuthSession = Session & {
  user: { id: string; email: string; name?: string | null };
};

/**
 * Returns the current session or redirects to /sign-in.
 * Use at the top of any Server Component or Server Action that requires auth.
 *
 * @throws Redirects (via Next.js redirect()) if no valid session exists
 */
export async function requireSession(): Promise<AuthSession> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  return session as AuthSession;
}

/**
 * Extracts the user ID from a verified session.
 * Throws an explicit error (rather than returning undefined) so callers
 * never accidentally operate with a missing user ID.
 *
 * Call only after requireSession() has validated the session.
 */
export function getCurrentUserId(session: AuthSession): string {
  const userId = session.user.id;
  if (!userId) {
    // This should never happen after requireSession() but guards against
    // future changes that might loosen the session shape.
    throw new Error(
      "[clausewise] getCurrentUserId called with a session that has no user.id"
    );
  }
  return userId;
}

/**
 * Validates that a given user ID matches the authenticated user.
 * Use before any operation that accesses another user's resources.
 * Throws if ownership check fails.
 */
export function assertOwnership(
  session: AuthSession,
  resourceOwnerId: string
): void {
  if (session.user.id !== resourceOwnerId) {
    // Do not reveal which resource was requested
    throw new Error("Forbidden");
  }
}

