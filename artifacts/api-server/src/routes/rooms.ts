import { Router } from "express";
import { db, npRooms, npRoomMembers, npRoomMessages, npUsers } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id as string;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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

  const code = generateCode();
  await db.insert(npRooms).values({
    id: code,
    bookTitle: String(bookTitle).trim(),
    bookAuthor: String(bookAuthor ?? "").trim(),
    createdBy: userId,
    weeklyTargetPages: Math.max(1, parseInt(weeklyTargetPages ?? "50", 10)),
  });
  await db.insert(npRoomMembers).values({ roomId: code, userId, currentPage: 0 });

  res.status(201).json({ code });
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
    .where(eq(npRoomMembers.roomId, code))
    .orderBy(desc(npRoomMembers.currentPage));

  const myPage = members.find(m => m.userId === userId)?.currentPage ?? 0;

  res.json({
    code: room.id,
    bookTitle: room.bookTitle,
    bookAuthor: room.bookAuthor,
    weeklyTargetPages: room.weeklyTargetPages,
    createdAt: room.createdAt,
    isMember: members.some(m => m.userId === userId),
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

  await db.insert(npRoomMembers).values({ roomId: code, userId, currentPage: 0 }).onConflictDoNothing();
  res.json({ ok: true });
});

// PATCH /api/rooms/:code/progress — update my current page
router.patch("/rooms/:code/progress", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const code = req.params.code.toUpperCase();
  const { currentPage } = req.body ?? {};
  if (currentPage == null) {
    res.status(400).json({ error: "currentPage is required" });
    return;
  }

  await db
    .update(npRoomMembers)
    .set({ currentPage: Math.max(0, parseInt(currentPage, 10)) })
    .where(and(eq(npRoomMembers.roomId, code), eq(npRoomMembers.userId, userId)));

  res.json({ ok: true });
});

// GET /api/rooms/:code/messages — spoiler-filtered messages
router.get("/rooms/:code/messages", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const code = req.params.code.toUpperCase();
  const memberRows = await db
    .select({ currentPage: npRoomMembers.currentPage })
    .from(npRoomMembers)
    .where(and(eq(npRoomMembers.roomId, code), eq(npRoomMembers.userId, userId)));
  const myPage = memberRows[0]?.currentPage ?? 0;

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
    .where(eq(npRoomMessages.roomId, code))
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
    .select({ currentPage: npRoomMembers.currentPage })
    .from(npRoomMembers)
    .where(and(eq(npRoomMembers.roomId, code), eq(npRoomMembers.userId, userId)));

  if (!memberRows.length) {
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
