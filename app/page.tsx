import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  FileSearch,
  FileText,
  GitCompare,
  Lock,
  MessageSquareText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "ClauseWise — Evidence-Grounded Legal Document Navigator",
  description:
    "Understand legal agreements in plain English, extract key obligations and deadlines with verbatim source citations, compare drafts, and prepare structured briefings for legal counsel.",
};

interface WorkflowStep {
  step: string;
  phase: string;
  title: string;
  description: string;
}

const workflowSteps: WorkflowStep[] = [
  {
    step: "01",
    phase: "EVIDENCE",
    title: "Anchor to Verbatim Document Text",
    description:
      "Upload PDF, Word (.docx), or plain-text agreements. ClauseWise extracts structured sections and links every finding directly to exact quotes and page coordinates.",
  },
  {
    step: "02",
    phase: "MEANING",
    title: "Understand Clauses in Plain English",
    description:
      "Review clear explanations of obligations, renewal dates, financial commitments, ambiguities, and potentially absent standard provisions — without dense legalese.",
  },
  {
    step: "03",
    phase: "ACTION",
    title: "Track Follow-Ups & Prepare for Counsel",
    description:
      "Ask grounded questions with section citations, convert findings into trackable review checklist items, compare contract versions, and export a consultation briefing.",
  },
];

interface FeatureItem {
  icon: typeof FileSearch;
  badge: string;
  title: string;
  description: string;
}

const coreFeatures: FeatureItem[] = [
  {
    icon: FileSearch,
    badge: "Clause Extraction",
    title: "Key Obligations, Dates & Financial Terms",
    description:
      "Automatically surfaces renewal deadlines, notice windows, payment schedules, governing law, and clauses requiring closer review.",
  },
  {
    icon: BookOpen,
    badge: "Verified Provenance",
    title: "Click-to-Source Evidence Highlighting",
    description:
      "Every substantive finding includes a verbatim excerpt and section reference. Select any finding to jump straight to the highlighted passage in your document.",
  },
  {
    icon: MessageSquareText,
    badge: "Grounded Q&A",
    title: "Contextual Document & Section Assistant",
    description:
      "Ask questions across the entire agreement or scoped to a single clause. Responses cite specific sections and state explicitly when the document does not contain the answer.",
  },
  {
    icon: GitCompare,
    badge: "Draft Comparison",
    title: "Side-by-Side Contract Diffs",
    description:
      "Compare two versions of an agreement to inspect added, removed, and modified sections alongside party and governing-law metadata differences.",
  },
  {
    icon: CheckSquare,
    badge: "Action Center",
    title: "Structured Review Checklist",
    description:
      "Turn attention items and ambiguities into organized follow-up actions tied to their originating document and clause reference.",
  },
  {
    icon: CalendarClock,
    badge: "Counsel Briefing",
    title: "Professional Review Preparation",
    description:
      "Assemble a printable, exportable markdown briefing summarizing key clauses, open action items, and suggested clarification questions for your attorney.",
  },
];

/**
 * Public Landing Page — ClauseWise (Phase 2)
 *
 * Accessible to unauthenticated visitors at `/`.
 * Explains ClauseWise's core workflow (EVIDENCE → MEANING → ACTION),
 * provides clear Sign In / Sign Up / Dashboard entry points, and presents
 * privacy guarantees and mandatory legal-information disclaimers.
 */
