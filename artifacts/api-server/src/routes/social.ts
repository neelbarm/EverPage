import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { npUsers, npFollows, npActivity, npNudges } from "@workspace/db/schema";
import { eq, ilike, or, and, ne, sql, desc, not, inArray, gte } from "drizzle-orm";

const router: IRouter = Router();

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const NUDGE_RETENTION_DAYS = 30;
const NUDGE_COOLDOWN_DAYS = 1;

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

function formatMe(u: typeof npUsers.$inferSelect) {
  return { id: u.id, username: u.username, displayName: u.displayName, color: u.color, initial: u.initial, nudgesEnabled: u.nudgesEnabled };
}

async function getSocialProfile(userId: string) {
  const rows = await db.select().from(npUsers).where(eq(npUsers.id, userId)).limit(1);
  return rows[0] ?? null;
}

router.get("/social/me", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const profile = await getSocialProfile(userId);
  res.json(profile ? formatMe(profile) : null);
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
    res.json(formatMe(updated[0]));
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
  res.status(201).json(formatMe(rows[0]));
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

router.get("/social/followers", async (req, res) => {
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
    .innerJoin(npUsers, eq(npFollows.followerId, npUsers.id))
    .where(eq(npFollows.followingId, userId));
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
      activityType: npActivity.activityType,
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
  const { bookTitle, bookAuthor, durationMinutes, pagesRead, activityType } = req.body ?? {};
  if (!bookTitle) {
    res.status(400).json({ error: "bookTitle required" });
    return;
  }
  const validTypes = ["session", "recommendation"];
  const resolvedType = validTypes.includes(activityType) ? activityType : "session";
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
      activityType: resolvedType,
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

router.get("/social/users/:id/profile", async (req, res) => {
  const currentUserId = requireAuth(req, res);
  if (!currentUserId) return;

  const targetId = req.params.id;

  const userRows = await db.select().from(npUsers).where(eq(npUsers.id, targetId)).limit(1);
  const user = userRows[0];
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const activity = await db
    .select()
    .from(npActivity)
    .where(eq(npActivity.userId, targetId))
    .orderBy(desc(npActivity.createdAt))
    .limit(50);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const weekPages = activity
    .filter(a => new Date(a.createdAt as any) >= weekStart)
    .reduce((sum, a) => sum + (a.pagesRead ?? 0), 0);

  const activityDays = new Set(
    activity.map(a => {
      const d = new Date(a.createdAt as any);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );

  let streakDays = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (activityDays.has(key)) {
      streakDays++;
    } else {
      break;
    }
  }

  const seenBooks = new Set<string>();
  const currentBooks: { title: string; author: string }[] = [];
  for (const a of activity) {
    if (!seenBooks.has(a.bookTitle)) {
      seenBooks.add(a.bookTitle);
      currentBooks.push({ title: a.bookTitle, author: a.bookAuthor ?? "" });
      if (currentBooks.length >= 5) break;
    }
  }

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    color: user.color,
    initial: user.initial,
    streakDays,
    weekPages,
    currentBooks,
    recentActivity: activity.slice(0, 10).map(a => ({
      id: a.id,
      bookTitle: a.bookTitle,
      bookAuthor: a.bookAuthor,
      durationMinutes: a.durationMinutes,
      pagesRead: a.pagesRead,
      createdAt: a.createdAt,
    })),
  });
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

router.post("/social/push-token", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { token } = req.body ?? {};
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token required" });
    return;
  }
  await db
    .update(npUsers)
    .set({ pushToken: token, updatedAt: new Date() })
    .where(eq(npUsers.id, userId));
  res.json({ ok: true });
});

router.patch("/social/me/settings", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { nudgesEnabled } = req.body ?? {};
  if (typeof nudgesEnabled !== "boolean") {
    res.status(400).json({ error: "nudgesEnabled (boolean) required" });
    return;
  }
  await db
    .update(npUsers)
    .set({ nudgesEnabled, updatedAt: new Date() })
    .where(eq(npUsers.id, userId));
  res.json({ ok: true });
});

router.post("/social/nudge/:userId", async (req, res) => {
  const senderId = requireAuth(req, res);
  if (!senderId) return;

  const targetUserId = req.params.userId;
  if (targetUserId === senderId) {
    res.status(400).json({ error: "Cannot nudge yourself" });
    return;
  }

  const sender = await getSocialProfile(senderId);
  if (!sender) {
    res.status(404).json({ error: "Create your social profile first" });
    return;
  }

  const isFollowing = await db
    .select({ followerId: npFollows.followerId })
    .from(npFollows)
    .where(and(eq(npFollows.followerId, senderId), eq(npFollows.followingId, targetUserId)))
    .limit(1);
  if (isFollowing.length === 0) {
    res.status(403).json({ error: "You can only nudge people you follow" });
    return;
  }

  const targets = await db.select().from(npUsers).where(eq(npUsers.id, targetUserId)).limit(1);
  const target = targets[0];
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const cooldownMs = NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - cooldownMs);
  const recentNudge = await db
    .select({ id: npNudges.id, createdAt: npNudges.createdAt })
    .from(npNudges)
    .where(
      and(
        eq(npNudges.senderId, senderId),
        eq(npNudges.recipientId, targetUserId),
        gte(npNudges.createdAt, since),
      ),
    )
    .limit(1);

  if (recentNudge.length > 0) {
    const sentAt = new Date(recentNudge[0].createdAt as any).getTime();
    const cooldownUntil = new Date(sentAt + cooldownMs).toISOString();
    res.status(429).json({ error: "Already nudged this person in the last 24 hours", cooldownUntil });
    return;
  }

  const nudgeId = generateId();
  await db.insert(npNudges).values({ id: nudgeId, senderId, recipientId: targetUserId });

  // Fire-and-forget: delete nudge records older than NUDGE_RETENTION_DAYS to keep the table tidy
  const retentionCutoff = new Date(Date.now() - NUDGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  db.delete(npNudges).where(sql`${npNudges.createdAt} < ${retentionCutoff.toISOString()}`).catch(() => {});

  if (!target.nudgesEnabled) {
    res.json({ ok: true, skipped: "nudges_disabled" });
    return;
  }

  if (!target.pushToken) {
    res.json({ ok: true, skipped: "no_push_token" });
    return;
  }

  try {
    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
      body: JSON.stringify({
        to: target.pushToken,
        title: `${sender.displayName} nudged you 👋`,
        body: "Don't let your reading streak slip! Open the app and log a session.",
        data: { navigateTo: "log" },
        sound: "default",
      }),
    });
    const result = await pushRes.json();
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to send push notification", detail: err?.message });
  }
});

router.get("/social/nudges", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const thirtyDaysAgo = new Date(Date.now() - NUDGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: npNudges.id,
      senderId: npNudges.senderId,
      senderUsername: npUsers.username,
      senderDisplayName: npUsers.displayName,
      senderColor: npUsers.color,
      senderInitial: npUsers.initial,
      createdAt: npNudges.createdAt,
    })
    .from(npNudges)
    .innerJoin(npUsers, eq(npNudges.senderId, npUsers.id))
    .where(and(eq(npNudges.recipientId, userId), gte(npNudges.createdAt, thirtyDaysAgo)))
    .orderBy(desc(npNudges.createdAt))
    .limit(50);

  res.json(rows);
});

export default router;
