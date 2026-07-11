CREATE TABLE "pr_brief_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"pr_id" uuid NOT NULL,
	"brief" jsonb NOT NULL,
	"built_head_sha" text NOT NULL,
	"input_tokens" integer,
	"source" text DEFAULT 'fresh' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pr_brief_cache" ADD CONSTRAINT "pr_brief_cache_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_brief_cache" ADD CONSTRAINT "pr_brief_cache_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pr_brief_cache_ws_pr_uq" ON "pr_brief_cache" USING btree ("workspace_id","pr_id");