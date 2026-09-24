"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

interface SignInFormProps {
  callbackUrl?: string;
  registered?: boolean;
}

export function SignInForm({ callbackUrl, registered }: SignInFormProps) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    signInAction,
    undefined
  );

  return (
    <form action={action} noValidate className="space-y-4">
      {/* Hidden field preserves the callbackUrl through the action */}
      {callbackUrl && (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}

      {/* Post-registration success message */}
      {registered && (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          Account created successfully. Please sign in.
        </div>
      )}

      {/* Server action error */}
      {state?.error && (
        <div
          id="signin-error"
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}

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
          aria-describedby={state?.error ? "signin-error" : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          aria-invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? "signin-error" : undefined}
        />
      </div>

      <SubmitButton />

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}

