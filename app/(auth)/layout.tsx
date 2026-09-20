import type { Metadata } from "next";
import { Logo } from "@/components/shared/Logo";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Auth route group layout.
 * Centred card layout — no sidebar, no navigation.
 * Only sign-in and sign-up pages live here.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8">
        <Logo size="lg" />
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
        ClauseWise helps you understand legal documents in plain English.{" "}
        <strong>Not a substitute for professional legal advice.</strong>
      </p>
    </div>
  );
}

