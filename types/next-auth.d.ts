/**
 * NextAuth.js v5 type augmentation — ClauseWise
 *
 * Extends the default Session and JWT types to include the user ID,
 * which is not present by default. This file is referenced by the
 * TypeScript compiler automatically (included in tsconfig include glob).
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * The Session object available in Server Components via `auth()` and
   * in client components via `useSession()`.
   */
  interface Session {
    user: {
      /** Database UUID of the authenticated user. Always present after sign-in. */
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  /** JWT payload — extends with user id for session callback mapping. */
  interface JWT {
    id: string;
  }
}

