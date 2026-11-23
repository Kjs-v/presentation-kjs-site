ALTER TABLE "notes" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_client_id_unique" UNIQUE("client_id");