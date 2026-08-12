import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["USER", "ADMIN"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Trzymany zawsze małymi literami — normalizacja przy zapisie, nie przy odczycie.
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  role: userRole("role").notNull().default("USER"),
  /**
   * Licznik unieważniający sesje. Token nosi swoją wersję; podbicie tej kolumny
   * (wylogowanie ze wszystkich urządzeń, zmiana hasła) natychmiast unieważnia
   * wszystkie wcześniej wydane tokeny bez trzymania ich listy.
   */
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
