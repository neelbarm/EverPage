import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const npMarginNotes = pgTable("np_margin_notes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  bookTitle: text("book_title").notNull(),
  bookAuthor: text("book_author").notNull().default(""),
  page: integer("page").notNull(),
  noteText: text("note_text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const npRooms = pgTable("np_rooms", {
  id: text("id").primaryKey(),
  bookTitle: text("book_title").notNull(),
  bookAuthor: text("book_author").notNull().default(""),
  createdBy: text("created_by").notNull(),
  weeklyTargetPages: integer("weekly_target_pages").notNull().default(50),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const npRoomMembers = pgTable(
  "np_room_members",
  {
    roomId: text("room_id").notNull(),
    userId: text("user_id").notNull(),
    currentPage: integer("current_page").notNull().default(0),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] })],
);

export const npRoomMessages = pgTable("np_room_messages", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  userId: text("user_id").notNull(),
  body: text("body").notNull(),
  spoilerUpToPage: integer("spoiler_up_to_page").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
