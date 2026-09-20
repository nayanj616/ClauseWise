CREATE TABLE IF NOT EXISTS "document_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"section_number" integer,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "page_count" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
