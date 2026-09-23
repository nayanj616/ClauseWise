"use client";

import * as React from "react";
import {
  FileText,
  Users,
  Scale,
  MapPin,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDocumentTypeLabel } from "@/components/workspace/DocumentHeader";
import { cn } from "@/lib/utils";
import type { ProfessionalPrepData } from "@/lib/services/preparation-service";

export interface PrepDocumentOverviewProps {
  document: ProfessionalPrepData["document"];
  className?: string;
}

export function PrepDocumentOverview({
  document,
  className,
}: PrepDocumentOverviewProps) {
  const docTypeLabel = getDocumentTypeLabel(document.documentType);

  return (
    <Card
      className={cn("border-border shadow-xs", className)}
      data-testid="prep-document-overview"
    >
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <FileText size={18} className="text-primary" aria-hidden="true" />
            <span>Document Profile & Metadata</span>
          </CardTitle>

          <div className="flex items-center gap-2">
            <Badge
              variant="informational"
              className="gap-1.5 py-0.5 px-2.5 text-xs font-medium"
              data-testid="prep-doc-type-badge"
            >
              <Sparkles size={12} aria-hidden="true" />
              <span>{docTypeLabel}</span>
              <span className="text-[10px] opacity-75 font-normal">
                {document.isStatedType ? "• Stated" : "• Inferred"}
              </span>
            </Badge>

            {typeof document.pageCount === "number" && document.pageCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {`${document.pageCount} ${document.pageCount === 1 ? "page" : "pages"}`}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* Parties */}
          <div className="space-y-1.5">
            <span className="font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              <Users size={13} aria-hidden="true" />
              <span>Identified Parties</span>
            </span>
            {document.parties && document.parties.length > 0 ? (
              <ul className="space-y-1" data-testid="prep-parties-list">
                {document.parties.map((p, idx) => (
                  <li key={idx} className="text-foreground font-medium">
                    {p.name}
                    {p.role && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({p.role})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground italic">None identified</p>
            )}
          </div>

          {/* Governing Law */}
          <div className="space-y-1.5">
            <span className="font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              <Scale size={13} aria-hidden="true" />
              <span>Governing Law</span>
            </span>
            <p className="text-foreground font-medium" data-testid="prep-governing-law">
              {document.governingLaw || (
                <span className="text-muted-foreground italic font-normal">Not stated in document</span>
              )}
            </p>
          </div>

          {/* Jurisdiction */}
          <div className="space-y-1.5">
            <span className="font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              <MapPin size={13} aria-hidden="true" />
              <span>Dispute Jurisdiction</span>
            </span>
            <p className="text-foreground font-medium" data-testid="prep-jurisdiction">
              {document.jurisdiction || (
                <span className="text-muted-foreground italic font-normal">Not specified</span>
              )}
            </p>
          </div>
        </div>

        {/* Executive Summary */}
        {document.executiveSummary && (
          <div className="pt-2 border-t space-y-1.5" data-testid="prep-executive-summary">
            <span className="font-semibold text-foreground text-xs uppercase tracking-wider text-[10px] block">
              Executive Summary
            </span>
            <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
              {document.executiveSummary}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

