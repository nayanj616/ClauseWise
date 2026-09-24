"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { signUpAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    signUpAction,
    undefined
  );

  return (
    <form action={action} noValidate className="space-y-4">
      {/* Server action error */}
      {state?.error && (
        <div
          id="signup-error"
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Your name"
          required
          minLength={2}
          aria-invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? "signup-error" : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          aria-invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? "signup-error" : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 characters"
          required
          minLength={8}
          aria-invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? "signup-error" : (undefined)}
        />
        <p className="text-xs text-muted-foreground">
          At least 8 characters.
        </p>
      </div>

      <SubmitButton />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

