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

  // checkedDays also contains redeemed freeze days. Preserve those while
  // measuring the best run within this year, not today's current streak.
  let checkedDays: unknown = [];
  try { checkedDays = JSON.parse(streakRows[0]?.checkedDays ?? "[]"); } catch { /* use durable sessions */ }
  const readingDays = new Set(sessions.map(session => session.date));
  if (Array.isArray(checkedDays)) {
    for (const day of checkedDays) if (typeof day === "string") readingDays.add(day);
  }
  let longestStreak = 0;
  let run = 0;
  let previousDay = Number.NEGATIVE_INFINITY;
  for (const day of [...readingDays].sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < yearStart || day >= yearEnd) continue;
    const timestamp = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== day) continue;
    const dayNumber = timestamp / 86_400_000;
    run = dayNumber === previousDay + 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previousDay = dayNumber;
  }

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
