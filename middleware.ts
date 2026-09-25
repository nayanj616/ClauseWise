/**
 * Next.js Middleware — ClauseWise
 *
 * Enforces authentication on all app routes:
 *  - Unauthenticated users trying to reach /dashboard, /documents, etc.
 *    are redirected to /sign-in
 *  - Authenticated users trying to reach /sign-in or /sign-up are
 *    redirected to /dashboard (they're already signed in)
 *  - API auth routes (/api/auth/**) and static assets always pass through
 *
 * The middleware runs on the Edge and does NOT make DB calls — it reads
 * only the signed JWT cookie, which is a constant-time operation.
 */
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

// Routes that authenticated users should not reach
const AUTH_ROUTES = ["/sign-in", "/sign-up"];

// NextAuth internal routes — always allow
const AUTH_API_PREFIX = "/api/auth";

// Routes that require authentication
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/documents",
  "/compare",
  "/actions",
  "/prepare",
];

export default auth((req: NextRequest & { auth: unknown }) => {
  const { nextUrl } = req;
  const isLoggedIn = !!(req as { auth: unknown }).auth;

  // Always pass through NextAuth internal routes
  if (nextUrl.pathname.startsWith(AUTH_API_PREFIX)) {
    return NextResponse.next();
  }

  const isAuthRoute = AUTH_ROUTES.some((route) =>
    nextUrl.pathname.startsWith(route)
  );

  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    nextUrl.pathname.startsWith(prefix)
  );

  // Redirect authenticated users away from auth pages
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // Redirect unauthenticated users to sign-in
  if (!isLoggedIn && isProtectedRoute) {
    const signInUrl = new URL("/sign-in", nextUrl);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Run on all routes except static assets, image optimisation, and favicon
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

