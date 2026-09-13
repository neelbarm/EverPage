import { Router } from "express";
import { db, npRooms, npRoomMembers, npRoomMessages, npUsers, npBlocks } from "@workspace/db";
import { and, eq, desc, sql, inArray, not } from "drizzle-orm";
import { randomUUID } from "crypto";
import { canReadRoomMessages, findReusableRoom } from "../lib/reliabilityPolicies";

const router = Router();

function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id as string;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function getBlockedUserIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ blockerId: npBlocks.blockerId, blockedId: npBlocks.blockedId })
    .from(npBlocks)
    .where(sql`${npBlocks.blockerId} = ${userId} OR ${npBlocks.blockedId} = ${userId}`);
  return [...new Set(rows.map((row) => row.blockerId === userId ? row.blockedId : row.blockerId))];
}

async function hasBlockBetween(a: string, b: string): Promise<boolean> {
  const rows = await db
    .select({ blockerId: npBlocks.blockerId })
    .from(npBlocks)
    .where(
      sql`(${npBlocks.blockerId} = ${a} AND ${npBlocks.blockedId} = ${b})
        OR (${npBlocks.blockerId} = ${b} AND ${npBlocks.blockedId} = ${a})`,
    )
    .limit(1);
  return rows.length > 0;
}

// POST /api/rooms — create room
router.post("/rooms", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { bookTitle, bookAuthor, weeklyTargetPages } = req.body ?? {};
  if (!bookTitle?.trim()) {
    res.status(400).json({ error: "bookTitle is required" });
    return;
  }

  const title = String(bookTitle).trim();
  const author = String(bookAuthor ?? "").trim();

  // Reuse an existing room instead of minting a new code every time. Tapping
  // "Create room" repeatedly used to orphan the previous room and its chat, so
  // the conversation looked deleted. If this user is already in a room for the
  // same book, return that room. Prefer the one with the most recent message so
  // real chat history is never stranded.
  const mine = await db
    .select({
      id: npRooms.id,
      bookTitle: npRooms.bookTitle,
      bookAuthor: npRooms.bookAuthor,
      createdAt: npRooms.createdAt,
    })
    .from(npRoomMembers)
    .innerJoin(npRooms, eq(npRooms.id, npRoomMembers.roomId))
    .where(eq(npRoomMembers.userId, userId));

  const candidates = mine.filter((r) => findReusableRoom([r], title, author));

  if (candidates.length > 0) {
    let chosen = candidates[0];
    if (candidates.length > 1) {
      const lastRows = await db
        .select({
          roomId: npRoomMessages.roomId,
          last: sql<string>`max(${npRoomMessages.createdAt})`,
        })
        .from(npRoomMessages)
        .where(inArray(npRoomMessages.roomId, candidates.map((c) => c.id)))
        .groupBy(npRoomMessages.roomId);
      const lastBy = new Map(lastRows.map((r) => [r.roomId, r.last]));
      candidates.sort((a, b) => {
        const la = lastBy.get(a.id);
        const lb = lastBy.get(b.id);
        if (la && lb) return la < lb ? 1 : la > lb ? -1 : 0;
        if (la) return -1;
        if (lb) return 1;
        return new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime();
      });
      chosen = candidates[0];
    }
    res.status(200).json({ code: chosen.id, reused: true });
    return;
  }

  const parsedTarget = parseInt(String(weeklyTargetPages ?? "50"), 10);
  const targetPages = Number.isFinite(parsedTarget) ? Math.max(1, Math.min(parsedTarget, 100000)) : 50;
  // Serialize the check-and-create for this owner/book. The membership
  // primary key prevents duplicate membership rows; the transaction and
  // advisory lock also prevent concurrent taps from creating duplicate rooms.
  const code = await db.transaction(async (tx) => {
    // Empty-author legacy requests match authored rooms for the same title, so
    // the lock must use that same broad equivalence class. Locking by owner and
    // normalized title prevents empty/populated-author requests racing each
    // other into duplicate rooms.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${norm(title)}`}))`);
    const existing = await tx
      .select({ id: npRooms.id, bookTitle: npRooms.bookTitle, bookAuthor: npRooms.bookAuthor })
      .from(npRoomMembers)
      .innerJoin(npRooms, eq(npRooms.id, npRoomMembers.roomId))
      .where(eq(npRoomMembers.userId, userId));
    const duplicate = findReusableRoom(existing, title, author);
    if (duplicate) return duplicate.id;
    const newCode = generateCode();
    await tx.insert(npRooms).values({
      id: newCode,
      bookTitle: title,
      bookAuthor: author,
      createdBy: userId,
      weeklyTargetPages: targetPages,
    });
    await tx.insert(npRoomMembers).values({ roomId: newCode, userId, currentPage: 0 });
    return newCode;
  });

  res.status(201).json({ code });
});

