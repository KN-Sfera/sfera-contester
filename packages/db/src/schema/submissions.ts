import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { contests } from "./contests.js";
import { problems, testCases } from "./problems.js";
import { users } from "./users.js";

export const submissionStatus = pgEnum("submission_status", [
  "QUEUED",
  "RUNNING",
  "DONE",
  "FAILED",
]);

/**
 * Without "OK" from `@sfera/shared` — that is the playground verdict (the code
 * ran, there was nothing to compare against). A submission always has expected
 * output, so it ends in AC or in a failure.
 */
export const verdict = pgEnum("verdict", [
  "AC",
  "WA",
  "CE",
  "RE",
  "TLE",
  "MLE",
  "SE",
]);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    /**
     * NULL = a submission outside any contest (practice). Deleting a contest
     * does not delete submissions — they stay in the contestant's history as
     * ordinary solutions.
     */
    contestId: uuid("contest_id").references(() => contests.id, {
      onDelete: "set null",
    }),
    language: varchar("language", { length: 32 }).notNull(),
    source: text("source").notNull(),
    status: submissionStatus("status").notNull().default("QUEUED"),
    /** NULL while judging is still running. */
    verdict: verdict("verdict"),
    /** The test it failed on (rule: we stop at the first failure). */
    failedTestOrdinal: integer("failed_test_ordinal"),
    /** The worst time across the tests, in seconds. */
    maxTime: doublePrecision("max_time"),
    /** The worst memory across the tests, in kilobytes. */
    maxMemory: integer("max_memory"),
    /** An infrastructure error message — only for the FAILED status. */
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    judgedAt: timestamp("judged_at", { withTimezone: true }),
  },
  (table) => [
    // The leaderboard query: every contest submission in time order.
    index("submissions_contest_idx").on(
      table.contestId,
      table.problemId,
      table.userId,
      table.createdAt,
    ),
    // A user's submission history.
    index("submissions_user_created_idx").on(table.userId, table.createdAt),
    // "Have I solved this problem?" on the problem list.
    index("submissions_user_problem_idx").on(table.userId, table.problemId),
  ],
);

export const submissionResults = pgTable(
  "submission_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    /** May vanish when an admin rebuilds the tests — then only `ordinal` remains. */
    testCaseId: uuid("test_case_id").references(() => testCases.id, {
      onDelete: "set null",
    }),
    ordinal: integer("ordinal").notNull(),
    verdict: verdict("verdict").notNull(),
    time: doublePrecision("time"),
    memory: integer("memory"),
    stderr: text("stderr"),
    compileOutput: text("compile_output"),
  },
  (table) => [
    uniqueIndex("submission_results_submission_ordinal_uq").on(
      table.submissionId,
      table.ordinal,
    ),
  ],
);

export type SubmissionRow = typeof submissions.$inferSelect;
export type NewSubmissionRow = typeof submissions.$inferInsert;
export type SubmissionResultRow = typeof submissionResults.$inferSelect;
export type NewSubmissionResultRow = typeof submissionResults.$inferInsert;
