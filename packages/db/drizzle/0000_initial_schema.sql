CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('QUEUED', 'RUNNING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('AC', 'WA', 'CE', 'RE', 'TLE', 'MLE', 'SE');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"statement" text NOT NULL,
	"time_limit" double precision DEFAULT 2 NOT NULL,
	"memory_limit" integer DEFAULT 128000 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"input" text NOT NULL,
	"expected_output" text NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"points" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"test_case_id" uuid,
	"ordinal" integer NOT NULL,
	"verdict" "verdict" NOT NULL,
	"time" double precision,
	"memory" integer,
	"stderr" text,
	"compile_output" text
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"contest_id" uuid,
	"language" varchar(32) NOT NULL,
	"source" text NOT NULL,
	"status" "submission_status" DEFAULT 'QUEUED' NOT NULL,
	"verdict" "verdict",
	"failed_test_ordinal" integer,
	"max_time" double precision,
	"max_memory" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"judged_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_results" ADD CONSTRAINT "submission_results_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_results" ADD CONSTRAINT "submission_results_test_case_id_test_cases_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_cases_problem_ordinal_uq" ON "test_cases" USING btree ("problem_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_results_submission_ordinal_uq" ON "submission_results" USING btree ("submission_id","ordinal");--> statement-breakpoint
CREATE INDEX "submissions_contest_idx" ON "submissions" USING btree ("contest_id","problem_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "submissions_user_created_idx" ON "submissions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "submissions_user_problem_idx" ON "submissions" USING btree ("user_id","problem_id");