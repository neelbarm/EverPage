import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { npUsers, npFollows, npActivity, npNudges, npBooks, npBlocks, npSessions, npPushDeliveries } from "@workspace/db/schema";
import { eq, ilike, or, and, ne, sql, desc, asc, not, inArray, gte } from "drizzle-orm";
import { assignAvatarUpload, objectPathFromAvatarUrl } from "./storage";
import { ObjectNotFoundError } from "../lib/objectStorage";
import { expoReceiptPersistenceUpdate, readingCalendarDay } from "../lib/reliabilityPolicies";

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
const TRUSTED_PUBLIC_ORIGIN = (process.env.PUBLIC_APP_ORIGIN ?? "https://nex-page.replit.app")
  .replace(/\/+$/, "");

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function isExpoPushToken(token: string): boolean {
  return /^(?:Exponent|Expo)PushToken\[[^\]]+\]$/.test(token);
}

type ExpoTicket = {
  id?: string;
  status?: string;
  details?: { error?: string };
};

export function expoReceiptState(receipt: ExpoTicket | undefined): "queued" | "accepted" | "failed" {
  if (!receipt || (receipt.status !== "ok" && receipt.status !== "error")) return "queued";
  return receipt.status === "error" ? "failed" : "accepted";
}

// Expo has returned both `data: ticket` and `data: [ticket]` over the
// lifetime of the API. Treat either form as one-message input; never silently
// report success just because the HTTP request itself succeeded.
export function normalizeExpoTickets(data: unknown): ExpoTicket[] {
  if (Array.isArray(data)) return data.filter((ticket): ticket is ExpoTicket => !!ticket && typeof ticket === "object");
  return data && typeof data === "object" ? [data as ExpoTicket] : [];
}

