import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { listUserDocuments } from "@/lib/services/document-service";
import { DocumentUpload } from "@/components/document/DocumentUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  FileText,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "@/types";

export const metadata: Metadata = {
  title: "Documents — ClauseWise",
  description: "Securely upload and manage legal documents with automated intelligence and extraction.",
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  nda: "Non-Disclosure Agreement",
  employment_agreement: "Employment Agreement",
  lease_agreement: "Lease Agreement",
  service_agreement: "Service Agreement",
  commercial_contract: "Commercial Contract",
  general: "General Contract",
};

function formatDocType(typeKey?: string | null): string {
  if (!typeKey || !typeKey.trim()) return "General Contract";
  const clean = typeKey.trim().toLowerCase();
  return DOCUMENT_TYPE_LABELS[clean] || clean.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStatusBadge(status: DocumentStatus) {
  const label = DOCUMENT_STATUS_LABELS[status] || status;
  if (status === "ready") {
    return (
      <Badge variant="ready" className="gap-1 py-0.5 text-xs">
        <CheckCircle2 size={12} aria-hidden="true" />
        <span>{label}</span>
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1 py-0.5 text-xs">
        <AlertCircle size={12} aria-hidden="true" />
        <span>{label}</span>
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 py-0.5 text-xs text-muted-foreground animate-pulse">
      <Clock size={12} aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}

/**
 * Documents page — Phase 10 integration.
 * Combines secure document upload dropzone with the user's persisted document library.
 * Strictly scopes data to authenticated session.user.id via domain service.
 */
export default async function DocumentsPage() {
  const session = await requireSession();
  const userDocuments = await listUserDocuments(session.user.id);

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6 lg:p-8 animate-fade-in max-w-7xl w-full mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Documents
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload PDF or DOCX legal documents to securely extract clauses and analyze obligations.
        </p>
      </div>

      {/* Upload Zone Section */}
      <section aria-labelledby="upload-section-heading">
        <h2 id="upload-section-heading" className="sr-only">
          Upload Document
        </h2>
        <DocumentUpload />
      </section>

      {/* Document Library Section */}
      <section aria-labelledby="library-heading" className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="space-y-0.5">
            <h2 id="library-heading" className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <FolderOpen size={18} className="text-primary" aria-hidden="true" />
              <span>Your Documents</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              All legal agreements associated with your account.
            </p>
          </div>

          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            {userDocuments.length} {userDocuments.length === 1 ? "document" : "documents"}
          </span>
        </div>

        {/* Empty State */}
        {userDocuments.length === 0 ? (
          <div
            className="rounded-xl border border-dashed bg-card p-8 text-center space-y-3"
            data-testid="documents-empty-state"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileText size={24} aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              No documents uploaded yet
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Upload your first contract, non-disclosure agreement, or service agreement above. Once processed, it will appear here with full intelligence and action navigation.
            </p>
          </div>
        ) : (
          /* Populated Document Library Table */
          <div className="rounded-xl border bg-card shadow-xs overflow-hidden" data-testid="documents-table-container">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" aria-label="Uploaded documents">
                <thead className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 sm:px-6">Document</th>
                    <th scope="col" className="px-4 py-3 hidden sm:table-cell">Type</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 hidden md:table-cell">Pages</th>
                    <th scope="col" className="px-4 py-3 hidden lg:table-cell">Uploaded</th>
                    <th scope="col" className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {userDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      className="hover:bg-muted/30 transition-colors"
                      data-testid={`document-row-${doc.id}`}
                    >
                      <td className="px-4 py-3.5 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <FileText size={18} aria-hidden="true" />
                          </div>
                          <div className="min-w-0 max-w-xs sm:max-w-md">
                            <Link
                              href={`/documents/${doc.id}`}
                              className="font-semibold text-foreground hover:text-primary hover:underline truncate block"
                              title={doc.title}
                            >
                              {doc.title}
                            </Link>
                            {doc.originalFilename && doc.originalFilename !== doc.title && (
                              <p className="text-xs text-muted-foreground truncate" title={doc.originalFilename}>
                                {doc.originalFilename}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 hidden sm:table-cell text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-normal text-[11px]">
                          {formatDocType(doc.documentType)}
                        </Badge>
                      </td>

                      <td className="px-4 py-3.5">
                        {getStatusBadge(doc.status)}
                      </td>

                      <td className="px-4 py-3.5 hidden md:table-cell text-xs text-muted-foreground font-mono">
                        {typeof doc.pageCount === "number" && doc.pageCount > 0
                          ? `${doc.pageCount} ${doc.pageCount === 1 ? "page" : "pages"}`
                          : "—"}
                      </td>

                      <td className="px-4 py-3.5 hidden lg:table-cell text-xs text-muted-foreground">
                        {formatDate(doc.createdAt)}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          data-testid={`open-workspace-btn-${doc.id}`}
                        >
                          <Link href={`/documents/${doc.id}`}>
                            <span>Open</span>
                            <ArrowRight size={13} aria-hidden="true" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
