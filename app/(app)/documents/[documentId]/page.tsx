import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getDocumentWorkspaceData } from "@/lib/services/document-service";
import { getPersistedDocumentFindings } from "@/lib/services/intelligence-service";
import { DocumentWorkspace } from "@/components/workspace/DocumentWorkspace";
import { DocumentNotFoundState } from "@/components/workspace/WorkspaceStates";

interface DocumentWorkspacePageProps {
  params: Promise<{ documentId: string }>;
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
 * Document Workspace Page — Phase 3 Slice 3.6
 * Server component loading persisted document metadata, sections, and findings.
 * Enforces ownership strictly by session.user.id.
 */
export default async function DocumentWorkspacePage({
  params,
}: DocumentWorkspacePageProps) {
  const session = await requireSession();
  const { documentId } = await params;

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <DocumentWorkspace data={data} findings={findings} />
    </div>
  );
}

