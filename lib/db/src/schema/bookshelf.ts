import { pgTable, text, integer, bigint, primaryKey, unique } from "drizzle-orm/pg-core";

export const npBooks = pgTable(
  "np_books",
  {
    id: text("id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    totalPages: integer("total_pages").notNull().default(0),
    currentPage: integer("current_page").notNull().default(0),
    coverColor: text("cover_color").notNull().default("#5C849E"),
    coverImageUri: text("cover_image_uri"),
    genre: text("genre").notNull().default(""),
    addedAt: bigint("added_at", { mode: "number" }).notNull(),
    finishedAt: bigint("finished_at", { mode: "number" }),
    favoriteQuote: text("favorite_quote"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

export const npSessions = pgTable(
  "np_sessions",
  {
    id: text("id").notNull(),
    userId: text("user_id").notNull(),
    bookId: text("book_id").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    startPage: integer("start_page").notNull().default(0),
    endPage: integer("end_page").notNull().default(0),
    date: text("date").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

export const npStreak = pgTable("np_streak", {
  userId: text("user_id").primaryKey(),
  currentStreak: integer("current_streak").notNull().default(0),
  lastReadDate: text("last_read_date").notNull().default(""),
  checkedDays: text("checked_days").notNull().default("[]"),
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(30),
  todayMinutes: integer("today_minutes").notNull().default(0),
  freezesLeft: integer("freezes_left").notNull().default(2),
});

export type NpBook = typeof npBooks.$inferSelect;
export type NpSession = typeof npSessions.$inferSelect;
export type NpStreakRow = typeof npStreak.$inferSelect;
