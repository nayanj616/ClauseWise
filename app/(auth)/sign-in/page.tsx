import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = {
  title: "Sign in",
};

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string; registered?: string; error?: string }>;
}

/**
 * Sign-in page — Server Component.
 * Reads search params and passes them to the client form.
 * Middleware will redirect authenticated users away from this page.
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your ClauseWise account</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm
          callbackUrl={params.callbackUrl}
          registered={params.registered === "true"}
        />
      </CardContent>
    </Card>
  );
}

