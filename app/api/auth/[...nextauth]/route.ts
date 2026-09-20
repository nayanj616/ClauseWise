/**
 * NextAuth.js v5 Route Handler — ClauseWise
 *
 * Delegates GET and POST to the NextAuth handlers exported from auth.ts.
 * This file should remain a thin pass-through — do not add logic here.
 *
 * Handles:
 *   GET  /api/auth/session
 *   GET  /api/auth/csrf
 *   GET  /api/auth/providers
 *   GET  /api/auth/callback/:provider
 *   POST /api/auth/signin/:provider
 *   POST /api/auth/signout
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;

