import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { npUsers, npFollows, npActivity } from "@workspace/db/schema";
import { eq, ilike, or, and, ne, sql, desc, not, inArray } from "drizzle-orm";

const router: IRouter = Router();

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id as string;
}

function formatUser(u: typeof npUsers.$inferSelect) {
  return { id: u.id, username: u.username, displayName: u.displayName, color: u.color, initial: u.initial };
}

async function getSocialProfile(userId: string) {
  const rows = await db.select().from(npUsers).where(eq(npUsers.id, userId)).limit(1);
  return rows[0] ?? null;
}

router.get("/social/me", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const profile = await getSocialProfile(userId);
  res.json(profile ? formatUser(profile) : null);
});

router.post("/social/users", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { username, displayName, color, initial } = req.body ?? {};
  if (!username || !displayName) {
    res.status(400).json({ error: "username and displayName required" });
    return;
  }

  const existing = await getSocialProfile(userId);

  if (existing) {
    const usernameConflict = await db
      .select({ id: npUsers.id })
      .from(npUsers)
      .where(and(eq(npUsers.username, username), ne(npUsers.id, userId)))
      .limit(1);
    if (usernameConflict.length > 0) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    const updated = await db
      .update(npUsers)
      .set({ username, displayName, color: color ?? existing.color, initial: initial ?? existing.initial, updatedAt: new Date() })
      .where(eq(npUsers.id, userId))
      .returning();
    res.json(formatUser(updated[0]));
    return;
  }

  const usernameConflict = await db
    .select({ id: npUsers.id })
    .from(npUsers)
    .where(eq(npUsers.username, username))
    .limit(1);
  if (usernameConflict.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const rows = await db
    .insert(npUsers)
    .values({ id: userId, username, displayName, color: color ?? "#1C3A5A", initial: initial ?? displayName[0].toUpperCase() })
    .returning();
  res.status(201).json(formatUser(rows[0]));
});

router.get("/social/users/search", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const q = (req.query.q as string ?? "").trim();
  if (!q) {
    res.json([]);
    return;
  }
  const pattern = `%${q}%`;
  const rows = await db
    .select()
    .from(npUsers)
    .where(
      and(
        or(ilike(npUsers.username, pattern), ilike(npUsers.displayName, pattern)),
        ne(npUsers.id, userId),
      ),
    )
    .limit(20);
  res.json(rows.map(formatUser));
});

router.post("/social/users/:id/follow", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const targetId = req.params.id;
  if (targetId === userId) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }
  const me = await getSocialProfile(userId);
  if (!me) {
    res.status(404).json({ error: "Create your social profile first" });
    return;
  }
  await db
    .insert(npFollows)
    .values({ followerId: userId, followingId: targetId })
    .onConflictDoNothing();
  res.json({ ok: true });
});

router.delete("/social/users/:id/follow", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await db
    .delete(npFollows)
    .where(and(eq(npFollows.followerId, userId), eq(npFollows.followingId, req.params.id)));
  res.json({ ok: true });
});

router.get("/social/following", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rows = await db
    .select({
      id: npUsers.id,
      username: npUsers.username,
      displayName: npUsers.displayName,
      color: npUsers.color,
      initial: npUsers.initial,
    })
    .from(npFollows)
    .innerJoin(npUsers, eq(npFollows.followingId, npUsers.id))
    .where(eq(npFollows.followerId, userId));
  res.json(rows);
});

router.get("/social/feed", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const followingSubq = db
    .select({ followingId: npFollows.followingId })
    .from(npFollows)
    .where(eq(npFollows.followerId, userId));

  const rows = await db
    .select({
      id: npActivity.id,
      userId: npActivity.userId,
      username: npUsers.username,
      displayName: npUsers.displayName,
      color: npUsers.color,
      initial: npUsers.initial,
      bookTitle: npActivity.bookTitle,
      bookAuthor: npActivity.bookAuthor,
      durationMinutes: npActivity.durationMinutes,
      pagesRead: npActivity.pagesRead,
      createdAt: npActivity.createdAt,
    })
    .from(npActivity)
    .innerJoin(npUsers, eq(npActivity.userId, npUsers.id))
    .where(inArray(npActivity.userId, followingSubq))
    .orderBy(desc(npActivity.createdAt))
    .limit(50);
  res.json(rows);
});

router.post("/social/activity", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const me = await getSocialProfile(userId);
  if (!me) {
    res.status(404).json({ error: "Create your social profile first" });
    return;
  }
  const { bookTitle, bookAuthor, durationMinutes, pagesRead } = req.body ?? {};
  if (!bookTitle) {
    res.status(400).json({ error: "bookTitle required" });
    return;
  }
  const id = generateId();
  const rows = await db
    .insert(npActivity)
    .values({
      id,
      userId,
      bookTitle,
      bookAuthor: bookAuthor ?? "",
      durationMinutes: durationMinutes ?? 0,
      pagesRead: pagesRead ?? 0,
    })
    .returning();
  res.status(201).json(rows[0]);
});

router.get("/social/leaderboard", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const followingSubq = db
    .select({ followingId: npFollows.followingId })
    .from(npFollows)
    .where(eq(npFollows.followerId, userId));

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);

  const rows = await db
    .select({
      userId: npActivity.userId,
      username: npUsers.username,
      displayName: npUsers.displayName,
      color: npUsers.color,
      initial: npUsers.initial,
      todayMinutes: sql<number>`coalesce(sum(case when ${npActivity.createdAt} >= ${todayStart.toISOString()} then ${npActivity.durationMinutes} else 0 end), 0)`.as("today_minutes"),
      todayPages: sql<number>`coalesce(sum(case when ${npActivity.createdAt} >= ${todayStart.toISOString()} then ${npActivity.pagesRead} else 0 end), 0)`.as("today_pages"),
      weekMinutes: sql<number>`coalesce(sum(case when ${npActivity.createdAt} >= ${weekStart.toISOString()} then ${npActivity.durationMinutes} else 0 end), 0)`.as("week_minutes"),
      weekPages: sql<number>`coalesce(sum(case when ${npActivity.createdAt} >= ${weekStart.toISOString()} then ${npActivity.pagesRead} else 0 end), 0)`.as("week_pages"),
    })
    .from(npActivity)
    .innerJoin(npUsers, eq(npActivity.userId, npUsers.id))
    .where(inArray(npActivity.userId, followingSubq))
    .groupBy(npActivity.userId, npUsers.username, npUsers.displayName, npUsers.color, npUsers.initial)
    .orderBy(desc(sql`today_minutes`));

  res.json(rows.map(r => ({
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    color: r.color,
    initial: r.initial,
    todayMinutes: Number(r.todayMinutes),
    todayPages: Number(r.todayPages),
    weekMinutes: Number(r.weekMinutes),
    weekPages: Number(r.weekPages),
    streakDays: 0,
  })));
});

router.get("/social/suggested", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const followingSubq = db
    .select({ followingId: npFollows.followingId })
    .from(npFollows)
    .where(eq(npFollows.followerId, userId));

  const rows = await db
    .select()
    .from(npUsers)
    .where(
      and(
        ne(npUsers.id, userId),
        not(inArray(npUsers.id, followingSubq)),
      ),
    )
    .limit(10);
  res.json(rows.map(formatUser));
});

export default router;
