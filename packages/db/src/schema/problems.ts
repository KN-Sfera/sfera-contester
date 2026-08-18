import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const problems = pgTable("problems", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  statement: text("statement").notNull(),
  /** Limit czasu CPU w sekundach — jednostka Judge0. */
  timeLimit: doublePrecision("time_limit").notNull().default(2),
  /** Memory limit in kilobytes — Judge0's unit. */
  memoryLimit: integer("memory_limit").notNull().default(128000),
  /** Non-public problems are admin-only. Contest problems wait here before the start. */
  isPublic: boolean("is_public").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const testCases = pgTable(
  "test_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    /** Judging order, counted from 1. This is what contestants see ("Test 3/20"). */
    ordinal: integer("ordinal").notNull(),
    input: text("input").notNull(),
    expectedOutput: text("expected_output").notNull(),
    isSample: boolean("is_sample").notNull().default(false),
    /** Unused under ICPC rules (0/1 per problem). Kept for a possible points-based scoring. */
    points: integer("points").notNull().default(0),
  },
  // A separate index on problem_id alone would be redundant — Postgres will use
  // the prefix of this unique index to find a problem's tests.
  (table) => [
    uniqueIndex("test_cases_problem_ordinal_uq").on(
      table.problemId,
      table.ordinal,
    ),
  ],
);

export type ProblemRow = typeof problems.$inferSelect;
export type NewProblemRow = typeof problems.$inferInsert;
export type TestCaseRow = typeof testCases.$inferSelect;
export type NewTestCaseRow = typeof testCases.$inferInsert;