// GET /api/rooms — rooms I'm a member of, newest activity first. Lets the app
// show "Open room" for a book instead of offering to create a duplicate.
router.get("/rooms", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const mine = await db
    .select({
      code: npRooms.id,
      bookTitle: npRooms.bookTitle,
      bookAuthor: npRooms.bookAuthor,
      createdBy: npRooms.createdBy,
      createdAt: npRooms.createdAt,
    })
    .from(npRoomMembers)
    .innerJoin(npRooms, eq(npRooms.id, npRoomMembers.roomId))
    .where(eq(npRoomMembers.userId, userId));

  if (mine.length === 0) {
    res.json([]);
    return;
  }

  const codes = mine.map((r) => r.code);
  const hiddenIds = await getBlockedUserIds(userId);
  const [memberRows, lastRows] = await Promise.all([
    db
      .select({ roomId: npRoomMembers.roomId, n: sql<number>`count(*)::int` })
      .from(npRoomMembers)
      .where(
        and(
          inArray(npRoomMembers.roomId, codes),
          hiddenIds.length ? not(inArray(npRoomMembers.userId, hiddenIds)) : undefined,
        ),
      )
      .groupBy(npRoomMembers.roomId),
    db
      .select({
        roomId: npRoomMessages.roomId,
        last: sql<string>`max(${npRoomMessages.createdAt})`,
        n: sql<number>`count(*)::int`,
      })
      .from(npRoomMessages)
      .where(
        and(
          inArray(npRoomMessages.roomId, codes),
          hiddenIds.length ? not(inArray(npRoomMessages.userId, hiddenIds)) : undefined,
        ),
      )
      .groupBy(npRoomMessages.roomId),
  ]);

  const memberBy = new Map(memberRows.map((r) => [r.roomId, r.n]));
  const lastBy = new Map(lastRows.map((r) => [r.roomId, r]));

  const out = mine
    .map((r) => ({
      ...r,
      memberCount: memberBy.get(r.code) ?? 1,
      messageCount: lastBy.get(r.code)?.n ?? 0,
      lastMessageAt: lastBy.get(r.code)?.last ?? null,
      isOwner: r.createdBy === userId,
    }))
    .sort((a, b) => {
      const la = a.lastMessageAt;
      const lb = b.lastMessageAt;
      if (la && lb) return la < lb ? 1 : la > lb ? -1 : 0;
      if (la) return -1;
      if (lb) return 1;
      return new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime();
    });

  res.json(out);
});

// GET /api/rooms/:code — room details + members
router.get("/rooms/:code", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const code = req.params.code.toUpperCase();
  const rooms = await db.select().from(npRooms).where(eq(npRooms.id, code));
  if (!rooms.length) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const room = rooms[0];
  const membership = await db
    .select({ userId: npRoomMembers.userId })
    .from(npRoomMembers)
    .where(and(eq(npRoomMembers.roomId, code), eq(npRoomMembers.userId, userId)))
    .limit(1);
  if (!membership.length) {
    // Room metadata and membership lists are private. Joining remains
    // possible through POST /join when the caller has a valid invite code.
    res.status(403).json({ error: "Join the room to view it" });
    return;
  }
  const hiddenIds = await getBlockedUserIds(userId);

  const members = await db
    .select({
      userId: npRoomMembers.userId,
      currentPage: npRoomMembers.currentPage,
      joinedAt: npRoomMembers.joinedAt,
      displayName: npUsers.displayName,
      initial: npUsers.initial,
      color: npUsers.color,
    })
    .from(npRoomMembers)
    .leftJoin(npUsers, eq(npRoomMembers.userId, npUsers.id))
    .where(
      and(
        eq(npRoomMembers.roomId, code),
        hiddenIds.length ? not(inArray(npRoomMembers.userId, hiddenIds)) : undefined,
      ),
    )
    .orderBy(desc(npRoomMembers.currentPage));

  const myPage = members.find(m => m.userId === userId)?.currentPage ?? 0;

  res.json({
    code: room.id,
    bookTitle: room.bookTitle,
    bookAuthor: room.bookAuthor,
    weeklyTargetPages: room.weeklyTargetPages,
    createdAt: room.createdAt,
    isMember: true,
    myPage,
    members: members.map((m, i) => ({
      userId: m.userId,
      rank: i + 1,
      displayName: m.displayName ?? "Reader",
      initial: m.initial ?? "R",
      color: m.color ?? "#1C3A5A",
      currentPage: m.currentPage,
      isMe: m.userId === userId,
    })),
  });
});

