import * as React from "react";
import type { DocumentWorkspaceData } from "@/types";
import { DocumentViewer } from "./DocumentViewer";
import {
  DocumentProcessingState,
  DocumentErrorState,
  EmptyContentState,
} from "./WorkspaceStates";

export interface DocumentWorkspaceProps {
  data: DocumentWorkspaceData;
  className?: string;
}

/**
 * Top-level Document Workspace component.
 * Switches strictly based on existing status model:
 * - ready with sections -> DocumentViewer
 * - ready with 0 sections -> EmptyContentState
 * - error -> DocumentErrorState
 * - all other existing statuses (queued, extracting, extracted, chunking, analyzing) -> DocumentProcessingState
 */
export function DocumentWorkspace({ data, className }: DocumentWorkspaceProps) {
  const { document, sections } = data;

  // 1. Ready state: render viewer or empty content fallback
  if (document.status === "ready") {
    if (!sections || sections.length === 0) {
      return <EmptyContentState filename={document.filename} />;
    }

    return (
      <DocumentViewer
        document={document}
        sections={sections}
        className={className}
      />
    );
  }

  // 2. Error state: render user-safe error message
  if (document.status === "error") {
    return (
      <DocumentErrorState
        filename={document.filename}
        errorMessage={document.errorMessage}
      />
    );
  }

  // 3. Processing state: any other existing status (queued, extracting, etc.)
  return (
    <DocumentProcessingState
      filename={document.filename}
      status={document.status}
    />
  );
}

