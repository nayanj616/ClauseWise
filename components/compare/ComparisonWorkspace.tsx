"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GitCompare, Loader2, AlertCircle } from "lucide-react";
import { CompareDisclaimerBanner, CompareDisclaimerFooter } from "./CompareDisclaimerBanner";
import { DocumentSelectorPair } from "./DocumentSelectorPair";
import { ComparisonSummaryCard } from "./ComparisonSummaryCard";
import { MetadataDiffCard } from "./MetadataDiffCard";
import { DifferencesList } from "./DifferencesList";
import { ComparisonEmptyState, type ComparisonEmptyStateType } from "./ComparisonEmptyState";
import { cn } from "@/lib/utils";
import type {
  UserDocumentListItem,
  DocumentComparisonResult,
} from "@/types";

export interface ComparisonWorkspaceProps {
  userDocuments: UserDocumentListItem[];
  initialComparison?: DocumentComparisonResult | null;
  initialDocAId?: string;
  initialDocBId?: string;
  className?: string;
}

export function ComparisonWorkspace({
  userDocuments,
  initialComparison = null,
  initialDocAId,
  initialDocBId,
  className,
}: ComparisonWorkspaceProps) {
  const router = useRouter();

  const [selectedDocAId, setSelectedDocAId] = React.useState<string | null>(
    initialDocAId || null
  );
  const [selectedDocBId, setSelectedDocBId] = React.useState<string | null>(
    initialDocBId || null
  );
  const [comparison, setComparison] = React.useState<DocumentComparisonResult | null>(
    initialComparison
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Sync state if props change (e.g. from server navigation)
  React.useEffect(() => {
    if (initialComparison) {
      setComparison(initialComparison);
    }
  }, [initialComparison]);

  const readyDocuments = React.useMemo(
    () => userDocuments.filter((d) => d.status === "ready"),
    [userDocuments]
  );

  // Function to load comparison dynamically
  const fetchComparison = React.useCallback(
    async (docAId: string, docBId: string) => {
      if (docAId.toLowerCase() === docBId.toLowerCase()) {
        setComparison(null);
        setError("Cannot compare a document with itself. Please select two distinct documents.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/documents/compare?docA=${encodeURIComponent(docAId)}&docB=${encodeURIComponent(
            docBId
          )}`
        );
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to compare documents");
          setComparison(null);
        } else {
          setComparison(data);
          setError(null);
          // Update URL query parameters seamlessly
          router.replace(`/compare?docA=${encodeURIComponent(docAId)}&docB=${encodeURIComponent(docBId)}`);
        }
      } catch (err) {
        console.error("Comparison fetch failed:", err);
        setError("Failed to load comparison due to a network or server error.");
        setComparison(null);
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  // Handle Document A selection
  const handleSelectDocA = (newDocAId: string) => {
    setSelectedDocAId(newDocAId || null);
    if (newDocAId && selectedDocBId) {
      fetchComparison(newDocAId, selectedDocBId);
    } else {
      setComparison(null);
      setError(null);
      if (newDocAId) {
        router.replace(`/compare?docA=${encodeURIComponent(newDocAId)}`);
      }
    }
  };

  // Handle Document B selection
  const handleSelectDocB = (newDocBId: string) => {
    setSelectedDocBId(newDocBId || null);
    if (selectedDocAId && newDocBId) {
      fetchComparison(selectedDocAId, newDocBId);
    } else {
      setComparison(null);
      setError(null);
      if (newDocBId) {
        router.replace(`/compare?docB=${encodeURIComponent(newDocBId)}`);
      }
    }
  };

  // Handle Swap Document A and B
  const handleSwap = () => {
    if (!selectedDocAId || !selectedDocBId) return;
    const tempA = selectedDocAId;
    const tempB = selectedDocBId;
    setSelectedDocAId(tempB);
    setSelectedDocBId(tempA);
    fetchComparison(tempB, tempA);
  };

  // Determine empty/error state when no comparison result is available
  let emptyStateType: ComparisonEmptyStateType | null = null;
  if (readyDocuments.length < 2) {
    emptyStateType = "fewer_than_two_docs";
  } else if (selectedDocAId && selectedDocBId && selectedDocAId === selectedDocBId) {
    emptyStateType = "identical_selection";
  } else if (!selectedDocAId || !selectedDocBId) {
    emptyStateType = "no_selection";
  }

  return (
    <div
      className={cn("space-y-6 max-w-6xl mx-auto w-full", className)}
      data-testid="comparison-workspace"
    >
      {/* Page Title & Intro */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <GitCompare size={26} className="text-primary" aria-hidden="true" />
          <span>Compare Documents</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Identify objective differences, wording changes, and added/removed clauses side by side.
        </p>
      </div>

      {/* Legal & Non-Lawyer Disclaimer Banner */}
      <CompareDisclaimerBanner />

      {/* Document Selector Controls */}
      <DocumentSelectorPair
        userDocuments={userDocuments}
        selectedDocAId={selectedDocAId}
        selectedDocBId={selectedDocBId}
        onSelectDocA={handleSelectDocA}
        onSelectDocB={handleSelectDocB}
        onSwap={handleSwap}
        disabled={isLoading}
      />

      {/* Loading Indicator */}
      {isLoading && (
        <div
          className="rounded-lg border border-dashed p-12 text-center text-muted-foreground space-y-3"
          data-testid="compare-loading-state"
        >
          <Loader2 size={28} className="animate-spin text-primary mx-auto" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Aligning and comparing document clauses…</p>
        </div>
      )}

      {/* Error Alert */}
      {!isLoading && error && (
        <div
          className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-xs sm:text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2.5"
          data-testid="compare-error-alert"
        >
          <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Comparison View (when comparison result is ready) */}
      {!isLoading && comparison && (
        <div className="space-y-6 animate-fade-in" data-testid="comparison-results">
          {/* Summary Overview */}
          <ComparisonSummaryCard comparison={comparison} />

          {/* Metadata Comparison */}
          {comparison.metadataDifferences.length > 0 && (
            <MetadataDiffCard metadataDifferences={comparison.metadataDifferences} />
          )}

          {/* Section Differences List */}
          <DifferencesList
            differences={comparison.differences}
            documentAId={comparison.documentA.id}
            documentBId={comparison.documentB.id}
          />
        </div>
      )}

      {/* Empty States (when no comparison is displayed) */}
      {!isLoading && !comparison && !error && emptyStateType && (
        <ComparisonEmptyState type={emptyStateType} />
      )}

      {/* Non-Lawyer Footer Disclaimer */}
      <CompareDisclaimerFooter />
    </div>
  );
}