function failedAttemptId(nudgeId: string): string {
  return `failed_${nudgeId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Receipts are intentionally processed from durable ticket rows. This is
// best-effort when called from a request: a temporary Expo outage leaves rows
// queued for the next request instead of losing delivery state.
export async function processExpoReceipts(): Promise<void> {
  const queued = await db
    .select()
    .from(npPushDeliveries)
    .where(eq(npPushDeliveries.status, "queued"))
    .limit(100);
  if (!queued.length) return;

  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    signal: AbortSignal.timeout(10_000),
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: queued.map((row) => row.ticketId) }),
  });
  if (!response.ok) return;
  const payload = await response.json() as { data?: unknown };
  const receiptMap = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as Record<string, ExpoTicket>
    : {};

  for (const delivery of queued) {
    const receipt = receiptMap[delivery.ticketId];
    const receiptState = expoReceiptState(receipt);
    if (receiptState === "queued") continue;
    const persisted = expoReceiptPersistenceUpdate(receipt);
    if (!persisted) continue;
    const failed = persisted.status === "failed";
    await db
      .update(npPushDeliveries)
      .set({
        // An Expo receipt with status "ok" means the provider accepted the
        // message for delivery. It cannot confirm that iOS displayed it.
        status: persisted.status,
        receiptError: persisted.receiptError,
        updatedAt: new Date(),
      })
      .where(eq(npPushDeliveries.ticketId, delivery.ticketId));

    // Never clear a newly rotated token because an old ticket completed later.
    if (failed && receipt.details?.error === "DeviceNotRegistered") {
      await db
        .update(npUsers)
        .set({ pushToken: null, updatedAt: new Date() })
        .where(and(eq(npUsers.id, delivery.recipientId), eq(npUsers.pushToken, delivery.token)));
    }
  }
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

export function canonicalAvatarUrl(value: string, publicOrigin: string): string | null {
  const objectPath = objectPathFromAvatarUrl(value);
  if (!objectPath) return null;
  try {
    const origin = new URL(publicOrigin);
    const submitted = new URL(value, origin);
    if (submitted.origin !== origin.origin) return null;
    if (submitted.pathname !== `/api/storage${objectPath}`) return null;
    return `${origin.origin}/api/storage${objectPath}`;
  } catch {
    return null;
  }
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
  const usernameNorm = String(username).toLowerCase().trim().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  const displayNameTrim = String(displayName).trim().slice(0, 40);
  if (usernameNorm.length < 2) {
    res.status(400).json({ error: "Username must be at least 2 characters" });
    return;
  }
  if (!displayNameTrim) {
    res.status(400).json({ error: "displayName required" });
    return;
  }
  const resolvedInitial = String(initial ?? displayNameTrim[0]).trim().charAt(0).toUpperCase() || displayNameTrim[0].toUpperCase();

  const existing = await getSocialProfile(userId);

  if (existing) {
    const usernameConflict = await db
      .select({ id: npUsers.id })
      .from(npUsers)
      .where(and(eq(npUsers.username, usernameNorm), ne(npUsers.id, userId)))
      .limit(1);
    if (usernameConflict.length > 0) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    const updated = await db
      .update(npUsers)
      .set({ username: usernameNorm, displayName: displayNameTrim, color: color ?? existing.color, initial: resolvedInitial, updatedAt: new Date() })
      .where(eq(npUsers.id, userId))
      .returning();
    res.json(formatMe(updated[0]));
    return;
  }

  const usernameConflict = await db
    .select({ id: npUsers.id })
    .from(npUsers)
    .where(eq(npUsers.username, usernameNorm))
    .limit(1);
  if (usernameConflict.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const rows = await db
    .insert(npUsers)
    .values({ id: userId, username: usernameNorm, displayName: displayNameTrim, color: color ?? "#1C3A5A", initial: resolvedInitial })
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
  if (resolvedType === "session") {
    // Released 1.0.3 posts activity immediately after posting its session.
    // New session writes create an idempotent activity in the same transaction;
    // return that row instead of duplicating the legacy follow-up request.
    const recentCutoff = new Date(Date.now() - 2 * 60 * 1000);
    const existing = await db
      .select()
      .from(npActivity)
      .where(and(
        eq(npActivity.userId, userId),
        eq(npActivity.bookTitle, String(bookTitle)),
        eq(npActivity.bookAuthor, String(bookAuthor ?? "")),
        eq(npActivity.durationMinutes, Math.max(0, Number(durationMinutes) || 0)),
        eq(npActivity.pagesRead, Math.max(0, Number(pagesRead) || 0)),
        eq(npActivity.activityType, "session"),
        gte(npActivity.createdAt, recentCutoff),
      ))
      .orderBy(desc(npActivity.createdAt))
      .limit(5);
    const sessionActivity = existing.find((row) => row.id.startsWith("session:"));
    if (sessionActivity) {
      res.status(200).json(sessionActivity);
      return;
    }
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
  const { today, monday } = readingCalendarDay(req.query.today);

  const rows = await db
    .select({
      userId: npUsers.id,
      username: npUsers.username,
      displayName: npUsers.displayName,
      color: npUsers.color,
      initial: npUsers.initial,
      todayMinutes: sql<number>`coalesce(sum(case when ${npSessions.date} = ${today} then greatest(0, ${npSessions.durationMinutes}) else 0 end), 0)`.as("today_minutes"),
      todayPages: sql<number>`coalesce(sum(case when ${npSessions.date} = ${today} then greatest(0, ${npSessions.endPage} - ${npSessions.startPage}) else 0 end), 0)`.as("today_pages"),
      weekMinutes: sql<number>`coalesce(sum(case when ${npSessions.date} BETWEEN ${monday} AND ${today} then greatest(0, ${npSessions.durationMinutes}) else 0 end), 0)`.as("week_minutes"),
      weekPages: sql<number>`coalesce(sum(case when ${npSessions.date} BETWEEN ${monday} AND ${today} then greatest(0, ${npSessions.endPage} - ${npSessions.startPage}) else 0 end), 0)`.as("week_pages"),
    })
    .from(npUsers)
    .leftJoin(npSessions, eq(npSessions.userId, npUsers.id))
    .where(
      and(
        inArray(npUsers.id, followingSubq),
        hidden.length ? not(inArray(npUsers.id, hidden)) : undefined,
      ),
    )
    .groupBy(npUsers.id, npUsers.username, npUsers.displayName, npUsers.color, npUsers.initial)
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

  const { today, monday } = readingCalendarDay(req.query.today);
  const readingSessions = await db.select().from(npSessions).where(eq(npSessions.userId, targetId));
  const weekPages = readingSessions
    .filter(session => session.date >= monday && session.date <= today)
    .reduce((sum, session) => sum + Math.max(0, session.endPage - session.startPage), 0);
  const activityDays = new Set(readingSessions.map(session => session.date));

  let streakDays = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (activityDays.has(key)) {
      streakDays++;
    } else if (i !== 0) {
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
  if (!token || typeof token !== "string" || !isExpoPushToken(token)) {
    res.status(400).json({ error: "A valid Expo push token is required" });
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
  await db.transaction(async (tx) => {
  // Serialize the cooldown check and send across autoscaled API instances.
  // A simultaneous second tap must not create or send a duplicate nudge.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`nudge:${senderId}:${req.params.userId}`}))`);
  const db = tx;
  // Complete receipts left by an earlier request before deciding whether this
  // nudge is still cooling down.
  processExpoReceipts().catch(() => {});

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
  if (await isBlockedBetween(senderId, targetUserId)) {
    res.status(403).json({ error: "Cannot nudge a blocked user" });
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

  let nudgeId: string;
  let retryingFailedDelivery = false;
  if (recentNudge.length > 0) {
    const sentAt = new Date(recentNudge[0].createdAt as any).getTime();
    const previousDelivery = await db
      .select({ status: npPushDeliveries.status })
      .from(npPushDeliveries)
      .where(eq(npPushDeliveries.nudgeId, recentNudge[0].id))
      .orderBy(desc(npPushDeliveries.createdAt))
      .limit(1);
    // A failed push may be retried without creating a second in-app nudge or
    // racing the cooldown. Queued and delivered attempts remain cooled down.
    if (previousDelivery[0]?.status === "failed") {
      nudgeId = recentNudge[0].id;
      retryingFailedDelivery = true;
    } else {
      const cooldownUntil = new Date(sentAt + cooldownMs).toISOString();
      res.status(429).json({ error: "Already nudged this person in the last 24 hours", cooldownUntil });
      return;
    }
  } else {
    nudgeId = generateId();
    await db.insert(npNudges).values({ id: nudgeId, senderId, recipientId: targetUserId });
  }

  // Fire-and-forget: delete nudge records older than NUDGE_RETENTION_DAYS to keep the table tidy
  const retentionCutoff = new Date(Date.now() - NUDGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  db.delete(npNudges).where(sql`${npNudges.createdAt} < ${retentionCutoff.toISOString()}`).catch(() => {});

  if (!target.nudgesEnabled) {
    res.json({ ok: true, delivery: "in_app", skipped: "nudges_disabled" });
    return;
  }

  if (!target.pushToken) {
    res.json({ ok: true, delivery: "in_app", skipped: "no_push_token" });
    return;
  }

  const sentToken = target.pushToken;
  try {
    const pushRes = await fetch(EXPO_PUSH_URL, {
      signal: AbortSignal.timeout(10_000),
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
      body: JSON.stringify({
        to: target.pushToken,
        title: `${sender.displayName} nudged you 👋`,
        body: "Don't let your reading streak slip! Open the app and log a session.",
        data: { navigateTo: "log" },
        sound: "default",
        priority: "high",
        channelId: "default",
      }),
    });
    const result = await pushRes.json() as { data?: unknown };
    const ticket = normalizeExpoTickets(result.data)[0];
    // A 200 response alone is not a push ticket. Require Expo to explicitly
    // accept the notification before reporting that a phone notification was queued.
    if (!pushRes.ok || ticket?.status !== "ok" || !ticket.id) {
      // Expo tells us when an app was uninstalled or its token expired. Clear it
      // so a future app launch can register a fresh token instead of silently
      // failing every nudge.
      if (ticket?.details?.error === "DeviceNotRegistered") {
        await db
          .update(npUsers)
          .set({ pushToken: null, updatedAt: new Date() })
          .where(and(eq(npUsers.id, targetUserId), eq(npUsers.pushToken, sentToken)));
      }
      await db.insert(npPushDeliveries).values({
        ticketId: failedAttemptId(nudgeId),
        nudgeId,
        recipientId: targetUserId,
        token: sentToken,
        status: "failed",
        receiptError: ticket?.details?.error ?? "Expo did not accept the notification",
      });
      res.status(202).json({
        ok: true,
        delivery: "in_app",
        pushStatus: "failed",
        retryable: true,
        skipped: "push_unavailable",
      });
      return;
    }
    await db.insert(npPushDeliveries).values({
      ticketId: ticket.id,
      nudgeId,
      recipientId: targetUserId,
      token: sentToken,
      status: "queued",
    }).onConflictDoNothing();
    res.json({
      ok: true,
      delivery: "queued",
      pushStatus: "queued",
      pushTicketId: ticket.id,
      retrying: retryingFailedDelivery,
    });
  } catch (err: any) {
    // The in-app nudge is already durable. A transient Expo failure must not
    // turn it into a lost action or consume the retry cooldown.
    await db.insert(npPushDeliveries).values({
      ticketId: failedAttemptId(nudgeId),
      nudgeId,
      recipientId: targetUserId,
      token: sentToken,
      status: "failed",
      receiptError: "Expo request failed",
    });
    res.status(202).json({ ok: true, delivery: "in_app", pushStatus: "failed", retryable: true });
  }
  });
});

