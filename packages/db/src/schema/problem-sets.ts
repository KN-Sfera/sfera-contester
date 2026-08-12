import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { problems } from "./problems.js";
import { users } from "./users.js";

/** Kolekcja zadań: ścieżka nauki, archiwum konkursu, zestaw ćwiczeń. */
export const problemSets = pgTable("problem_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
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

export const problemSetItems = pgTable(
  "problem_set_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setId: uuid("set_id")
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    /** Kolejność w zestawie, liczona od 1. */
    position: integer("position").notNull(),
  },
  (table) => [
    // Zadanie może należeć do wielu zestawów, ale w jednym tylko raz.
    uniqueIndex("problem_set_items_set_problem_uq").on(
      table.setId,
      table.problemId,
    ),
    uniqueIndex("problem_set_items_set_position_uq").on(
      table.setId,
      table.position,
    ),
  ],
);

export type ProblemSetRow = typeof problemSets.$inferSelect;
export type NewProblemSetRow = typeof problemSets.$inferInsert;
export type ProblemSetItemRow = typeof problemSetItems.$inferSelect;
