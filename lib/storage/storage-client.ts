/**
 * Supabase Storage client — ClauseWise
 *
 * SERVER-SIDE ONLY — this module uses the service role key which must
 * never be exposed to the browser.
 *
 * Usage:
 *   import { storageClient, DOCUMENTS_BUCKET } from '@/lib/storage/storage-client'
 *
 * Phase 1 will add upload/download/delete helpers on top of this client.
 * Do not implement document operations here in Phase 0.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * The private bucket where uploaded legal documents are stored.
 * Files are not publicly accessible — presigned URLs are generated
 * server-side on demand with short TTLs.
 */
export const DOCUMENTS_BUCKET = "documents" as const;

/**
 * Supabase client authenticated with the service role key.
 * Bypasses Row Level Security — all access control is enforced
 * in our application layer (document ownership checks).
 */
export const storageClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      // Disable auto-refresh — this is a server-side client, not a user session
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Convenience accessor for the documents bucket.
 * All storage operations should go through this rather than
 * constructing bucket references directly.
 */
export function getDocumentsBucket() {
  return storageClient.storage.from(DOCUMENTS_BUCKET);
}

/**
 * Custom error for storage operation failures.
 */
export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
  }
}

/**
 * Upload a document file buffer to Supabase Storage in the private documents bucket.
 * Throws StorageError if the upload fails.
 */
export async function uploadDocumentFile(
  storagePath: string,
  buffer: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const bucket = getDocumentsBucket();
  const { error } = await bucket.upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new StorageError(`Failed to upload file to storage: ${error.message}`, {
      cause: error,
    });
  }
}

/**
 * Delete a document file from the private documents bucket.
 * Used for cleanup / rollback on failed operations.
 */
export async function deleteDocumentFile(storagePath: string): Promise<void> {
  const bucket = getDocumentsBucket();
  const { error } = await bucket.remove([storagePath]);

  if (error) {
    console.error(`[storage] Failed to delete file ${storagePath}:`, error);
    throw new StorageError(`Failed to delete file from storage: ${error.message}`, {
      cause: error,
    });
  }
}

/**
 * Generate a short-lived presigned URL for secure download.
 * Files are private and never publicly accessible.
 */
export async function createSignedDocumentUrl(
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const bucket = getDocumentsBucket();
  const { data, error } = await bucket.createSignedUrl(
    storagePath,
    expiresInSeconds
  );

  if (error || !data?.signedUrl) {
    throw new StorageError(
      `Failed to create signed URL: ${error?.message ?? "unknown error"}`
    );
  }

  return data.signedUrl;
}

/**
 * Download a document file buffer from Supabase Storage from the private documents bucket.
 * Throws StorageError if the download fails.
 */
export async function downloadDocumentFile(storagePath: string): Promise<Buffer> {
  const bucket = getDocumentsBucket();
  const { data, error } = await bucket.download(storagePath);

  if (error || !data) {
    throw new StorageError(
      `Failed to download file from storage: ${error?.message ?? "File not found"}`,
      { cause: error }
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

