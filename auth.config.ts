/**
 * NextAuth.js v5 — Edge-safe configuration
 *
 * This file contains ONLY the configuration that is safe to run in the
 * Edge Runtime (used by middleware.ts). It must NOT import:
 *   - bcryptjs (uses process.nextTick / setImmediate)
 *   - lib/db (uses Node.js net, tls, crypto, stream via the postgres driver)
 *   - Any other Node.js-only module
 *
 * The full credentials authorize() logic (which needs bcrypt + DB) lives in
 * auth.ts which runs only in the Node.js runtime (Server Actions, Route
 * Handlers).
 *
 * Middleware imports from THIS file via:
 *   import { auth } from "@/auth.config"
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },

  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },

  // Providers array is intentionally empty here.
  // The credentials provider (which needs bcrypt + DB) is added only in
  // auth.ts. NextAuth merges both configs at runtime.
  providers: [],

  callbacks: {
    /**
     * Edge-safe authorized callback.
     * Controls which requests are allowed through the middleware.
     * The full jwt/session callbacks that add user.id live in auth.ts.
     */
    authorized({ auth: session }) {
      // Simply check whether a session exists.
      // Route-level protection logic lives in middleware.ts.
      return !!session;
    },
  },
};

