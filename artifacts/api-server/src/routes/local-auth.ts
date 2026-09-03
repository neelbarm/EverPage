import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, npUsers, npBooks, npSessions, npStreak, npMarginNotes, npRoomMembers, npRoomMessages, npPasswordResetTokens, sessionsTable } from "@workspace/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  createSession,
  deleteSession,
  getSession,
  getSessionId,
} from "../lib/auth";

const router: IRouter = Router();
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_FROM = process.env.EMAIL_FROM;
const RESEND_API_URL = "https://api.resend.com/emails";

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

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getPasswordResetUrl(token: string): string {
  return `everpage://reset-password?token=${encodeURIComponent(token)}`;
}

async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !PASSWORD_RESET_FROM) return false;

  const resetUrl = getPasswordResetUrl(token);
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: PASSWORD_RESET_FROM,
      to: [email],
      subject: "Reset your EverPage password",
      html: `<p>We received a request to reset your EverPage password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in one hour. If you did not request a reset, you can ignore this email.</p>`,
      text: `We received a request to reset your EverPage password. Open this link in the EverPage app to choose a new password: ${resetUrl}\n\nThis link expires in one hour. If you did not request a reset, you can ignore this email.`,
    }),
  });

  return response.ok;
}

function parseBirthday(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const birthday = new Date(Date.UTC(year, month - 1, day));
  if (
    birthday.getUTCFullYear() !== year ||
    birthday.getUTCMonth() !== month - 1 ||
    birthday.getUTCDate() !== day
  ) return null;

  const today = new Date();
  let age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() < month - 1 ||
    (today.getUTCMonth() === month - 1 && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 13 ? value : null;
}

// --- routes ---

router.post("/local-auth/register", async (req: Request, res: Response) => {
  const { email, password, username, displayName, birthday } = req.body ?? {};

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
  const birthdayIso = parseBirthday(birthday);
  if (!birthdayIso) {
    res.status(400).json({ error: "Enter a valid birthday. You must be at least 13 to sign up." });
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
    .values({ id, email: emailNorm, passwordHash, username: usernameNorm, displayName: displayNameTrim, color: "#1C3A5A", initial, birthday: birthdayIso })
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

router.post("/local-auth/forgot-password", async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
  const genericResponse = { success: true, message: "If an EverPage account exists for that email, we sent a reset link." };

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const [user] = await db
    .select({ id: npUsers.id, email: npUsers.email })
    .from(npUsers)
    .where(eq(npUsers.email, email))
    .limit(1);

  // Never reveal whether an address has an account.
  if (!user?.email) {
    res.json(genericResponse);
    return;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  await db.delete(npPasswordResetTokens).where(eq(npPasswordResetTokens.userId, user.id));
  await db.insert(npPasswordResetTokens).values({
    id: generateId(),
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  try {
    const delivered = await sendPasswordResetEmail(user.email, token);
    if (!delivered) {
      await db.delete(npPasswordResetTokens).where(eq(npPasswordResetTokens.tokenHash, tokenHash));
      req.log?.error("Password reset email is not configured or could not be delivered");
      res.status(503).json({ error: "Password reset is temporarily unavailable. Please try again later." });
      return;
    }
  } catch (error) {
    await db.delete(npPasswordResetTokens).where(eq(npPasswordResetTokens.tokenHash, tokenHash));
    req.log?.error({ error }, "Failed to send password reset email");
    res.status(503).json({ error: "Password reset is temporarily unavailable. Please try again later." });
    return;
  }

  res.json(genericResponse);
});

router.post("/local-auth/reset-password", async (req: Request, res: Response) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!token || newPassword.length < 6) {
    res.status(400).json({ error: "A valid reset link and a password of at least 6 characters are required" });
    return;
  }

  const tokenHash = hashResetToken(token);
  const [reset] = await db
    .select()
    .from(npPasswordResetTokens)
    .where(and(
      eq(npPasswordResetTokens.tokenHash, tokenHash),
      isNull(npPasswordResetTokens.usedAt),
      gt(npPasswordResetTokens.expiresAt, new Date()),
    ))
    .limit(1);

  if (!reset) {
    res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(npUsers)
      .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(npUsers.id, reset.userId));
    await tx.update(npPasswordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(npPasswordResetTokens.id, reset.id));
    await tx.delete(sessionsTable).where(sql`${sessionsTable.sess}->'user'->>'id' = ${reset.userId}`);
  });

  res.json({ success: true });
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
