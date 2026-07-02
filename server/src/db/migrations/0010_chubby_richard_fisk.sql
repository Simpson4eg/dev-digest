ALTER TABLE "conventions" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'candidate' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;