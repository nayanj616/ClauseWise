/**
 * NextAuth.js v5 (Auth.js) configuration — ClauseWise
 *
 * Strategy: JWT sessions with a Credentials provider.
 * The DrizzleAdapter is intentionally omitted for Phase 0:
 *   - JWT strategy does not persist sessions to the DB
 *   - Users are created via the signUpAction server action
 *   - The adapter will be added in Phase 10 when OAuth is introduced
 *
 * The schema includes NextAuth support tables (account, session,
 * verification_token) so that adding the adapter later requires only
 * a config change, not a data migration.
 *
 * SERVER-SIDE ONLY — do not import handlers in client components.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Credentials schema — validated before any DB query
// ---------------------------------------------------------------------------

const credentialsSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// ---------------------------------------------------------------------------
// NextAuth configuration
// ---------------------------------------------------------------------------

export const { handlers, signIn, signOut, auth } = NextAuth({
  // JWT strategy: sessions are stored in a signed cookie, not the database.
  // This removes the need for a sessions table in Phase 0.
  session: { strategy: "jwt" },

  // Custom pages — match the route group structure in app/(auth)/
  pages: {
    signIn: "/sign-in",
    error: "/sign-in", // Auth errors redirect back to sign-in with ?error=
  },

  providers: [
    Credentials({
      // Field definitions inform the default sign-in UI (not used — we have
      // a custom sign-in page, but the shape helps type inference)
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      authorize: async (rawCredentials) => {
        // 1. Validate input shape — reject malformed requests before DB hit
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // 2. Look up user — single query, select only needed fields
        const [user] = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            password: users.password,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // 3. Reject unknown users and OAuth-only accounts (no password hash)
        if (!user?.password) return null;

        // 4. Constant-time password comparison (bcrypt handles this)
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return null;

        // 5. Return the user shape that NextAuth encodes into the JWT
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * Persist the user ID into the JWT on sign-in so it is available
     * in every subsequent request without a DB round-trip.
     */
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },

    /**
     * Map the JWT id field to session.user.id for use in Server Components
     * and Server Actions via the auth() call.
     */
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id;
      }
      return session;
    },
  },
});

