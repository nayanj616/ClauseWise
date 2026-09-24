import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { listUserDocuments } from "@/lib/services/document-service";
import { listActionsByUser } from "@/lib/services/action-service";
import {
  FileText,
  GitCompare,
  CheckSquare,
  ArrowRight,
  ShieldAlert,
  Clock,
  Sparkles,
  Upload,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard — ClauseWise",
  description: "Mission control for your legal document navigation, intelligence, and review actions.",
};

const quickActions = [
  {
    href: "/documents",
    icon: Upload,
    title: "Upload a Document",
    description: "Upload a PDF or Word document to extract clauses and analyze obligations.",
    cta: "Go to Documents",
  },
  {
    href: "/compare",
    icon: GitCompare,
    title: "Compare Documents",
    description: "Side-by-side comparison of two legal documents with verified evidence references.",
    cta: "Compare now",
  },
  {
    href: "/actions",
    icon: CheckSquare,
    title: "Action Center",
    description: "Track and manage review items derived from document findings with verified evidence.",
    cta: "View Actions",
  },
];

/**
 * Dashboard page — Phase 10 integration.
 * Displays real document metrics, recent document activity, and non-lawyer disclaimers.
 * Preserves service-layer architecture without direct database queries.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  const [userDocuments, userActions] = await Promise.all([
    listUserDocuments(session.user.id),
    listActionsByUser({ userId: session.user.id }),
  ]);

  const totalDocuments = userDocuments.length;
  const readyDocuments = userDocuments.filter((d) => d.status === "ready").length;
  const openActions = userActions.filter((a) => a.status === "open").length;

  const recentDocuments = userDocuments.slice(0, 4);

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6 lg:p-8 animate-fade-in max-w-7xl w-full mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your mission control for plain-English legal document intelligence and review prep.
        </p>
      </div>

      {/* Mandatory Disclaimer Banner with Dark Mode refinement */}
      <div
        role="region"
        aria-label="Legal Notice"
        className="rounded-xl border border-amber-200/90 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30 p-4 sm:p-5 text-sm text-amber-900 dark:text-amber-200 shadow-xs flex items-start gap-3.5"
        data-testid="dashboard-disclaimer-banner"
      >
        <ShieldAlert size={20} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950 dark:text-amber-100">
            ClauseWise is a legal document navigator, not a law firm.
          </p>
          <p className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-300">
            Every insight is grounded in authentic document text to help you prepare for review. It does <strong>not provide legal advice</strong> or representation. Always consult a qualified legal professional before executing binding agreements.
          </p>
        </div>
      </div>

      {/* Summary Statistics Grid */}
      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Account Overview Metrics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="dashboard-metrics-grid">
          {/* Card 1: Total Documents */}
          <div className="rounded-xl border bg-card p-5 shadow-xs space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Documents
            </span>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-2xl font-bold text-foreground sm:text-3xl">
                {totalDocuments}
              </span>
              <FileText size={20} className="text-muted-foreground" aria-hidden="true" />
            </div>
          </div>

          {/* Card 2: Ready / Analyzed Documents */}
          <div className="rounded-xl border bg-card p-5 shadow-xs space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Analyzed Documents
            </span>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-2xl font-bold text-foreground sm:text-3xl">
                {readyDocuments}
              </span>
              <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
          </div>

          {/* Card 3: Open Actions */}
          <div className="rounded-xl border bg-card p-5 shadow-xs space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Open Review Actions
            </span>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-2xl font-bold text-foreground sm:text-3xl">
                {openActions}
              </span>
              <CheckSquare size={20} className="text-primary" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      {/* Empty State Onboarding vs. Recent Documents */}
      {totalDocuments === 0 ? (
        <section aria-labelledby="onboarding-heading" className="space-y-4">
          <div className="rounded-2xl border bg-card p-6 sm:p-8 shadow-xs space-y-6" data-testid="dashboard-onboarding-card">
            <div className="space-y-1">
              <h2 id="onboarding-heading" className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <Sparkles size={20} className="text-primary" aria-hidden="true" />
                <span>Get Started with ClauseWise</span>
              </h2>
              <p className="text-sm text-muted-foreground">
                Follow these three simple steps to start navigating your legal agreements with evidence.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-muted/80 bg-muted/20 p-4 space-y-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                  1
                </div>
                <h3 className="text-sm font-semibold text-foreground">Upload Document</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upload a PDF or DOCX agreement. Text extraction begins automatically with strict confidentiality.
                </p>
              </div>

              <div className="rounded-xl border border-muted/80 bg-muted/20 p-4 space-y-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                  2
                </div>
                <h3 className="text-sm font-semibold text-foreground">Inspect Clauses & Meaning</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Review plain-English findings, key dates, obligations, financial terms, and absent provisions.
                </p>
              </div>

              <div className="rounded-xl border border-muted/80 bg-muted/20 p-4 space-y-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                  3
                </div>
                <h3 className="text-sm font-semibold text-foreground">Take Action & Compare</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ask grounded questions with verified citations, generate counsel briefings, and compare contract drafts.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <Button asChild size="default" className="gap-2">
                <Link href="/documents">
                  <Upload size={16} aria-hidden="true" />
                  <span>Upload Your First Document</span>
                </Link>
              </Button>
            </div>
          </div>
        </section>
      ) : (
        /* Recent Documents Section */
        <section aria-labelledby="recent-docs-heading" className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 id="recent-docs-heading" className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              <FileText size={18} className="text-primary" aria-hidden="true" />
              <span>Recent Documents</span>
            </h2>

            <Button asChild variant="ghost" size="sm" className="text-xs gap-1">
              <Link href="/documents">
                <span>View all</span>
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="dashboard-recent-docs-grid">
            {recentDocuments.map((doc) => (
              <Card key={doc.id} className="flex flex-col hover:border-primary/40 transition-colors">
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={doc.status === "ready" ? "ready" : "outline"} className="text-[10px] py-0">
                      {doc.status}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {typeof doc.pageCount === "number" && doc.pageCount > 0 ? `p. ${doc.pageCount}` : ""}
                    </span>
                  </div>
                  <CardTitle className="text-sm font-semibold text-foreground line-clamp-1" title={doc.title}>
                    {doc.title}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Uploaded {formatDate(doc.createdAt)}
                  </CardDescription>
                </CardHeader>

                <CardContent className="mt-auto pt-0">
                  <Button asChild variant="outline" size="sm" className="w-full text-xs h-8 gap-1">
                    <Link href={`/documents/${doc.id}`}>
                      <span>Open Workspace</span>
                      <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Quick Navigation Cards */}
      <section aria-labelledby="quick-actions-heading" className="space-y-4">
        <h2
          id="quick-actions-heading"
          className="text-sm font-semibold text-muted-foreground uppercase tracking-wider"
        >
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {quickActions.map(({ href, icon: Icon, title, description, cta }) => (
            <Card key={href} className="flex flex-col hover:border-primary/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon size={20} className="text-primary" aria-hidden="true" />
                </div>
                <CardTitle className="text-base font-semibold">{title}</CardTitle>
                <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                  {description}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild variant="outline" size="sm" className="w-full text-xs">
                  <Link href={href}>
                    {cta}
                    <ArrowRight size={13} className="ml-1.5" aria-hidden="true" />
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
