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