// POST /api/rooms/:code/join
router.post("/rooms/:code/join", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const code = req.params.code.toUpperCase();
  const rooms = await db.select().from(npRooms).where(eq(npRooms.id, code));
  if (!rooms.length) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const existingMembers = await db
    .select({ userId: npRoomMembers.userId })
    .from(npRoomMembers)
    .where(eq(npRoomMembers.roomId, code));
  for (const member of existingMembers) {
    if (await hasBlockBetween(userId, member.userId)) {
      res.status(403).json({ error: "Cannot join a room with a blocked user" });
      return;
    }
  }
  await db.insert(npRoomMembers).values({ roomId: code, userId, currentPage: 0 }).onConflictDoNothing();
  res.json({ ok: true });
});

// PATCH /api/rooms/:code/progress — update my current page
router.patch("/rooms/:code/progress", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const code = req.params.code.toUpperCase();
  const { currentPage } = req.body ?? {};
  const pageNum = parseInt(String(currentPage ?? ""), 10);
  if (isNaN(pageNum) || pageNum < 0) {
    res.status(400).json({ error: "currentPage must be a non-negative number" });
    return;
  }

  await db
    .update(npRoomMembers)
    .set({ currentPage: pageNum })
    .where(and(eq(npRoomMembers.roomId, code), eq(npRoomMembers.userId, userId)));

  res.json({ ok: true });
});

// GET /api/rooms/:code/messages — spoiler-filtered messages
router.get("/rooms/:code/messages", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const code = req.params.code.toUpperCase();
  const memberRows = await db
    .select({ userId: npRoomMembers.userId, currentPage: npRoomMembers.currentPage })
    .from(npRoomMembers)
    .where(and(eq(npRoomMembers.roomId, code), eq(npRoomMembers.userId, userId)));
  if (!canReadRoomMessages(memberRows.map((member) => member.userId), userId)) {
    res.status(403).json({ error: "Join the room first" });
    return;
  }
  const myPage = memberRows[0]?.currentPage ?? 0;
  const hiddenIds = await getBlockedUserIds(userId);

  const messages = await db
    .select({
      id: npRoomMessages.id,
      userId: npRoomMessages.userId,
      body: npRoomMessages.body,
      spoilerUpToPage: npRoomMessages.spoilerUpToPage,
      createdAt: npRoomMessages.createdAt,
      displayName: npUsers.displayName,
      initial: npUsers.initial,
      color: npUsers.color,
    })
    .from(npRoomMessages)
    .leftJoin(npUsers, eq(npRoomMessages.userId, npUsers.id))
    .where(
      and(
        eq(npRoomMessages.roomId, code),
        hiddenIds.length ? not(inArray(npRoomMessages.userId, hiddenIds)) : undefined,
      ),
    )
    .orderBy(npRoomMessages.createdAt);

  res.json(
    messages
      .filter(m => myPage >= m.spoilerUpToPage)
      .map(m => ({
        id: m.id,
        userId: m.userId,
        displayName: m.displayName ?? "Reader",
        initial: m.initial ?? "R",
        color: m.color ?? "#1C3A5A",
        body: m.body,
        spoilerUpToPage: m.spoilerUpToPage,
        createdAt: m.createdAt,
        isMe: m.userId === userId,
      })),
  );
});

// POST /api/rooms/:code/messages
router.post("/rooms/:code/messages", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const code = req.params.code.toUpperCase();
  const memberRows = await db
    .select({ userId: npRoomMembers.userId, currentPage: npRoomMembers.currentPage })
    .from(npRoomMembers)
    .where(and(eq(npRoomMembers.roomId, code), eq(npRoomMembers.userId, userId)));

  if (!canReadRoomMessages(memberRows.map((member) => member.userId), userId)) {
    res.status(403).json({ error: "Join the room first" });
    return;
  }

  const { body, spoilerUpToPage } = req.body ?? {};
  if (!body?.trim()) {
    res.status(400).json({ error: "body is required" });
    return;
  }

  const myPage = memberRows[0].currentPage;
  const msgPage = spoilerUpToPage != null ? Math.min(parseInt(spoilerUpToPage, 10), myPage) : myPage;

  await db.insert(npRoomMessages).values({
    id: randomUUID(),
    roomId: code,
    userId,
    body: String(body).trim(),
    spoilerUpToPage: msgPage,
  });

  res.status(201).json({ ok: true });
});

export default router;