router.get("/social/nudges", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  processExpoReceipts().catch(() => {});

  const thirtyDaysAgo = new Date(Date.now() - NUDGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const hidden = await getHiddenUserIds(userId);
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
    .where(and(
      eq(npNudges.recipientId, userId),
      gte(npNudges.createdAt, thirtyDaysAgo),
      hidden.length ? not(inArray(npNudges.senderId, hidden)) : undefined,
    ))
    .orderBy(desc(npNudges.createdAt))
    .limit(50);

  res.json(rows);
});

// Recipients the current user has nudged within the cooldown window, so the UI
// can keep the nudge button in its "already nudged" state across navigation.
router.get("/social/nudges/sent", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  processExpoReceipts().catch(() => {});

  const since = new Date(Date.now() - NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ recipientId: npNudges.recipientId, createdAt: npNudges.createdAt })
    .from(npNudges)
    .where(and(
      eq(npNudges.senderId, userId), gte(npNudges.createdAt, since),
      sql`COALESCE((SELECT status FROM np_push_deliveries WHERE nudge_id = ${npNudges.id} ORDER BY created_at DESC LIMIT 1), 'in_app') <> 'failed'`,
    ))
    .orderBy(desc(npNudges.createdAt));

  res.json(rows.map((r) => r.recipientId));
});

