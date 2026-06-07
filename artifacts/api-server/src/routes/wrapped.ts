import { Router } from "express";
import { db, npSessions, npBooks, npStreak } from "@workspace/db";
import { and, eq, gte, lt, sql } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id as string;
}

router.get("/wrapped/:year", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const year = parseInt(req.params.year, 10);
  if (isNaN(year) || year < 2020 || year > 2100) {
    res.status(400).json({ error: "Invalid year" });
    return;
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const yearStartMs = new Date(yearStart).getTime();
  const yearEndMs = new Date(yearEnd).getTime();

  const [sessions, finishedBooks, streakRows, allUserMinutes] = await Promise.all([
    db
      .select()
      .from(npSessions)
      .where(and(eq(npSessions.userId, userId), gte(npSessions.date, yearStart), lt(npSessions.date, yearEnd))),

    db
      .select()
      .from(npBooks)
      .where(and(eq(npBooks.userId, userId), gte(npBooks.finishedAt, yearStartMs), lt(npBooks.finishedAt, yearEndMs))),

    db.select().from(npStreak).where(eq(npStreak.userId, userId)),

    db
      .select({
        userId: npSessions.userId,
        total: sql<number>`cast(sum(${npSessions.durationMinutes}) as int)`,
      })
      .from(npSessions)
      .where(and(gte(npSessions.date, yearStart), lt(npSessions.date, yearEnd)))
      .groupBy(npSessions.userId),
  ]);

  const totalMinutes = sessions.reduce((s, r) => s + r.durationMinutes, 0);
  const totalPages = sessions.reduce((s, r) => s + Math.max(0, r.endPage - r.startPage), 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  const genreCounts: Record<string, number> = {};
  for (const b of finishedBooks) {
    if (b.genre) genreCounts[b.genre] = (genreCounts[b.genre] ?? 0) + 1;
  }
  const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Literary Fiction";

  const longestStreak = streakRows[0]?.currentStreak ?? 0;

  const totalUsers = allUserMinutes.length;
  const usersBelow = allUserMinutes.filter(u => (u.total ?? 0) < totalMinutes).length;
  const globalPercentile = totalUsers > 1 ? Math.round((usersBelow / totalUsers) * 100) : 92;

  res.json({
    year,
    booksFinished: finishedBooks.length,
    totalHours,
    totalPages,
    longestStreak,
    topGenre,
    globalPercentile,
  });
});

export default router;
