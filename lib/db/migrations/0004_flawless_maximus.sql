CREATE TABLE IF NOT EXISTS "document_findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"section_id" uuid,
	"chunk_id" uuid,
	"finding_type" text NOT NULL,
	"importance" text NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"source_text" text,
	"page_number" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "document_type" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "parties" jsonb;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_findings" ADD CONSTRAINT "document_findings_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_findings" ADD CONSTRAINT "document_findings_section_id_document_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."document_sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_findings" ADD CONSTRAINT "document_findings_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_findings_document_id" ON "document_findings" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_findings_finding_type" ON "document_findings" USING btree ("finding_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_findings_importance" ON "document_findings" USING btree ("importance");