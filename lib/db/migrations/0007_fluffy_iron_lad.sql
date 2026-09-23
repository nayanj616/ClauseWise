CREATE TABLE IF NOT EXISTS "actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"finding_id" uuid,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "actions" ADD CONSTRAINT "actions_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "actions" ADD CONSTRAINT "actions_finding_id_document_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."document_findings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "actions" ADD CONSTRAINT "actions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_actions_user_id" ON "actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_actions_document_id" ON "actions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_actions_finding_id" ON "actions" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_actions_status" ON "actions" USING btree ("status");