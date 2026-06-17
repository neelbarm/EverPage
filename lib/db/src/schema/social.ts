import { pgTable, text, integer, timestamp, primaryKey, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const npUsers = pgTable("np_users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  color: text("color").notNull().default("#1C3A5A"),
  initial: text("initial").notNull(),
  avatarUrl: text("avatar_url"),
  pushToken: text("push_token"),
  nudgesEnabled: boolean("nudges_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const npFollows = pgTable(
  "np_follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => npUsers.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => npUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
  ],
);

export const npActivity = pgTable("np_activity", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => npUsers.id, { onDelete: "cascade" }),
  bookTitle: text("book_title").notNull(),
  bookAuthor: text("book_author").notNull().default(""),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  pagesRead: integer("pages_read").notNull().default(0),
  activityType: text("activity_type").notNull().default("session"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const npNudges = pgTable("np_nudges", {
  id: text("id").primaryKey(),
  senderId: text("sender_id")
    .notNull()
    .references(() => npUsers.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => npUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNpUserSchema = createInsertSchema(npUsers).omit({ createdAt: true, updatedAt: true });
export const insertNpActivitySchema = createInsertSchema(npActivity).omit({ createdAt: true });

export type NpUser = typeof npUsers.$inferSelect;
export type InsertNpUser = z.infer<typeof insertNpUserSchema>;
export type NpActivity = typeof npActivity.$inferSelect;
export type InsertNpActivity = z.infer<typeof insertNpActivitySchema>;
