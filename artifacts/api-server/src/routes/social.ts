import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { npUsers, npFollows, npActivity, npNudges, npBooks, npBlocks } from "@workspace/db/schema";
import { eq, ilike, or, and, ne, sql, desc, not, inArray, gte } from "drizzle-orm";

const router: IRouter = Router();

// Returns every user id that should be hidden from `userId`: anyone they blocked,
// plus anyone who blocked them. Blocking hides accounts in both directions.
async function getHiddenUserIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ blockerId: npBlocks.blockerId, blockedId: npBlocks.blockedId })
    .from(npBlocks)
    .where(or(eq(npBlocks.blockerId, userId), eq(npBlocks.blockedId, userId)));
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.blockerId === userId ? r.blockedId : r.blockerId);
  }
  return [...ids];
}

async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const rows = await db
    .select({ blockerId: npBlocks.blockerId })
    .from(npBlocks)
    .where(
      or(
        and(eq(npBlocks.blockerId, a), eq(npBlocks.blockedId, b)),
        and(eq(npBlocks.blockerId, b), eq(npBlocks.blockedId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

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
  return { id: u.id, username: u.username, displayName: u.displayName, color: u.color, initial: u.initial, avatarUrl: u.avatarUrl ?? null };
}

function formatMe(u: typeof npUsers.$inferSelect) {
  return { id: u.id, username: u.username, displayName: u.displayName, color: u.color, initial: u.initial, avatarUrl: u.avatarUrl ?? null, nudgesEnabled: u.nudgesEnabled };
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
  const hidden = await getHiddenUserIds(userId);
  const rows = await db
    .select()
    .from(npUsers)
    .where(
      and(
        or(ilike(npUsers.username, pattern), ilike(npUsers.displayName, pattern)),
        ne(npUsers.id, userId),
        hidden.length ? not(inArray(npUsers.id, hidden)) : undefined,
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
  if (await isBlockedBetween(userId, targetId)) {
    res.status(403).json({ error: "Cannot follow a blocked user" });
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

router.post("/social/users/:id/block", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const targetId = req.params.id;
  if (targetId === userId) {
    res.status(400).json({ error: "Cannot block yourself" });
    return;
  }
  const target = await getSocialProfile(targetId);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await db
    .insert(npBlocks)
    .values({ blockerId: userId, blockedId: targetId })
    .onConflictDoNothing();
  // Blocking severs the relationship both ways.
  await db.delete(npFollows).where(
    or(
      and(eq(npFollows.followerId, userId), eq(npFollows.followingId, targetId)),
      and(eq(npFollows.followerId, targetId), eq(npFollows.followingId, userId)),
    ),
  );
  res.json({ ok: true });
});

router.delete("/social/users/:id/block", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await db
    .delete(npBlocks)
    .where(and(eq(npBlocks.blockerId, userId), eq(npBlocks.blockedId, req.params.id)));
  res.json({ ok: true });
});

router.get("/social/blocked", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rows = await db
    .select({
      id: npUsers.id,
      username: npUsers.username,
      displayName: npUsers.displayName,
      color: npUsers.color,
      initial: npUsers.initial,
      avatarUrl: npUsers.avatarUrl,
    })
    .from(npBlocks)
    .innerJoin(npUsers, eq(npBlocks.blockedId, npUsers.id))
    .where(eq(npBlocks.blockerId, userId))
    .orderBy(desc(npBlocks.createdAt));
  res.json(rows.map((r) => ({ ...r, avatarUrl: r.avatarUrl ?? null })));
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

  const hidden = await getHiddenUserIds(userId);
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
    .where(
      and(
        inArray(npActivity.userId, followingSubq),
        hidden.length ? not(inArray(npActivity.userId, hidden)) : undefined,
      ),
    )
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

  const hidden = await getHiddenUserIds(userId);
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
    .where(
      and(
        inArray(npActivity.userId, followingSubq),
        hidden.length ? not(inArray(npActivity.userId, hidden)) : undefined,
      ),
    )
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

  // Hide profiles where a block exists in either direction.
  if (await isBlockedBetween(currentUserId, targetId)) {
    res.status(404).json({ error: "User not found" });
    return;
  }

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

  const hidden = await getHiddenUserIds(userId);
  const rows = await db
    .select()
    .from(npUsers)
    .where(
      and(
        ne(npUsers.id, userId),
        not(inArray(npUsers.id, followingSubq)),
        hidden.length ? not(inArray(npUsers.id, hidden)) : undefined,
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

router.patch("/social/me/avatar", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { avatarUrl } = req.body ?? {};
  if (typeof avatarUrl !== "string" && avatarUrl !== null) {
    res.status(400).json({ error: "avatarUrl (string | null) required" });
    return;
  }
  const updated = await db
    .update(npUsers)
    .set({ avatarUrl: avatarUrl ?? null, updatedAt: new Date() })
    .where(eq(npUsers.id, userId))
    .returning();
  if (!updated[0]) {
    res.status(404).json({ error: "Social profile not found" });
    return;
  }
  res.json(formatMe(updated[0]));
});

// Curated fallbacks so a fresh app (no friends, empty catalog) is never empty.
const CURATED_RECS = [
  { id: "rec_demon", title: "Demon Copperhead", author: "Barbara Kingsolver", coverColor: "#B85C38", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780063251922-M.jpg", reason: "it's a modern classic", friendsCount: 0 },
  { id: "rec_normal", title: "Normal People", author: "Sally Rooney", coverColor: "#4A7A9E", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780571334650-M.jpg", reason: "new readers love it", friendsCount: 0 },
  { id: "rec_educated", title: "Educated", author: "Tara Westover", coverColor: "#C09B3A", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780399590504-M.jpg", reason: "it's an award-winning memoir", friendsCount: 0 },
  { id: "rec_lincoln", title: "Lincoln in the Bardo", author: "George Saunders", coverColor: "#5E4A7A", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780812985405-M.jpg", reason: "it's bold and inventive", friendsCount: 0 },
];

const normKey = (t: string, a: string) =>
  `${(t ?? "").trim().toLowerCase()}|${(a ?? "").trim().toLowerCase()}`;

// Data-driven recommendations: books friends are reading, then your top genre, then trending.
router.get("/social/recommendations", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Books already on my shelf (to exclude) + my top genre
  const myBooks = await db
    .select({ title: npBooks.title, author: npBooks.author, genre: npBooks.genre })
    .from(npBooks)
    .where(eq(npBooks.userId, userId));
  const myKeys = new Set(myBooks.map((b) => normKey(b.title, b.author)));
  const genreCount: Record<string, number> = {};
  for (const b of myBooks) if (b.genre) genreCount[b.genre] = (genreCount[b.genre] ?? 0) + 1;
  const myTopGenre = Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Who I follow
  const followRows = await db
    .select({ id: npFollows.followingId })
    .from(npFollows)
    .where(eq(npFollows.followerId, userId));
  const friendIds = new Set(followRows.map((r) => r.id));

  // Candidate books from everyone else (excluding blocked users)
  const hidden = await getHiddenUserIds(userId);
  const others = await db
    .select({
      userId: npBooks.userId,
      title: npBooks.title,
      author: npBooks.author,
      genre: npBooks.genre,
      coverColor: npBooks.coverColor,
      coverImageUri: npBooks.coverImageUri,
    })
    .from(npBooks)
    .where(
      and(
        ne(npBooks.userId, userId),
        hidden.length ? not(inArray(npBooks.userId, hidden)) : undefined,
      ),
    )
    .limit(2000);

  type Agg = {
    title: string; author: string; genre: string;
    coverColor: string; coverImageUri: string | null;
    owners: Set<string>; friends: Set<string>;
  };
  const map = new Map<string, Agg>();
  for (const b of others) {
    const key = normKey(b.title, b.author);
    if (myKeys.has(key)) continue;
    let a = map.get(key);
    if (!a) {
      a = { title: b.title, author: b.author, genre: b.genre, coverColor: b.coverColor, coverImageUri: b.coverImageUri ?? null, owners: new Set(), friends: new Set() };
      map.set(key, a);
    }
    a.owners.add(b.userId);
    if (friendIds.has(b.userId)) a.friends.add(b.userId);
    if (!a.coverImageUri && b.coverImageUri) a.coverImageUri = b.coverImageUri;
  }
  const aggs = [...map.values()];

  const picked: any[] = [];
  const used = new Set<string>();
  const push = (a: Agg, reason: string) => {
    const key = normKey(a.title, a.author);
    if (used.has(key)) return;
    used.add(key);
    picked.push({
      id: `rec_${key}`.replace(/[^a-z0-9_]/gi, "_").slice(0, 60),
      title: a.title,
      author: a.author,
      coverColor: a.coverColor || "#5C849E",
      coverImageUri: a.coverImageUri ?? undefined,
      reason,
      friendsCount: a.friends.size,
    });
  };

  // Tier 1 — friends are reading it
  aggs.filter((a) => a.friends.size > 0)
    .sort((x, y) => y.friends.size - x.friends.size)
    .forEach((a) => push(a, a.friends.size === 1 ? "a friend is reading it" : `${a.friends.size} friends are reading it`));

  // Tier 2 — your top genre
  if (myTopGenre) {
    aggs.filter((a) => a.genre === myTopGenre)
      .sort((x, y) => y.owners.size - x.owners.size)
      .forEach((a) => push(a, `you read ${myTopGenre.toLowerCase()}`));
  }

  // Tier 3 — trending overall
  aggs.sort((x, y) => y.owners.size - x.owners.size)
    .forEach((a) => push(a, "it's popular right now"));

  // Fallback — curated, so the section is never empty
  for (const c of CURATED_RECS) {
    if (picked.length >= 6) break;
    const key = normKey(c.title, c.author);
    if (myKeys.has(key) || used.has(key)) continue;
    used.add(key);
    picked.push(c);
  }

  res.json(picked.slice(0, 8));
});

export default router;
