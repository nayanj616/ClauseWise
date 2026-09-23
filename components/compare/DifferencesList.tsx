"use client";

import * as React from "react";
import { Search, Filter, Layers } from "lucide-react";
import { DifferenceCard } from "./DifferenceCard";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DifferenceType, SectionDifferenceItem } from "@/types";

export interface DifferencesListProps {
  differences: SectionDifferenceItem[];
  documentAId: string;
  documentBId: string;
  className?: string;
}

export function DifferencesList({
  differences,
  documentAId,
  documentBId,
  className,
}: DifferencesListProps) {
  const [activeFilter, setActiveFilter] = React.useState<"all" | DifferenceType>("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  // Counts by category
  const counts = React.useMemo(() => {
    let mod = 0;
    let add = 0;
    let rem = 0;
    let unc = 0;

    for (const d of differences) {
      if (d.differenceType === "modified") mod++;
      else if (d.differenceType === "added") add++;
      else if (d.differenceType === "removed") rem++;
      else if (d.differenceType === "unchanged") unc++;
    }

    return {
      all: differences.length,
      modified: mod,
      added: add,
      removed: rem,
      unchanged: unc,
    };
  }, [differences]);

  // Filtered list
  const filteredDifferences = React.useMemo(() => {
    return differences.filter((d) => {
      // Category filter
      if (activeFilter !== "all" && d.differenceType !== activeFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const inTitle = d.title.toLowerCase().includes(query);
        const inDesc = d.description.toLowerCase().includes(query);
        const inExcerptA = d.excerptA?.toLowerCase().includes(query) ?? false;
        const inExcerptB = d.excerptB?.toLowerCase().includes(query) ?? false;
        return inTitle || inDesc || inExcerptA || inExcerptB;
      }

      return true;
    });
  }, [differences, activeFilter, searchQuery]);

  return (
    <Card className={cn("border-border shadow-xs", className)} data-testid="differences-list-container">
      <CardHeader className="pb-3 border-b space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <Layers size={18} className="text-primary" aria-hidden="true" />
            <span>Clause & Section Differences</span>
          </CardTitle>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="text"
              placeholder="Search differences…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-background"
              data-testid="diff-search-input"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1" role="tablist" aria-label="Difference Categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "all"}
            data-testid="filter-tab-all"
            onClick={() => setActiveFilter("all")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 border",
              activeFilter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted/40"
            )}
          >
            <span>All</span>
            <Badge variant="secondary" className="px-1 py-0 text-[10px] h-4">
              {counts.all}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "modified"}
            data-testid="filter-tab-modified"
            onClick={() => setActiveFilter("modified")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 border",
              activeFilter === "modified"
                ? "bg-blue-600 text-white border-blue-600 dark:bg-blue-600"
                : "bg-background text-muted-foreground border-border hover:bg-muted/40"
            )}
          >
            <span>Modified</span>
            <Badge variant="secondary" className="px-1 py-0 text-[10px] h-4">
              {counts.modified}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "added"}
            data-testid="filter-tab-added"
            onClick={() => setActiveFilter("added")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 border",
              activeFilter === "added"
                ? "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-600"
                : "bg-background text-muted-foreground border-border hover:bg-muted/40"
            )}
          >
            <span>Added in B</span>
            <Badge variant="secondary" className="px-1 py-0 text-[10px] h-4">
              {counts.added}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "removed"}
            data-testid="filter-tab-removed"
            onClick={() => setActiveFilter("removed")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 border",
              activeFilter === "removed"
                ? "bg-amber-600 text-white border-amber-600 dark:bg-amber-600"
                : "bg-background text-muted-foreground border-border hover:bg-muted/40"
            )}
          >
            <span>Removed in B</span>
            <Badge variant="secondary" className="px-1 py-0 text-[10px] h-4">
              {counts.removed}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "unchanged"}
            data-testid="filter-tab-unchanged"
            onClick={() => setActiveFilter("unchanged")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 border",
              activeFilter === "unchanged"
                ? "bg-slate-700 text-white border-slate-700 dark:bg-slate-700"
                : "bg-background text-muted-foreground border-border hover:bg-muted/40"
            )}
          >
            <span>Unchanged</span>
            <Badge variant="secondary" className="px-1 py-0 text-[10px] h-4">
              {counts.unchanged}
            </Badge>
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {filteredDifferences.length === 0 ? (
          <div
            className="rounded-lg border border-dashed p-8 text-center text-muted-foreground space-y-1.5"
            data-testid="diff-empty-state"
          >
            <p className="text-sm font-semibold text-foreground">No Differences Match Your Filter</p>
            <p className="text-xs max-w-sm mx-auto">
              {searchQuery
                ? `No clauses match "${searchQuery}". Try clearing your search term.`
                : "No clauses found for the selected category."}
            </p>
          </div>
        ) : (
          <div className="space-y-4" role="list">
            {filteredDifferences.map((diff) => (
              <DifferenceCard
                key={diff.id}
                diff={diff}
                documentAId={documentAId}
                documentBId={documentBId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

