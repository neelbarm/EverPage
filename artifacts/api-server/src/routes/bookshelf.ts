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
  const requestedToday = typeof req.query.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today)
    ? req.query.today
    : null;

  const [books, sessions, streakRows] = await Promise.all([
    db.select().from(npBooks).where(eq(npBooks.userId, userId)),
    db.select().from(npSessions).where(eq(npSessions.userId, userId)),
    db.select().from(npStreak).where(eq(npStreak.userId, userId)).limit(1),
  ]);

  // A daily total is derived from durable session records, never trusted from
  // the cached np_streak column. The client supplies its local calendar day so
  // readers near midnight are not forced into the server's timezone.
  const todayMinutes = requestedToday
    ? sessions.reduce((total, session) => session.date === requestedToday ? total + Math.max(0, session.durationMinutes) : total, 0)
    : (streakRows[0]?.todayMinutes ?? 0);
  const streak = streakRows[0]
    ? {
        currentStreak: streakRows[0].currentStreak,
        lastReadDate: streakRows[0].lastReadDate,
        checkedDays: JSON.parse(streakRows[0].checkedDays) as string[],
        dailyGoalMinutes: streakRows[0].dailyGoalMinutes,
        todayMinutes,
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

  const { currentStreak, lastReadDate, checkedDays, dailyGoalMinutes, todayDate, todayMinutes: legacyTodayMinutes, freezesLeft } = req.body ?? {};
  const requestedToday = typeof todayDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(todayDate)
    ? todayDate
    : null;
  const todaySessions = requestedToday
    ? await db.select({ durationMinutes: npSessions.durationMinutes }).from(npSessions).where(and(eq(npSessions.userId, userId), eq(npSessions.date, requestedToday)))
    : [];
  const todayMinutes = requestedToday
    ? todaySessions.reduce((total, session) => total + Math.max(0, session.durationMinutes), 0)
    : (typeof legacyTodayMinutes === "number" ? legacyTodayMinutes : 0);

  const values = {
    userId,
    currentStreak: currentStreak ?? 0,
    lastReadDate: lastReadDate ?? "",
    checkedDays: JSON.stringify(checkedDays ?? []),
    dailyGoalMinutes: dailyGoalMinutes ?? 30,
    todayMinutes,
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
