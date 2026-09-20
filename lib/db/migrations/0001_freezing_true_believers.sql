ALTER TABLE "document" ADD COLUMN "original_filename" text NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "storage_path" text NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "mime_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "file_size_bytes" integer NOT NULL;