router.patch("/social/me/avatar", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { avatarUrl } = req.body ?? {};
  if (typeof avatarUrl !== "string" && avatarUrl !== null) {
    res.status(400).json({ error: "avatarUrl (string | null) required" });
    return;
  }
  try {
    if (avatarUrl === null) {
      const updated = await db
        .update(npUsers)
        .set({ avatarUrl: null, updatedAt: new Date() })
        .where(eq(npUsers.id, userId))
        .returning();
      if (!updated[0]) {
        res.status(404).json({ error: "Social profile not found" });
        return;
      }
      res.json(formatMe(updated[0]));
      return;
    }
    // Never persist an origin derived from Host/X-Forwarded-Host. Those are
    // caller-controlled unless every proxy hop is trusted and configured.
    const canonicalUrl = canonicalAvatarUrl(avatarUrl, TRUSTED_PUBLIC_ORIGIN);
    if (!canonicalUrl) {
      res.status(422).json({ error: "Avatar URL must use this API's storage endpoint" });
      return;
    }
    const updated = await assignAvatarUpload(userId, canonicalUrl);
    if (!updated) {
      res.status(404).json({ error: "Social profile not found" });
      return;
    }
    res.json(formatMe(updated));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "INVALID_AVATAR_PATH" || code === "AVATAR_METADATA_MISMATCH") {
      res.status(422).json({ error: "Avatar upload is invalid or incomplete" });
      return;
    }
    if (code === "AVATAR_NOT_OWNED") {
      res.status(403).json({ error: "Avatar upload is not owned by this account" });
      return;
    }
    if (error instanceof ObjectNotFoundError) {
      res.status(409).json({ error: "Avatar upload has not reached object storage" });
      return;
    }
    throw error;
  }
});

