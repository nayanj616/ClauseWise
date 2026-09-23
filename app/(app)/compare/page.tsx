import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { listUserDocuments } from "@/lib/services/document-service";
import { compareDocuments } from "@/lib/services/comparison-service";
import { ComparisonWorkspace } from "@/components/compare/ComparisonWorkspace";
import type { DocumentComparisonResult } from "@/types";

export const metadata: Metadata = {
  title: "Compare Documents — ClauseWise",
  description: "Objective side-by-side comparison of legal documents with verified evidence references.",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ComparePageProps {
  searchParams: Promise<{
    docA?: string;
    docB?: string;
  }>;
}

/**
 * Compare Page — Phase 9
 * Server component enforcing session authentication, loading user documents for selection,
 * and performing server-side comparison when docA and docB are supplied.
 */
export default async function ComparePage({ searchParams }: ComparePageProps) {
  const session = await requireSession();
  const { docA, docB } = await searchParams;

  const userDocuments = await listUserDocuments(session.user.id);

  let initialComparison: DocumentComparisonResult | null = null;

  if (
    docA &&
    docB &&
    UUID_REGEX.test(docA) &&
    UUID_REGEX.test(docB) &&
    docA.toLowerCase() !== docB.toLowerCase()
  ) {
    try {
      initialComparison = await compareDocuments({
        documentAId: docA,
        documentBId: docB,
        userId: session.user.id,
      });
    } catch {
      // Gracefully fall back to client workspace rendering if document is unready or access fails
      initialComparison = null;
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      <ComparisonWorkspace
        userDocuments={userDocuments}
        initialComparison={initialComparison}
        initialDocAId={docA}
        initialDocBId={docB}
      />
    </div>
  );
}
