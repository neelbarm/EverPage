import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, npUsers, npBooks, npSessions, npStreak, npMarginNotes, npRoomMembers, npRoomMessages } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createSession,
  deleteSession,
  getSession,
  getSessionId,
} from "../lib/auth";

const router: IRouter = Router();

// --- helpers ---

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

function checkPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

// --- routes ---

router.post("/local-auth/register", async (req: Request, res: Response) => {
  const { email, password, username, displayName } = req.body ?? {};

  if (!email || !password || !username || !displayName) {
    res.status(400).json({ error: "email, password, username, and displayName are required" });
    return;
  }

  const emailNorm = email.toLowerCase().trim();
  const usernameNorm = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, "");
  const displayNameTrim = displayName.trim();
  const initial = displayNameTrim.charAt(0).toUpperCase();

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  if (usernameNorm.length < 2) {
    res.status(400).json({ error: "Username must be at least 2 characters" });
    return;
  }

  const existing = await db
    .select({ id: npUsers.id })
    .from(npUsers)
    .where(eq(npUsers.email, emailNorm))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "An account with that email already exists" });
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

  const passwordHash = hashPassword(password);
  const id = generateId();

  const [user] = await db
    .insert(npUsers)
    .values({ id, email: emailNorm, passwordHash, username: usernameNorm, displayName: displayNameTrim, color: "#1C3A5A", initial })
    .returning();

  const sessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.displayName,
      lastName: null,
      profileImageUrl: null,
    },
    access_token: "",
    refresh_token: undefined,
    expires_at: undefined,
  };

  const sid = await createSession(sessionData);

  res.status(201).json({
    token: sid,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.displayName,
      lastName: null,
      profileImageUrl: null,
    },
  });
});

router.post("/local-auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const emailNorm = email.toLowerCase().trim();

  const rows = await db
    .select()
    .from(npUsers)
    .where(eq(npUsers.email, emailNorm))
    .limit(1);

  if (rows.length === 0 || !rows[0].passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const user = rows[0];

  if (!checkPassword(password, user.passwordHash!)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const sessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.displayName,
      lastName: null,
      profileImageUrl: null,
    },
    access_token: "",
    refresh_token: undefined,
    expires_at: undefined,
  };

  const sid = await createSession(sessionData);

  res.json({
    token: sid,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.displayName,
      lastName: null,
      profileImageUrl: null,
    },
  });
});

router.get("/local-auth/me", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (!sid) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      profileImageUrl: session.user.profileImageUrl,
    },
  });
});

router.post("/local-auth/change-password", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (!sid) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }

  const rows = await db
    .select()
    .from(npUsers)
    .where(eq(npUsers.id, session.user.id))
    .limit(1);

  if (rows.length === 0 || !rows[0].passwordHash) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  if (!checkPassword(currentPassword, rows[0].passwordHash)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = hashPassword(newPassword);
  await db
    .update(npUsers)
    .set({ passwordHash: newHash })
    .where(eq(npUsers.id, session.user.id));

  res.json({ success: true });
});

router.post("/local-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json({ success: true });
});

router.delete("/local-auth/account", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  const session = sid ? await getSession(sid) : null;
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { password } = req.body ?? {};
  if (!password) {
    res.status(400).json({ error: "Password is required to delete your account" });
    return;
  }

  const rows = await db
    .select()
    .from(npUsers)
    .where(eq(npUsers.id, session.user.id))
    .limit(1);

  if (rows.length === 0 || !rows[0].passwordHash) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  if (!checkPassword(password, rows[0].passwordHash!)) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  const userId = session.user.id;

  await db.delete(npBooks).where(eq(npBooks.userId, userId));
  await db.delete(npSessions).where(eq(npSessions.userId, userId));
  await db.delete(npStreak).where(eq(npStreak.userId, userId));
  await db.delete(npMarginNotes).where(eq(npMarginNotes.userId, userId));
  await db.delete(npRoomMembers).where(eq(npRoomMembers.userId, userId));
  await db.update(npRoomMessages)
    .set({ body: "[deleted]", userId: "deleted" })
    .where(eq(npRoomMessages.userId, userId));
  await db.delete(npUsers).where(eq(npUsers.id, userId));

  if (sid) await deleteSession(sid);

  res.json({ success: true });
});

export default router;