export default function LandingPage(): React.JSX.Element {
  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      data-testid="landing-page"
    >
      {/* Accessible skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="ClauseWise home"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo size="md" />
          </Link>

          <nav
            aria-label="Landing page sections"
            className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex"
          >
            <a
              href="#how-it-works"
              className="transition-colors hover:text-foreground"
            >
              How It Works
            </a>
            <a
              href="#features"
              className="transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#privacy-disclaimer"
              className="transition-colors hover:text-foreground"
            >
              Privacy &amp; Disclaimer
            </a>
          </nav>

          <div
            className="flex items-center gap-2 sm:gap-3"
            data-testid="landing-header-actions"
          >
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/sign-up">
                <span>Get started</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1" tabIndex={-1}>
        {/* Hero Section */}
        <section
          aria-labelledby="hero-heading"
          className="relative overflow-hidden border-b bg-gradient-to-b from-secondary/60 via-background to-background py-14 sm:py-20 lg:py-24"
          data-testid="landing-hero-section"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
              {/* Left Column: Value Proposition & CTAs */}
              <div className="space-y-6 lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs font-semibold tracking-wide text-primary shadow-xs">
                  <Sparkles size={14} aria-hidden="true" />
                  <span>EVIDENCE &rarr; MEANING &rarr; ACTION</span>
                </div>

                <h1
                  id="hero-heading"
                  className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl lg:leading-[1.15]"
                >
                  Navigate complex legal documents in plain English — grounded in
                  verbatim evidence.
                </h1>

                <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  ClauseWise helps individuals and teams read contracts, leases,
                  NDAs, and service agreements with confidence. Extract key
                  obligations, deadlines, and financial terms with every
                  explanation tied directly to the exact clause and page in your
                  document.
                </p>

                <div
                  className="flex flex-wrap items-center gap-3 pt-2"
                  data-testid="landing-hero-ctas"
                >
                  <Button asChild size="lg" className="gap-2">
                    <Link href="/sign-up">
                      <span>Create free account</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/sign-in">Sign in to workspace</Link>
                  </Button>
                  <Button asChild variant="secondary" size="lg">
                    <Link href="/dashboard">Open Dashboard</Link>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2
                      size={14}
                      className="text-emerald-600"
                      aria-hidden="true"
                    />
                    Exact section &amp; page citations
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2
                      size={14}
                      className="text-emerald-600"
                      aria-hidden="true"
                    />
                    Private per-user document isolation
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2
                      size={14}
                      className="text-emerald-600"
                      aria-hidden="true"
                    />
                    Supports PDF, DOCX &amp; TXT
                  </span>
                </div>
              </div>

              {/* Right Column: Sample Grounded Finding Preview Card */}
              <div className="lg:col-span-5">
                <Card
                  className="border-primary/20 shadow-md"
                  aria-label="Example of an evidence-grounded clause finding"
                  data-testid="landing-sample-finding-card"
                >
                  <CardHeader className="space-y-3 border-b bg-muted/40 pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="attention">Needs Attention</Badge>
                        <Badge variant="outline">Obligation &amp; Date</Badge>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        Section 8.2 &middot; Page 4
                      </span>
                    </div>
                    <CardTitle className="text-base font-semibold">
                      Automatic Renewal &amp; 60-Day Notice Window
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Master_Services_Agreement_2026.pdf
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-4 text-sm">
                    {/* Step 1: Verbatim Evidence */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        1. Verbatim Source Excerpt
                      </p>
                      <blockquote className="rounded-md border-l-4 border-primary bg-secondary/70 p-3 text-xs italic leading-relaxed text-foreground">
                        &ldquo;This Agreement shall automatically renew for
                        successive twelve (12) month terms unless either party
                        provides written notice of non-renewal at least sixty
                        (60) calendar days prior to the expiration of the
                        then-current term.&rdquo;
                      </blockquote>
                    </div>

                    {/* Step 2: Plain-English Meaning */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        2. Plain-English Meaning
                      </p>
                      <p className="text-xs leading-relaxed text-foreground">
                        The contract renews for another full year automatically
                        unless written notice is sent at least 60 days before the
                        current term ends.
                      </p>
                    </div>

                    {/* Step 3: Next Action */}
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          3. Suggested Review Action
                        </span>
                        <Badge variant="ready" className="text-[10px]">
                          Verified Citation
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Calendar the 60-day notice deadline and confirm with
                        counsel whether email notice satisfies the written notice
                        clause.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works: Evidence -> Meaning -> Action */}
        <section
          id="how-it-works"
          aria-labelledby="workflow-heading"
          className="border-b py-14 sm:py-20"
          data-testid="landing-workflow-section"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center space-y-3">
              <h2
                id="workflow-heading"
                className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                Built on a Transparent Three-Step Workflow
              </h2>
              <p className="text-sm text-muted-foreground sm:text-base">
                ClauseWise never asks you to trust unverified summaries or opaque
                scores. Every insight follows a strict chain from source text to
                practical preparation.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {workflowSteps.map((item) => (
                <Card key={item.step} className="flex flex-col">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary">
                        {item.step}
                      </span>
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {item.phase}
                      </Badge>
                    </div>
                    <CardTitle className="pt-1 text-lg font-semibold">
                      {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Core Features Grid */}
        <section
          id="features"
          aria-labelledby="features-heading"
          className="border-b bg-secondary/30 py-14 sm:py-20"
          data-testid="landing-features-section"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center space-y-3">
              <h2
                id="features-heading"
                className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                Everything You Need to Prepare for Document Review
              </h2>
              <p className="text-sm text-muted-foreground sm:text-base">
                Designed to reduce cognitive load when reading dense agreements,
                surface what matters most, and help you ask sharper questions.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {coreFeatures.map(({ icon: Icon, badge, title, description }) => (
                <Card
                  key={title}
                  className="flex flex-col transition-colors hover:border-primary/40"
                >
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon
                          size={20}
                          className="text-primary"
                          aria-hidden="true"
                        />
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {badge}
                      </Badge>
                    </div>
                    <CardTitle className="text-base font-semibold">
                      {title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy Statement & Legal-Information Disclaimer Section */}
        <section
          id="privacy-disclaimer"
          aria-labelledby="trust-heading"
          className="border-b py-14 sm:py-20"
          data-testid="landing-trust-section"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="mx-auto max-w-3xl text-center space-y-2">
              <h2
                id="trust-heading"
                className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                Privacy Protection &amp; Responsible Use
              </h2>
              <p className="text-sm text-muted-foreground">
                Transparency about how your documents are handled and what
                ClauseWise is designed to do.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Privacy & Security Statement */}
              <Card data-testid="landing-privacy-card">
                <CardHeader className="space-y-2">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Lock
                      size={20}
                      className="text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <CardTitle className="text-lg font-semibold">
                    Privacy &amp; Strict Document Isolation
                  </CardTitle>
                  <CardDescription>
                    Your uploaded agreements remain private to your account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Uploaded files are stored in private, access-controlled
                    storage scoped to your authenticated user identity. Every
                    workspace query, Q&amp;A session, comparison, and action item
                    verifies account ownership before accessing document data.
                  </p>
                  <ul className="space-y-2 text-xs sm:text-sm">
                    <li className="flex items-start gap-2">
                      <ShieldCheck
                        size={16}
                        className="mt-0.5 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      <span>
                        <strong>Untrusted-input safety:</strong> Document text is
                        isolated from system instructions to defend against
                        embedded prompt-injection attempts.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ShieldCheck
                        size={16}
                        className="mt-0.5 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      <span>
                        <strong>Deterministic verification:</strong> Candidate AI
                        findings are checked against persisted document text
                        before being shown in your workspace.
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Mandatory Legal-Information Disclaimer */}
              <div
                role="region"
                aria-label="Legal Disclaimer"
                className="flex flex-col justify-between rounded-xl border border-amber-200/90 bg-amber-50/80 p-6 text-amber-950 shadow-xs"
                data-testid="landing-legal-disclaimer"
              >
                <div className="space-y-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                    <ShieldAlert
                      size={20}
                      className="text-amber-700"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-lg font-semibold text-amber-950">
                    Legal Information Disclaimer — Not Legal Advice
                  </h3>
                  <p className="text-sm leading-relaxed text-amber-900">
                    ClauseWise is an informational document navigation and review
                    preparation tool.{" "}
                    <strong>
                      ClauseWise is not a law firm, lawyer, legal advisor, or
                      legal representative, and is not a substitute for
                      professional legal advice.
                    </strong>
                  </p>
                  <p className="text-xs leading-relaxed text-amber-900/90">
                    Using ClauseWise does not create an attorney-client
                    relationship. Summaries, extracted clauses, and discussion
                    prompts are provided for educational and organizational
                    purposes only. Never rely solely on automated analysis to
                    execute, modify, or terminate a binding legal agreement —
                    always consult a qualified attorney licensed in your
                    jurisdiction.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA Section */}
        <section
          aria-labelledby="cta-heading"
          className="py-14 sm:py-20"
          data-testid="landing-cta-section"
        >
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <div className="rounded-2xl border bg-card p-8 shadow-xs sm:p-12 space-y-6">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <FileText
                  size={24}
                  className="text-primary"
                  aria-hidden="true"
                />
              </div>
              <div className="space-y-2">
                <h2
                  id="cta-heading"
                  className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
                >
                  Ready to review your next agreement with clarity?
                </h2>
                <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-base">
                  Create an account or sign in to upload a document, inspect
                  evidence-linked findings, and prepare for your next legal
                  review.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link href="/sign-up">
                    <span>Get started for free</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild variant="ghost" size="lg">
                  <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="text-xs text-muted-foreground">
              For informational purposes only. Not legal advice.
            </span>
          </div>

          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground"
          >
            <Link
              href="/sign-in"
              className="transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="transition-colors hover:text-foreground"
            >
              Create account
            </Link>
            <Link
              href="/dashboard"
              className="transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
