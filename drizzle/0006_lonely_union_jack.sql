CREATE TABLE "cheer_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_hash" text NOT NULL,
	"cheer_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cheer_clicks_user_date_unique" ON "cheer_clicks" USING btree ("user_hash","cheer_date");--> statement-breakpoint
CREATE INDEX "cheer_clicks_date_idx" ON "cheer_clicks" USING btree ("cheer_date");