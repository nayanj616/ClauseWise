"use client";

import * as React from "react";
import Link from "next/link";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RotateCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  uploadDocumentFileApi,
  validateClientUploadFile,
} from "@/lib/upload/upload-client";
import { cn } from "@/lib/utils";
import type { Document } from "@/types";

export interface DocumentUploadProps {
  onSuccess?: (document: Document) => void;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUpload({ onSuccess, className }: DocumentUploadProps) {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadedDocument, setUploadedDocument] =
    React.useState<Document | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleSelectFile = React.useCallback((file: File | null | undefined) => {
    if (!file) return;

    setError(null);
    const validation = validateClientUploadFile(file);

    if (!validation.valid) {
      setError(validation.error || "Invalid file selected.");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setSelectedFile(file);
  }, []);

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      handleSelectFile(file);
    },
    [handleSelectFile]
  );

  const handleDragOver = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isUploading) {
        setIsDragging(true);
      }
    },
    [isUploading]
  );

  const handleDragLeave = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    },
    []
  );

  const handleDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (isUploading) return;

      const file = e.dataTransfer.files?.[0];
      handleSelectFile(file);
    },
    [isUploading, handleSelectFile]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isUploading) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    },
    [isUploading]
  );

  const handleUpload = React.useCallback(async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setError(null);

    const result = await uploadDocumentFileApi(selectedFile);

    setIsUploading(false);

    if (result.success && result.document) {
      setUploadedDocument(result.document);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onSuccess?.(result.document);
    } else {
      setError(result.error || "Upload failed. Please try again.");
    }
  }, [selectedFile, isUploading, onSuccess]);

  const handleReset = React.useCallback(() => {
    setSelectedFile(null);
    setUploadedDocument(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleClearSelection = React.useCallback(() => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div
      className={cn("w-full max-w-2xl mx-auto space-y-4", className)}
      data-testid="document-upload-container"
      data-document-id={uploadedDocument?.id}
    >
      {/* Hidden native file input with accessible label */}
      <input
        ref={fileInputRef}
        id="document-file-input"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={handleInputChange}
        disabled={isUploading}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* 1. SUCCESS STATE */}
      {uploadedDocument && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-6 text-center space-y-4 animate-fade-in"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={28} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-emerald-900">
              Document uploaded successfully
            </h3>
            <p className="mt-1 text-sm text-emerald-700 font-medium">
              {uploadedDocument.title}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <Badge variant="ready">Queued for review</Badge>
              {uploadedDocument.fileSizeBytes > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({formatFileSize(uploadedDocument.fileSizeBytes)})
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="sm" className="gap-2">
              <Link href={`/documents/${uploadedDocument.id}`}>
                <ExternalLink size={14} aria-hidden="true" />
                Open in Workspace
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="gap-2"
            >
              <Upload size={14} aria-hidden="true" />
              Upload another document
            </Button>
          </div>
        </div>
      )}

      {/* 2. UPLOAD ZONE & SELECTED FILE STATE (when not in success state) */}
      {!uploadedDocument && (
        <div className="space-y-4">
          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <AlertCircle
                size={18}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div className="flex-1">
                <p className="font-medium">{error}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Please check your file and try again.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive hover:bg-destructive/20"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                <X size={14} aria-hidden="true" />
              </Button>
            </div>
          )}

          {/* Interactive dropzone (idle or error state) */}
          {!selectedFile && (
            <div
              role="button"
              tabIndex={isUploading ? -1 : 0}
              aria-label="Upload document file. PDF or DOCX up to 10 MB. Press Enter or Space to choose a file, or drag and drop here."
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onKeyDown={handleKeyDown}
              onClick={() => {
                if (!isUploading) {
                  fileInputRef.current?.click();
                }
              }}
              className={cn(
                "group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 sm:p-12 text-center transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                isDragging
                  ? "border-primary bg-primary/5 scale-[0.99]"
                  : "border-muted-foreground/25 hover:border-primary/60 hover:bg-muted/40",
                isUploading && "pointer-events-none opacity-60"
              )}
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
                <Upload size={24} aria-hidden="true" />
              </div>

              <Label
                htmlFor="document-file-input"
                className="cursor-pointer text-base font-medium text-foreground"
              >
                Choose a document or drag & drop
              </Label>

              <p className="mt-1.5 text-xs text-muted-foreground">
                Supported formats:{" "}
                <strong className="font-semibold text-foreground">PDF</strong> or{" "}
                <strong className="font-semibold text-foreground">DOCX</strong>
              </p>

              <div className="mt-3 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Max file size: 10 MB
                </Badge>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-6 pointer-events-none"
                tabIndex={-1}
                aria-hidden="true"
              >
                Browse files
              </Button>
            </div>
          )}

          {/* Selected File Card & Actions */}
          {selectedFile && (
            <div
              className="rounded-xl border bg-card p-5 shadow-sm space-y-4"
              aria-busy={isUploading}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText size={20} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-medium text-foreground"
                      title={selectedFile.name}
                    >
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(selectedFile.size)} •{" "}
                      {selectedFile.name.toLowerCase().endsWith(".pdf")
                        ? "PDF Document"
                        : "Word Document"}
                    </p>
                  </div>
                </div>

                {!isUploading && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                    aria-label="Remove selected file"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                )}
              </div>

              {/* Upload Controls */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                {!isUploading && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change file
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={handleUpload}
                  disabled={isUploading}
                  aria-busy={isUploading}
                  className="gap-2 min-w-[140px]"
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      Uploading…
                    </>
                  ) : error ? (
                    <>
                      <RotateCw size={14} aria-hidden="true" />
                      Retry upload
                    </>
                  ) : (
                    <>
                      <Upload size={14} aria-hidden="true" />
                      Upload document
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

