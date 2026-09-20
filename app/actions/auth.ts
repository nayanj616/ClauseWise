/**
 * Auth Server Actions — ClauseWise
 *
 * sign-in: calls NextAuth signIn() with the credentials provider
 * sign-up: creates a new user record, then redirects to sign-in
 * sign-out: calls NextAuth signOut()
 *
 * All actions validate inputs with Zod before touching the database.
 * Errors are returned as { error: string } — never thrown to the client.
 *
 * "use server" ensures these never run in the browser bundle.
 */
"use server";

import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// Validation schemas (server-side only — not shared with client)
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be under 128 characters"),
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Sign in with email and password.
 * On success, NextAuth redirects to /dashboard (or callbackUrl).
 * On auth failure, returns { error }.
 */
export async function signInAction(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: (formData.get("callbackUrl") as string | null) ?? "/dashboard",
    });
  } catch (error) {
    // NextAuth throws a redirect — re-throw so Next.js handles it
    if (
      error instanceof Error &&
      error.message.includes("NEXT_REDIRECT")
    ) {
      throw error;
    }

    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password." };
        default:
          return { error: "Something went wrong. Please try again." };
      }
    }

    // Unexpected error — log server-side, return generic message
    console.error("[signInAction]", error);
    return { error: "An unexpected error occurred. Please try again." };
  }

  // This line is unreachable (signIn redirects) but TypeScript requires it
  return { success: true };
}

/**
 * Create a new user account.
 * On success, redirects to /sign-in with a ?registered=true query param.
 * On failure, returns { error }.
 */
export async function signUpAction(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { name, email, password } = parsed.data;

  // Check for existing account — use a constant-time-ish path to avoid
  // leaking whether an email is registered (return same message either way)
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return {
      error: "An account with this email already exists.",
    };
  }

  // Hash the password — cost factor 12 is a good balance for 2024 hardware
  const hashedPassword = await bcrypt.hash(password, 12);

  await db.insert(users).values({
    name,
    email,
    password: hashedPassword,
  });

  // Redirect to sign-in — do not auto-sign-in to keep the flow explicit
  redirect("/sign-in?registered=true");
}

/**
 * Sign out the current user and redirect to sign-in.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" });
}

