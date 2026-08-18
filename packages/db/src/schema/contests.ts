import {
  boolean,
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
import { problems } from "./problems.js";
import { users } from "./users.js";

export const contestVisibility = pgEnum("contest_visibility", [
  "PRIVATE",
  "PUBLIC",
]);

/**
 * A contest under ICPC rules.
 *
 * There is deliberately **no** status column (upcoming / running / finished) —
 * the status follows from `starts_at` and `duration_minutes`, and storing it
 * would need a scheduled job and could drift out of step with the clock.
 */
export const contests = pgTable("contests", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  /** Penalty for a failed submission before the accepted one. ICPC: 20. */
  penaltyMinutes: integer("penalty_minutes").notNull().default(20),
  /** How long the scoreboard freezes at the end. ICPC: 60. Zero disables it. */
  freezeMinutes: integer("freeze_minutes").notNull().default(60),
  /** At the ICPC World Finals a failed compilation does not count as an attempt. */
  compileErrorCountsAsAttempt: boolean("compile_error_counts_as_attempt")
    .notNull()
    .default(false),
  /** Manual unfreeze after the contest — the moment results are announced. */
  unfrozen: boolean("unfrozen").notNull().default(false),
  visibility: contestVisibility("visibility").notNull().default("PRIVATE"),
  /** Open registration, or an admin adding contestants by hand. */
  registrationOpen: boolean("registration_open").notNull().default(false),
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

export const contestProblems = pgTable(
  "contest_problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contestId: uuid("contest_id")
      .notNull()
      .references(() => contests.id, { onDelete: "cascade" }),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    /** Litera zadania na tablicy: A, B, C… */
    letter: varchar("letter", { length: 2 }).notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("contest_problems_contest_problem_uq").on(
      table.contestId,
      table.problemId,
    ),
    uniqueIndex("contest_problems_contest_letter_uq").on(
      table.contestId,
      table.letter,
    ),
    uniqueIndex("contest_problems_contest_position_uq").on(
      table.contestId,
      table.position,
    ),
  ],
);

export const contestParticipants = pgTable(
  "contest_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contestId: uuid("contest_id")
      .notNull()
      .references(() => contests.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Unofficial entrants compete outside the contest — visible, but unranked. */
    isOfficial: boolean("is_official").notNull().default(true),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("contest_participants_contest_user_uq").on(
      table.contestId,
      table.userId,
    ),
  ],
);

/**
 * Questions about problems, and announcements from the judges.
 *
 * `asked_by = NULL` marks an admin announcement to everyone, not a question.
 * `problem_id = NULL` means it concerns the whole contest.
 */
export const clarifications = pgTable(
  "clarifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contestId: uuid("contest_id")
      .notNull()
      .references(() => contests.id, { onDelete: "cascade" }),
    problemId: uuid("problem_id").references(() => problems.id, {
      onDelete: "set null",
    }),
    askedBy: uuid("asked_by").references(() => users.id, {
      onDelete: "set null",
    }),
    question: text("question").notNull(),
    answer: text("answer"),
    /** An answer visible to everyone, not only to whoever asked. */
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [
    index("clarifications_contest_created_idx").on(
      table.contestId,
      table.createdAt,
    ),
  ],
);

export type ContestRow = typeof contests.$inferSelect;
export type NewContestRow = typeof contests.$inferInsert;
export type ContestProblemRow = typeof contestProblems.$inferSelect;
export type ContestParticipantRow = typeof contestParticipants.$inferSelect;
export type ClarificationRow = typeof clarifications.$inferSelect;
