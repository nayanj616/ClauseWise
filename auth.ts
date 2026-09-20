/**
 * NextAuth.js v5 (Auth.js) — full configuration — ClauseWise
 *
 * NODE.JS RUNTIME ONLY — do not import from middleware.ts.
 * Middleware must import from auth.config.ts (Edge-safe, no bcrypt / no DB).
 *
 * Strategy: JWT sessions + Credentials provider.
 * DrizzleAdapter intentionally omitted for Phase 0 (added in Phase 10 for OAuth).
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { authConfig } from "@/auth.config";

// ---------------------------------------------------------------------------
// Credentials input schema
// ---------------------------------------------------------------------------

const credentialsSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// ---------------------------------------------------------------------------
// NextAuth — merges authConfig (Edge-safe base) + credentials provider
// ---------------------------------------------------------------------------

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      authorize: async (rawCredentials) => {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

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

        if (!user?.password) return null;

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        };
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,

    jwt({ token, user }) {
      if (user?.id) {
        // user.id is a string from our authorize() return
        token.id = user.id as string;
      }
      return token;
    },

    session({ session, token }) {
      if (token.id) {
        /**
         * NextAuth v5 beta: JWT module augmentation resolves token.id to
         * `string` via types/next-auth.d.ts, but the type-checker may
         * still infer `{}` after the truthiness guard in some compiler
         * versions. The explicit cast is safe — token.id is always set as
         * a string in the jwt() callback above.
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        session.user.id = token.id as any as string;
      }
      return session;
    },
  },
});
