import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { npBooks, npSessions, npStreak } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id as string;
}

router.get("/bookshelf", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [books, sessions, streakRows] = await Promise.all([
    db.select().from(npBooks).where(eq(npBooks.userId, userId)),
    db.select().from(npSessions).where(eq(npSessions.userId, userId)),
    db.select().from(npStreak).where(eq(npStreak.userId, userId)).limit(1),
  ]);

  const streak = streakRows[0]
    ? {
        currentStreak: streakRows[0].currentStreak,
        lastReadDate: streakRows[0].lastReadDate,
        checkedDays: JSON.parse(streakRows[0].checkedDays) as string[],
        dailyGoalMinutes: streakRows[0].dailyGoalMinutes,
        todayMinutes: streakRows[0].todayMinutes,
        freezesLeft: streakRows[0].freezesLeft,
      }
    : null;

  res.json({ books, sessions, streak });
});

router.post("/bookshelf/books", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id, title, author, totalPages, currentPage, coverColor, coverImageUri, genre, addedAt, finishedAt, favoriteQuote } = req.body ?? {};

  if (!id || !title) {
    res.status(400).json({ error: "id and title required" });
    return;
  }

  const values = {
    id,
    userId,
    title,
    author: author ?? "",
    totalPages: totalPages ?? 0,
    currentPage: currentPage ?? 0,
    coverColor: coverColor ?? "#5C849E",
    coverImageUri: coverImageUri ?? null,
    genre: genre ?? "",
    addedAt: addedAt ?? Date.now(),
    finishedAt: finishedAt ?? null,
    favoriteQuote: favoriteQuote ?? null,
  };

  const rows = await db
    .insert(npBooks)
    .values(values)
    .onConflictDoUpdate({
      target: [npBooks.userId, npBooks.id],
      set: {
        title: values.title,
        author: values.author,
        totalPages: values.totalPages,
        currentPage: values.currentPage,
        coverColor: values.coverColor,
        coverImageUri: values.coverImageUri,
        genre: values.genre,
        finishedAt: values.finishedAt,
        favoriteQuote: values.favoriteQuote,
      },
    })
    .returning();

  res.status(201).json(rows[0]);
});

router.delete("/bookshelf/books/:id", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  await db
    .delete(npBooks)
    .where(and(eq(npBooks.id, req.params.id), eq(npBooks.userId, userId)));

  res.json({ ok: true });
});

router.post("/bookshelf/sessions", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id, bookId, durationMinutes, startPage, endPage, date, createdAt } = req.body ?? {};

  if (!id || !bookId || !date) {
    res.status(400).json({ error: "id, bookId, and date required" });
    return;
  }

  const values = {
    id,
    userId,
    bookId,
    durationMinutes: durationMinutes ?? 0,
    startPage: startPage ?? 0,
    endPage: endPage ?? 0,
    date,
    createdAt: createdAt ?? Date.now(),
  };

  const rows = await db
    .insert(npSessions)
    .values(values)
    .onConflictDoNothing()
    .returning();

  res.status(201).json(rows[0] ?? values);
});

router.put("/bookshelf/streak", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { currentStreak, lastReadDate, checkedDays, dailyGoalMinutes, todayMinutes, freezesLeft } = req.body ?? {};

  const values = {
    userId,
    currentStreak: currentStreak ?? 0,
    lastReadDate: lastReadDate ?? "",
    checkedDays: JSON.stringify(checkedDays ?? []),
    dailyGoalMinutes: dailyGoalMinutes ?? 30,
    todayMinutes: todayMinutes ?? 0,
    freezesLeft: freezesLeft ?? 2,
  };

  const rows = await db
    .insert(npStreak)
    .values(values)
    .onConflictDoUpdate({
      target: npStreak.userId,
      set: {
        currentStreak: values.currentStreak,
        lastReadDate: values.lastReadDate,
        checkedDays: values.checkedDays,
        dailyGoalMinutes: values.dailyGoalMinutes,
        todayMinutes: values.todayMinutes,
        freezesLeft: values.freezesLeft,
      },
    })
    .returning();

  res.json(rows[0]);
});

export default router;
