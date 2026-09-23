"use client";

import * as React from "react";
import { Scale, AlertCircle, Check } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MetadataDifference } from "@/types";

export interface MetadataDiffCardProps {
  metadataDifferences: MetadataDifference[];
  className?: string;
}

export function MetadataDiffCard({
  metadataDifferences,
  className,
}: MetadataDiffCardProps) {
  const diffCount = metadataDifferences.filter((m) => m.isDifferent).length;

  return (
    <Card className={cn("border-border shadow-xs", className)} data-testid="metadata-diff-card">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <Scale size={18} className="text-primary" aria-hidden="true" />
            <span>Document Profile & Legal Metadata</span>
          </CardTitle>
          <Badge
            variant={diffCount > 0 ? "outline" : "secondary"}
            className={cn(
              "text-xs font-semibold px-2 py-0.5",
              diffCount > 0
                ? "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300"
                : "text-muted-foreground"
            )}
          >
            {diffCount > 0
              ? `${diffCount} metadata difference${diffCount === 1 ? "" : "s"}`
              : "Metadata matches"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b text-muted-foreground uppercase text-[10px] tracking-wider">
                <th scope="col" className="pb-2 font-semibold w-1/4">Metadata Property</th>
                <th scope="col" className="pb-2 font-semibold w-5/12">Document A (Base)</th>
                <th scope="col" className="pb-2 font-semibold w-5/12">Document B (Comparison)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {metadataDifferences.map((row) => (
                <tr
                  key={row.field}
                  className={cn(
                    "transition-colors",
                    row.isDifferent
                      ? "bg-amber-50/40 dark:bg-amber-950/20"
                      : "hover:bg-muted/30"
                  )}
                  data-testid={`meta-row-${row.field}`}
                >
                  <td className="py-2.5 pr-2 font-medium text-foreground flex items-center gap-1.5">
                    {row.isDifferent ? (
                      <span className="flex h-2 w-2 rounded-full bg-amber-500 shrink-0" title="Different" />
                    ) : (
                      <span className="flex h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" title="Identical" />
                    )}
                    <span>{row.label}</span>
                  </td>
                  <td className="py-2.5 px-2 text-foreground/90 font-mono text-[11px] break-words">
                    {row.valueA || (
                      <span className="text-muted-foreground italic font-sans">Not specified</span>
                    )}
                  </td>
                  <td className="py-2.5 pl-2 text-foreground/90 font-mono text-[11px] break-words">
                    {row.valueB || (
                      <span className="text-muted-foreground italic font-sans">Not specified</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

