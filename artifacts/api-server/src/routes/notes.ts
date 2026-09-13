import { Router } from "express";
import { db, npMarginNotes, npFollows, npUsers, npBlocks } from "@workspace/db";
import { and, eq, lte, inArray, not, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

export function noteBookKey(title: string, author?: string): string {
  return `${title.trim().toLocaleLowerCase()}\u0000${(author ?? "").trim().toLocaleLowerCase()}`;
}

function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id as string;
}

// GET /api/notes?bookTitle=X&bookAuthor=Y&upToPage=N
router.get("/notes", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { bookTitle, bookAuthor, upToPage } = req.query as Record<string, string>;
  if (!bookTitle) {
    res.status(400).json({ error: "bookTitle is required" });
    return;
  }
  // Version 1.0.3 did not send bookAuthor. Keep those requests working, but
  // match only legacy notes whose stored author is also empty. Never broaden a
  // title-only request across distinct authored books with the same title.
  const normalizedAuthor = typeof bookAuthor === "string" ? bookAuthor.trim() : "";
  const parsedPage = parseInt(upToPage ?? "9999", 10);
  const maxPage = Number.isFinite(parsedPage) ? Math.max(0, parsedPage) : 9999;

  const follows = await db
    .select({ followingId: npFollows.followingId })
    .from(npFollows)
    .where(eq(npFollows.followerId, userId));

  const allowedIds = [userId, ...follows.map(f => f.followingId)];
  const blocked = await db
    .select({ blockerId: npBlocks.blockerId, blockedId: npBlocks.blockedId })
    .from(npBlocks)
    .where(or(eq(npBlocks.blockerId, userId), eq(npBlocks.blockedId, userId)));
  const hiddenIds = blocked.map((row) => row.blockerId === userId ? row.blockedId : row.blockerId);

  const notes = await db
    .select({
      id: npMarginNotes.id,
      userId: npMarginNotes.userId,
      page: npMarginNotes.page,
      noteText: npMarginNotes.noteText,
      createdAt: npMarginNotes.createdAt,
      displayName: npUsers.displayName,
      initial: npUsers.initial,
      color: npUsers.color,
    })
    .from(npMarginNotes)
    .leftJoin(npUsers, eq(npMarginNotes.userId, npUsers.id))
    .where(
      and(
        sql`lower(trim(${npMarginNotes.bookTitle})) = lower(trim(${String(bookTitle)}))`,
        sql`lower(trim(${npMarginNotes.bookAuthor})) = lower(trim(${normalizedAuthor}))`,
        lte(npMarginNotes.page, maxPage),
        inArray(npMarginNotes.userId, allowedIds),
        hiddenIds.length ? not(inArray(npMarginNotes.userId, hiddenIds)) : undefined,
      ),
    )
    .orderBy(npMarginNotes.page, npMarginNotes.createdAt);

  res.json(
    notes.map(n => ({
      id: n.id,
      userId: n.userId,
      page: n.page,
      noteText: n.noteText,
      createdAt: n.createdAt,
      displayName: n.displayName ?? "Reader",
      initial: n.initial ?? "R",
      color: n.color ?? "#1C3A5A",
      isOwnNote: n.userId === userId,
    })),
  );
});

// POST /api/notes
router.post("/notes", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { bookTitle, bookAuthor, page, noteText } = req.body ?? {};
  const pageNum = parseInt(String(page ?? ""), 10);
  if (!bookTitle || isNaN(pageNum) || pageNum < 0 || !noteText?.trim()) {
    res.status(400).json({ error: "bookTitle, page (number) and noteText are required" });
    return;
  }

  const id = randomUUID();
  await db.insert(npMarginNotes).values({
    id,
    userId,
    bookTitle: String(bookTitle).trim(),
    bookAuthor: String(bookAuthor ?? "").trim(),
    page: pageNum,
    noteText: String(noteText).trim(),
  });

  res.status(201).json({ id });
});

// DELETE /api/notes/:noteId
router.delete("/notes/:noteId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  await db
    .delete(npMarginNotes)
    .where(and(eq(npMarginNotes.id, req.params.noteId), eq(npMarginNotes.userId, userId)));

  res.json({ ok: true });
});

export default router;
