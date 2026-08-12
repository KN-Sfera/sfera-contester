CREATE TYPE "public"."contest_visibility" AS ENUM('PRIVATE', 'PUBLIC');--> statement-breakpoint
CREATE TABLE "clarifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_id" uuid NOT NULL,
	"problem_id" uuid,
	"asked_by" uuid,
	"question" text NOT NULL,
	"answer" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contest_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_official" boolean DEFAULT true NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contest_problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"letter" varchar(2) NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"penalty_minutes" integer DEFAULT 20 NOT NULL,
	"freeze_minutes" integer DEFAULT 60 NOT NULL,
	"compile_error_counts_as_attempt" boolean DEFAULT false NOT NULL,
	"unfrozen" boolean DEFAULT false NOT NULL,
	"visibility" "contest_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"registration_open" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contests_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_asked_by_users_id_fk" FOREIGN KEY ("asked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clarifications_contest_created_idx" ON "clarifications" USING btree ("contest_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contest_participants_contest_user_uq" ON "contest_participants" USING btree ("contest_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contest_problems_contest_problem_uq" ON "contest_problems" USING btree ("contest_id","problem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contest_problems_contest_letter_uq" ON "contest_problems" USING btree ("contest_id","letter");--> statement-breakpoint
CREATE UNIQUE INDEX "contest_problems_contest_position_uq" ON "contest_problems" USING btree ("contest_id","position");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE set null ON UPDATE no action;