CREATE INDEX IF NOT EXISTS "idx_document_chunks_document_id" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_chunks_section_id" ON "document_chunks" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_sections_document_id" ON "document_sections" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_sections_order_index" ON "document_sections" USING btree ("document_id","order_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_user_id" ON "document" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_status" ON "document" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_created_at" ON "document" USING btree ("created_at");