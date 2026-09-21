import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getDocumentWorkspaceData } from "@/lib/services/document-service";
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
    description: `View extracted document clauses, sections, and metadata`,
  };
}

/**
 * Document Workspace Page — Phase 2 Slice 2.3
 * Server component loading persisted document metadata and sections.
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

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto w-full">
      <DocumentWorkspace data={data} />
    </div>
  );
}

