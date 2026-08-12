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
 * Bez "OK" z `@sfera/shared` — to werdykt playgroundu (kod się wykonał, nie było
 * z czym porównać). Submit zawsze ma oczekiwane wyjście, więc kończy się AC albo błędem.
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
     * NULL = submit poza konkursem (ćwiczenia). Usunięcie konkursu nie kasuje
     * submitów — zostają w historii zawodnika jako zwykłe rozwiązania.
     */
    contestId: uuid("contest_id").references(() => contests.id, {
      onDelete: "set null",
    }),
    language: varchar("language", { length: 32 }).notNull(),
    source: text("source").notNull(),
    status: submissionStatus("status").notNull().default("QUEUED"),
    /** NULL dopóki ocenianie trwa. */
    verdict: verdict("verdict"),
    /** Numer testu, na którym poległo (reguła: przerywamy na pierwszym błędzie). */
    failedTestOrdinal: integer("failed_test_ordinal"),
    /** Najgorszy czas spośród testów, w sekundach. */
    maxTime: doublePrecision("max_time"),
    /** Najgorsza pamięć spośród testów, w kilobajtach. */
    maxMemory: integer("max_memory"),
    /** Komunikat błędu infrastruktury — tylko dla statusu FAILED. */
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    judgedAt: timestamp("judged_at", { withTimezone: true }),
  },
  (table) => [
    // Zapytanie leaderboardu: wszystkie submity konkursu w kolejności czasu.
    index("submissions_contest_idx").on(
      table.contestId,
      table.problemId,
      table.userId,
      table.createdAt,
    ),
    // Historia submitów użytkownika.
    index("submissions_user_created_idx").on(table.userId, table.createdAt),
    // "Czy rozwiązałem to zadanie?" na liście zadań.
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
    /** Może zniknąć, gdy admin przebuduje testy — wtedy zostaje samo `ordinal`. */
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
