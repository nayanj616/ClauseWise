import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { FileText, GitCompare, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

const quickActions = [
  {
    href: "/documents",
    icon: FileText,
    title: "Upload a Document",
    description: "Upload a PDF or DOCX to analyse its key clauses and obligations.",
    cta: "Go to Documents",
  },
  {
    href: "/compare",
    icon: GitCompare,
    title: "Compare Documents",
    description: "Side-by-side comparison of two legal documents to spot differences.",
    cta: "Compare now",
  },
  {
    href: "/actions",
    icon: Zap,
    title: "Action Plans",
    description: "Turn document insights into a prioritised action checklist.",
    cta: "View Actions",
  },
];

/**
 * Dashboard page — Phase 0 placeholder.
 * Shows the authenticated user's name and quick-action cards.
 * Real document counts and recent activity added in Phase 1.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <div className="flex flex-col gap-8 p-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a legal document to get started, or pick up where you left off.
        </p>
      </div>

      {/* Disclaimer banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Remember:</strong> ClauseWise helps you understand legal
        documents in plain English. It is{" "}
        <strong>not a substitute for professional legal advice.</strong> Always
        consult a qualified lawyer before signing important agreements.
      </div>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions-heading">
        <h2
          id="quick-actions-heading"
          className="mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wide"
        >
          Quick actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {quickActions.map(({ href, icon: Icon, title, description, cta }) => (
            <Card key={href} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Icon size={20} className="text-primary" aria-hidden="true" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="text-sm">
                  {description}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={href}>
                    {cta}
                    <ArrowRight size={14} className="ml-2" aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

