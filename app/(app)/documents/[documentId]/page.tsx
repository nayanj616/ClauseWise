import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getDocumentWorkspaceData } from "@/lib/services/document-service";
import { getPersistedDocumentFindings } from "@/lib/services/intelligence-service";
import { getProfessionalPrepData } from "@/lib/services/preparation-service";
import { DocumentWorkspace } from "@/components/workspace/DocumentWorkspace";
import { DocumentNotFoundState } from "@/components/workspace/WorkspaceStates";

interface DocumentWorkspacePageProps {
  params: Promise<{ documentId: string }>;
  searchParams?: Promise<{
    findingId?: string;
    sectionId?: string;
    tab?: "analysis" | "document" | "ask" | "prep";
  }>;
}

export async function generateMetadata({
  params,
}: DocumentWorkspacePageProps): Promise<Metadata> {
  const { documentId } = await params;
  return {
    title: `Document Workspace`,
    description: `View extracted document clauses, sections, and intelligence analysis`,
  };
}

/**
 * Document Workspace Page — Phase 3 Slice 3.6 / Phase 8 Professional Prep
 * Server component loading persisted document metadata, sections, findings, and prep briefing.
 * Enforces ownership strictly by session.user.id.
 */
export default async function DocumentWorkspacePage({
  params,
  searchParams,
}: DocumentWorkspacePageProps) {
  const session = await requireSession();
  const { documentId } = await params;
  const sp = searchParams ? await searchParams : undefined;

  // Retrieve workspace data strictly scoped to authenticated user
  const data = await getDocumentWorkspaceData(documentId, session.user.id);

  if (!data) {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto w-full">
        <DocumentNotFoundState />
      </div>
    );
  }

  // Retrieve persisted findings for this document
  const findings = await getPersistedDocumentFindings(documentId);

  // Retrieve professional prep briefing data server-side
  let prepData = null;
  try {
    prepData = await getProfessionalPrepData(documentId, session.user.id);
  } catch (err) {
    console.error(
      `[DocumentWorkspacePage] Prep data retrieval error for ${documentId}:`,
      err
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <DocumentWorkspace
        data={data}
        findings={findings}
        initialFindingId={sp?.findingId}
        initialSectionId={sp?.sectionId}
        initialTab={sp?.tab}
        initialPrepData={prepData}
      />
    </div>
  );
}