// Curated fallbacks so a fresh app (no friends, empty catalog) is never empty.
const CURATED_RECS = [
  { id: "rec_demon", title: "Demon Copperhead", author: "Barbara Kingsolver", genre: "Literary Fiction", coverColor: "#B85C38", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780063251922-M.jpg", reason: "it matches your literary fiction reading", friendsCount: 0 },
  { id: "rec_lincoln", title: "Lincoln in the Bardo", author: "George Saunders", genre: "Literary Fiction", coverColor: "#5E4A7A", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780812985405-M.jpg", reason: "it matches your literary fiction reading", friendsCount: 0 },
  { id: "rec_normal", title: "Normal People", author: "Sally Rooney", genre: "Contemporary Fiction", coverColor: "#4A7A9E", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780571334650-M.jpg", reason: "it matches your contemporary fiction reading", friendsCount: 0 },
  { id: "rec_pachinko", title: "Pachinko", author: "Min Jin Lee", genre: "Historical Fiction", coverColor: "#B54935", coverImageUri: "https://covers.openlibrary.org/b/isbn/9781455563937-M.jpg", reason: "it matches your historical fiction reading", friendsCount: 0 },
  { id: "rec_educated", title: "Educated", author: "Tara Westover", genre: "Memoir", coverColor: "#C09B3A", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780399590504-M.jpg", reason: "it matches your memoir reading", friendsCount: 0 },
  { id: "rec_project_hail_mary", title: "Project Hail Mary", author: "Andy Weir", genre: "Science Fiction", coverColor: "#315C83", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780593135204-M.jpg", reason: "it matches your science fiction reading", friendsCount: 0 },
  { id: "rec_tomorrow", title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Gabrielle Zevin", genre: "Contemporary Fiction", coverColor: "#D58462", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780593321201-M.jpg", reason: "readers with similar tastes love it", friendsCount: 0 },
  { id: "rec_circe", title: "Circe", author: "Madeline Miller", genre: "Fantasy", coverColor: "#80613E", coverImageUri: "https://covers.openlibrary.org/b/isbn/9780316556347-M.jpg", reason: "readers with similar tastes love it", friendsCount: 0 },
];

const cleanText = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const normKey = (t: string, a: string) =>
  `${cleanText(t).toLowerCase()}|${cleanText(a).toLowerCase()}`;
const GENRE_ALIASES: Record<string, string> = {
  "sci fi": "science fiction",
  "sci-fi": "science fiction",
  scifi: "science fiction",
  nonfiction: "non-fiction",
  "non fiction": "non-fiction",
  "non-fiction": "non-fiction",
  biography: "biography",
  biographies: "biography",
  memoirs: "memoir",
  "historical novels": "historical fiction",
  fantasy: "fantasy",
};
const normGenre = (genre: string | null | undefined) => {
  const raw = cleanText(genre).toLowerCase().replace(/[\/_]+/g, " ").replace(/\s+/g, " ");
  return GENRE_ALIASES[raw] ?? raw;
};

// Author values that mean "no real author" — books with these must never be recommended.
const BAD_AUTHORS = new Set([
  "", "not available", "n/a", "na", "none", "unknown", "unknown author",
  "author", "various", "-", "—",
]);

// A recommendation card must render cleanly: real cover image, real author, sane title.
// Anything that would show up blank or malformed (the "Not Available" / no-cover cards
// testers reported) is filtered out, and the curated fallback fills the gap.
function isQualityRec(a: { title: string; author: string; coverImageUri: string | null }): boolean {
  const title = cleanText(a.title);
  const author = cleanText(a.author);
  const cover = cleanText(a.coverImageUri);
  if (title.length < 2 || title.length > 90) return false;
  if (/\.\.\.|…|[\r\n]/.test(title)) return false; // truncated / concatenated junk
  if (!author || BAD_AUTHORS.has(author.toLowerCase())) return false;
  if (!/^https?:\/\//i.test(cover)) return false; // must have a loadable cover
  return true;
}

// Data-driven recommendations: the genres a reader has actually spent time
// reading rank first. Friends and broader popularity break ties, never replace
// that personal signal.
router.get("/social/recommendations", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsedLimit = Number.parseInt(String(req.query.limit ?? "8"), 10);
  const recommendationLimit = Number.isFinite(parsedLimit)
    ? Math.min(8, Math.max(1, parsedLimit))
    : 8;

  // Books already on my shelf (to exclude), plus session-weighted genre taste.
  const myBooks = await db
    .select({ id: npBooks.id, title: npBooks.title, author: npBooks.author, genre: npBooks.genre })
    .from(npBooks)
    .where(eq(npBooks.userId, userId));
  const myKeys = new Set(myBooks.map((b) => normKey(b.title, b.author)));
  const sessions = await db
    .select({ bookId: npSessions.bookId, durationMinutes: npSessions.durationMinutes })
    .from(npSessions)
    .where(eq(npSessions.userId, userId));
  const booksById = new Map(myBooks.map((book) => [book.id, book]));
  const genreScores = new Map<string, number>();
  const genreLabels = new Map<string, string>();
  // A saved book is a small fallback signal. Minutes logged against it are a
  // much stronger signal, so recommendations adapt as the reader actually reads.
  for (const book of myBooks) {
    const genre = normGenre(book.genre);
    if (!genre) continue;
    genreLabels.set(genre, book.genre.trim());
    genreScores.set(genre, (genreScores.get(genre) ?? 0) + 1);
  }
  for (const session of sessions) {
    const book = booksById.get(session.bookId);
    const genre = normGenre(book?.genre);
    if (!genre) continue;
    genreLabels.set(genre, book!.genre.trim());
    genreScores.set(genre, (genreScores.get(genre) ?? 0) + Math.max(1, session.durationMinutes ?? 0));
  }

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
    .orderBy(asc(npBooks.title), asc(npBooks.author), asc(npBooks.userId))
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
    if (!isQualityRec(a)) return;
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
      genre: a.genre || undefined,
    });
  };

  const genreScoreFor = (a: Agg) => genreScores.get(normGenre(a.genre)) ?? 0;
  const rankedCandidates = [...aggs].sort((a, b) => {
    const genreDifference = genreScoreFor(b) - genreScoreFor(a);
    if (genreDifference !== 0) return genreDifference;
    const friendsDifference = b.friends.size - a.friends.size;
    if (friendsDifference !== 0) return friendsDifference;
    const ownerDifference = b.owners.size - a.owners.size;
    if (ownerDifference !== 0) return ownerDifference;
    const titleDifference = a.title.localeCompare(b.title);
    return titleDifference !== 0 ? titleDifference : a.author.localeCompare(b.author);
  });

  for (const candidate of rankedCandidates) {
    const genre = normGenre(candidate.genre);
    const genreScore = genreScoreFor(candidate);
    const genreLabel = genreLabels.get(genre) ?? candidate.genre;
    if (genreScore > 0) {
      push(candidate, `it matches your ${genreLabel.toLowerCase()} reading`);
    } else if (candidate.friends.size > 0) {
      push(candidate, candidate.friends.size === 1 ? "a friend is reading it" : `${candidate.friends.size} friends are reading it`);
    } else {
      push(candidate, "it's popular right now");
    }
    if (picked.length >= recommendationLimit) break;
  }

  // Fallback — start with curated books in the same genres, then use a varied
  // catalog only if there are not enough matches to fill the shelf.
  const curated = [...CURATED_RECS].sort((a, b) => {
    const scoreDifference = (genreScores.get(normGenre(b.genre)) ?? 0) - (genreScores.get(normGenre(a.genre)) ?? 0);
    return scoreDifference;
  });
  for (const c of curated) {
    if (picked.length >= recommendationLimit) break;
    const key = normKey(c.title, c.author);
    if (myKeys.has(key) || used.has(key)) continue;
    used.add(key);
    const genre = normGenre(c.genre);
    const genreScore = genreScores.get(genre) ?? 0;
    picked.push({
      ...c,
      // Curated books are not friend/popularity signals. Say why they are
      // shown instead of claiming a taste match that was not observed.
      reason: genreScore > 0
        ? `it matches your ${c.genre.toLowerCase()} reading`
        : "a curated pick while we learn your preferences",
    });
  }

  res.json(picked.slice(0, recommendationLimit));
});

export default router;
