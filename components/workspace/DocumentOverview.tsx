"use client";

import * as React from "react";
import {
  Users,
  Scale,
  Calendar,
  DollarSign,
  FileText,
  Building,
  Clock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  WorkspaceDocument,
  ValidatedDate,
  ValidatedFinancialTerm,
} from "@/types";

export interface DocumentOverviewProps {
  document: WorkspaceDocument;
  className?: string;
}

export function DocumentOverview({ document, className }: DocumentOverviewProps) {
  // 1. Resolve Parties
  const parties = document.parties || [];

  // 2. Resolve Governing Law & Jurisdiction
  const governingLaw = document.governingLaw;
  const jurisdiction = document.jurisdiction;

  // 3. Resolve Important Dates from metadata
  const metadata = (document.metadata || {}) as Record<string, unknown>;
  const extraction = (metadata.extraction || {}) as Record<string, unknown>;
  const importantDates =
    (metadata.importantDates as ValidatedDate[] | undefined) ||
    (extraction.importantDates as ValidatedDate[] | undefined) ||
    [];

  // 4. Resolve Financial Terms from metadata
  const financialTerms =
    (metadata.financialTerms as ValidatedFinancialTerm[] | undefined) ||
    (extraction.financialTerms as ValidatedFinancialTerm[] | undefined) ||
    [];

  // 5. Resolve Executive Summary (Guardrail 1: only if already persisted)
  const executiveSummary =
    typeof metadata.executiveSummary === "string" && metadata.executiveSummary.trim()
      ? metadata.executiveSummary.trim()
      : null;

  return (
    <section
      aria-label="Document Overview"
      className={cn("space-y-6", className)}
      data-testid="document-overview-section"
    >
      {/* Executive Summary Card (rendered only when persisted) */}
      {executiveSummary && (
        <Card className="border-primary/20 bg-primary/[0.02]" data-testid="executive-summary-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <FileText size={18} className="text-primary" aria-hidden="true" />
              <span>Executive Summary</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {executiveSummary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Structured Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Parties Card */}
        <Card data-testid="parties-overview-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users size={16} aria-hidden="true" />
                Parties
              </span>
              <span className="text-xs font-normal">
                {parties.length > 0 ? `(${parties.length})` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {parties.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {parties.map((party, index) => (
                  <li
                    key={`${party.name}-${index}`}
                    className="flex flex-col gap-0.5 border-b border-border/50 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="font-medium text-foreground break-words">
                      {party.name}
                    </span>
                    {party.role && (
                      <span className="text-xs text-muted-foreground">
                        {party.role}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No parties identified in document.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Governing Law & Jurisdiction Card */}
        <Card data-testid="legal-framework-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
              <Scale size={16} aria-hidden="true" />
              Governing Law & Jurisdiction
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground block mb-0.5">
                Governing Law
              </span>
              <p
                className={cn(
                  "font-medium break-words",
                  governingLaw ? "text-foreground" : "text-muted-foreground italic text-xs"
                )}
              >
                {governingLaw || "Not specified in document"}
              </p>
            </div>

            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground block mb-0.5">
                Jurisdiction
              </span>
              <p
                className={cn(
                  "font-medium break-words",
                  jurisdiction ? "text-foreground" : "text-muted-foreground italic text-xs"
                )}
              >
                {jurisdiction || "Not specified in document"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Important Dates Card */}
        <Card data-testid="dates-overview-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar size={16} aria-hidden="true" />
                Key Dates
              </span>
              <span className="text-xs font-normal">
                {importantDates.length > 0 ? `(${importantDates.length})` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {importantDates.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {importantDates.map((d, index) => (
                  <li
                    key={`${d.dateValue}-${index}`}
                    className="border-b border-border/50 pb-2 last:border-0 last:pb-0 space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {d.dateValue}
                      </span>
                      {d.dateType && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                          {d.dateType.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                    {d.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2" title={d.description}>
                        {d.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No key dates identified.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Financial Terms Card */}
        <Card data-testid="financial-overview-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <DollarSign size={16} aria-hidden="true" />
                Financial Terms
              </span>
              <span className="text-xs font-normal">
                {financialTerms.length > 0 ? `(${financialTerms.length})` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {financialTerms.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {financialTerms.map((f, index) => (
                  <li
                    key={`${f.amount}-${index}`}
                    className="border-b border-border/50 pb-2 last:border-0 last:pb-0 space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {f.amount}
                      </span>
                      {f.frequency && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                          {f.frequency.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                    {f.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2" title={f.description}>
                        {f.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No financial terms identified.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

