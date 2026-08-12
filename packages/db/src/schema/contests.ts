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
 * Konkurs w regułach ICPC.
 *
 * Świadomie **nie** ma kolumny ze statusem (przed startem / trwa / zakończony) —
 * status wynika z `starts_at` i `duration_minutes`, a przechowywany wymagałby
 * zadania cyklicznego i potrafiłby się rozjechać z zegarem.
 */
export const contests = pgTable("contests", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  /** Kara za błędny submit przed zaliczeniem. ICPC: 20. */
  penaltyMinutes: integer("penalty_minutes").notNull().default(20),
  /** Długość zamrożenia tablicy na końcu. ICPC: 60. Zero wyłącza freeze. */
  freezeMinutes: integer("freeze_minutes").notNull().default(60),
  /** Na ICPC World Finals nieudana kompilacja nie liczy się jako próba. */
  compileErrorCountsAsAttempt: boolean("compile_error_counts_as_attempt")
    .notNull()
    .default(false),
  /** Ręczne odmrożenie tablicy po zakończeniu — moment ogłoszenia wyników. */
  unfrozen: boolean("unfrozen").notNull().default(false),
  visibility: contestVisibility("visibility").notNull().default("PRIVATE"),
  /** Otwarta rejestracja czy admin dopisuje zawodników ręcznie. */
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
    /** Nieoficjalni startują poza konkursem — widoczni, ale poza rankingiem. */
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
 * Pytania do zadań i ogłoszenia sędziów.
 *
 * `asked_by = NULL` oznacza ogłoszenie od admina do wszystkich, a nie pytanie.
 * `problem_id = NULL` — sprawa dotyczy całego konkursu.
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
    /** Odpowiedź widoczna dla wszystkich, nie tylko dla pytającego. */
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
