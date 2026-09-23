"use client";

import * as React from "react";
import { ArrowLeftRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UserDocumentListItem } from "@/types";

export interface DocumentSelectorPairProps {
  userDocuments: UserDocumentListItem[];
  selectedDocAId: string | null;
  selectedDocBId: string | null;
  onSelectDocA: (id: string) => void;
  onSelectDocB: (id: string) => void;
  onSwap: () => void;
  disabled?: boolean;
  className?: string;
}

export function DocumentSelectorPair({
  userDocuments,
  selectedDocAId,
  selectedDocBId,
  onSelectDocA,
  onSelectDocB,
  onSwap,
  disabled = false,
  className,
}: DocumentSelectorPairProps) {
  const readyDocs = userDocuments.filter((d) => d.status === "ready");

  return (
    <Card className={cn("border-border shadow-xs", className)} data-testid="document-selector-pair">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Document A Selector */}
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="doc-a-selector"
              className="text-xs font-semibold text-foreground flex items-center gap-1.5"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 text-[11px] font-bold">
                A
              </span>
              <span>Document A (Base Document)</span>
            </label>
            <div className="relative">
              <select
                id="doc-a-selector"
                data-testid="doc-a-select"
                value={selectedDocAId || ""}
                disabled={disabled}
                onChange={(e) => onSelectDocA(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs sm:text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground"
              >
                <option value="">— Select base document —</option>
                {userDocuments.map((doc) => {
                  const isReady = doc.status === "ready";
                  const isSameAsB = selectedDocBId === doc.id;
                  const label = `${doc.title || doc.originalFilename || "Untitled"}${
                    doc.documentType ? ` (${doc.documentType})` : ""
                  }${!isReady ? ` [${doc.status}]` : ""}${isSameAsB ? " [Selected as B]" : ""}`;

                  return (
                    <option
                      key={doc.id}
                      value={doc.id}
                      disabled={!isReady || isSameAsB}
                    >
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Swap Button */}
          <div className="self-center pt-2 lg:pt-5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              data-testid="swap-docs-btn"
              onClick={onSwap}
              disabled={disabled || !selectedDocAId || !selectedDocBId}
              title="Swap Document A and Document B"
              aria-label="Swap Document A and Document B"
              className="h-9 w-9 shrink-0 rounded-full"
            >
              <ArrowLeftRight size={15} aria-hidden="true" />
            </Button>
          </div>

          {/* Document B Selector */}
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="doc-b-selector"
              className="text-xs font-semibold text-foreground flex items-center gap-1.5"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 text-[11px] font-bold">
                B
              </span>
              <span>Document B (Comparison Document)</span>
            </label>
            <div className="relative">
              <select
                id="doc-b-selector"
                data-testid="doc-b-select"
                value={selectedDocBId || ""}
                disabled={disabled}
                onChange={(e) => onSelectDocB(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs sm:text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground"
              >
                <option value="">— Select comparison document —</option>
                {userDocuments.map((doc) => {
                  const isReady = doc.status === "ready";
                  const isSameAsA = selectedDocAId === doc.id;
                  const label = `${doc.title || doc.originalFilename || "Untitled"}${
                    doc.documentType ? ` (${doc.documentType})` : ""
                  }${!isReady ? ` [${doc.status}]` : ""}${isSameAsA ? " [Selected as A]" : ""}`;

                  return (
                    <option
                      key={doc.id}
                      value={doc.id}
                      disabled={!isReady || isSameAsA}
                    >
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {readyDocs.length < 2 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2.5">
            Note: You have {readyDocs.length} ready document{readyDocs.length === 1 ? "" : "s"}. At least two processed documents are needed for side-by-side comparison.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

