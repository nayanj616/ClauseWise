/**
 * Unit tests — session utility helpers
 *
 * Tests: requireSession, getCurrentUserId, assertOwnership
 *
 * The auth() call is mocked — these tests verify the behaviour of our
 * wrappers, not NextAuth internals.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the auth() function from auth.ts
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// Mock next/navigation redirect — it throws in test context
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    // Simulate the redirect by throwing (Next.js redirect throws internally)
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

// Import after mocks are set up
import { auth } from "@/auth";
import {
  requireSession,
  getCurrentUserId,
  assertOwnership,
  type AuthSession,
} from "@/lib/auth/session";

const mockAuth = vi.mocked(auth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<AuthSession["user"]> = {}): AuthSession {
  return {
    user: {
      id: "user-uuid-1234",
      email: "test@example.com",
      name: "Test User",
      ...overrides,
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as AuthSession;
}

// ---------------------------------------------------------------------------
// requireSession
// ---------------------------------------------------------------------------

describe("requireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session when a valid session exists", async () => {
    const session = makeSession();
    // @ts-expect-error — auth() returns Session | null; we return AuthSession for test
    mockAuth.mockResolvedValueOnce(session);

    const result = await requireSession();
    expect(result.user.id).toBe("user-uuid-1234");
    expect(result.user.email).toBe("test@example.com");
  });

  it("redirects to /sign-in when no session exists", async () => {
    // @ts-expect-error — auth() overload typing
    mockAuth.mockResolvedValueOnce(null);

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(mockRedirect).toHaveBeenCalledWith("/sign-in");
  });

  it("redirects to /sign-in when session has no user id", async () => {
    // @ts-expect-error — auth() overload typing
    mockAuth.mockResolvedValueOnce({
      user: { email: "test@example.com" }, // no id
      expires: new Date().toISOString(),
    } as unknown as AuthSession);

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(mockRedirect).toHaveBeenCalledWith("/sign-in");
  });
});

// ---------------------------------------------------------------------------
// getCurrentUserId
// ---------------------------------------------------------------------------

describe("getCurrentUserId", () => {
  it("extracts the id from a valid session", () => {
    const session = makeSession({ id: "abc-123" });
    expect(getCurrentUserId(session)).toBe("abc-123");
  });

  it("throws an explicit error if id is somehow missing after requireSession", () => {
    // This should not happen in practice — requireSession() guarantees id exists
    // But we test the defensive guard anyway
    const badSession = makeSession({ id: "" });
    // Override id to empty string — TypeScript won't allow undefined but empty is testable
    expect(() => getCurrentUserId(badSession)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertOwnership
// ---------------------------------------------------------------------------

describe("assertOwnership", () => {
  it("does not throw when the session user owns the resource", () => {
    const session = makeSession({ id: "owner-id" });
    expect(() => assertOwnership(session, "owner-id")).not.toThrow();
  });

  it("throws Forbidden when session user does not own the resource", () => {
    const session = makeSession({ id: "attacker-id" });
    expect(() => assertOwnership(session, "owner-id")).toThrow("Forbidden");
  });

  it("throws even when resource owner id is an empty string (edge case)", () => {
    const session = makeSession({ id: "user-id" });
    expect(() => assertOwnership(session, "")).toThrow("Forbidden");
  });
});

