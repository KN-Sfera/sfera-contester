CREATE TABLE "problem_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_sets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "problem_set_items" ADD CONSTRAINT "problem_set_items_set_id_problem_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."problem_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_set_items" ADD CONSTRAINT "problem_set_items_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_sets" ADD CONSTRAINT "problem_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "problem_set_items_set_problem_uq" ON "problem_set_items" USING btree ("set_id","problem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_set_items_set_position_uq" ON "problem_set_items" USING btree ("set_id","position");