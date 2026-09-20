import type { Metadata } from "next";
import { DocumentUpload } from "@/components/document/DocumentUpload";

export const metadata: Metadata = { title: "Documents" };

/**
 * Documents page — Phase 1 document upload.
 * Provides file upload and status display for legal documents.
 */
export default function DocumentsPage() {
  return (
    <div className="flex flex-col gap-8 p-8 animate-fade-in max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload PDF or DOCX legal documents to securely store and analyse them.
        </p>
      </div>

      {/* Upload Zone */}
      <section aria-labelledby="upload-section-heading">
        <h2 id="upload-section-heading" className="sr-only">
          Upload Document
        </h2>
        <DocumentUpload />
      </section>
    </div>
  );
}

