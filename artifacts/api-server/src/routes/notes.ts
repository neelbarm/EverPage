import { Router } from "express";
import { db, npMarginNotes, npFollows, npUsers } from "@workspace/db";
import { and, eq, lte, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

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

  const { bookTitle, upToPage } = req.query as Record<string, string>;
  if (!bookTitle) {
    res.status(400).json({ error: "bookTitle is required" });
    return;
  }
  const maxPage = Math.max(0, parseInt(upToPage ?? "9999", 10));

  const follows = await db
    .select({ followingId: npFollows.followingId })
    .from(npFollows)
    .where(eq(npFollows.followerId, userId));

  const allowedIds = [userId, ...follows.map(f => f.followingId)];

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
        eq(npMarginNotes.bookTitle, bookTitle.trim()),
        lte(npMarginNotes.page, maxPage),
        inArray(npMarginNotes.userId, allowedIds),
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
  if (!bookTitle || page == null || !noteText?.trim()) {
    res.status(400).json({ error: "bookTitle, page and noteText are required" });
    return;
  }

  const id = randomUUID();
  await db.insert(npMarginNotes).values({
    id,
    userId,
    bookTitle: String(bookTitle).trim(),
    bookAuthor: String(bookAuthor ?? "").trim(),
    page: parseInt(page, 10),
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
