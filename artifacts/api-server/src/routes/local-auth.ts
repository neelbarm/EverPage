import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, npUsers, npBooks, npSessions, npStreak, npMarginNotes, npRoomMembers, npRoomMessages, npPasswordResetTokens, npAuthRateLimits, sessionsTable } from "@workspace/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  getSession,
  getSessionId,
} from "../lib/auth";

const router: IRouter = Router();
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_FROM = process.env.EMAIL_FROM;
const RESEND_API_URL = "https://api.resend.com/emails";
const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 128;
const MAX_USERNAME_LENGTH = 32;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_RESET_TOKEN_LENGTH = 256;
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT = 10;
const FORGOT_RATE_LIMIT = 5;

// --- helpers ---

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

async function checkPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function resetTokenClaimCondition(tokenHash: string, now: Date) {
  return and(
    eq(npPasswordResetTokens.tokenHash, tokenHash),
    isNull(npPasswordResetTokens.usedAt),
    gt(npPasswordResetTokens.expiresAt, now),
  );
}

function getPasswordResetUrl(token: string): string {
  const configuredOrigin = process.env.PASSWORD_RESET_WEB_ORIGIN?.trim();
  const configuredDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  // Keep the existing production hostname as the final fallback. This is a
  // link-format fallback only; it does not alter DNS or deployment domains.
  const origin = configuredOrigin?.startsWith("https://")
    ? configuredOrigin
    : (configuredDomain ? `https://${configuredDomain.replace(/^https?:\/\//, "")}` : "https://nex-page.replit.app");
  return `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

function getNativePasswordResetUrl(token: string): string {
  return `everpage://reset-password?token=${encodeURIComponent(token)}`;
}

async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !PASSWORD_RESET_FROM) return false;

  const resetUrl = getPasswordResetUrl(token);
  const nativeResetUrl = getNativePasswordResetUrl(token);
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
      html: `<p>We received a request to reset your EverPage password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If the secure web link does not open the app, you can open the reset in EverPage directly: <a href="${nativeResetUrl}">Open EverPage</a>.</p><p>This link expires in one hour. If you did not request a reset, you can ignore this email.</p>`,
      text: `We received a request to reset your EverPage password. Open this secure HTTPS link to choose a new password: ${resetUrl}\n\nIf you have the EverPage app installed, you can also open the reset directly: ${nativeResetUrl}\n\nThis link expires in one hour. If you did not request a reset, you can ignore this email.`,
    }),
  });

  return response.ok;
}

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 6 && value.length <= MAX_PASSWORD_LENGTH;
}

function clientAddress(req: Request): string {
  return (req.ip || req.socket.remoteAddress || "unknown").slice(0, 128);
}

function rateLimitKey(scope: string, value: string): string {
  return `${scope}:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

async function consumeRateLimit(key: string, limit: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - AUTH_RATE_WINDOW_MS);
  const [row] = await db
    .insert(npAuthRateLimits)
    .values({ key, attempts: 1, windowStartedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: npAuthRateLimits.key,
      set: {
        attempts: sql`CASE WHEN ${npAuthRateLimits.windowStartedAt} <= ${windowStart} THEN 1 ELSE ${npAuthRateLimits.attempts} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${npAuthRateLimits.windowStartedAt} <= ${windowStart} THEN ${now} ELSE ${npAuthRateLimits.windowStartedAt} END`,
        updatedAt: now,
      },
    })
    .returning({ attempts: npAuthRateLimits.attempts });
  return (row?.attempts ?? limit + 1) <= limit;
}

async function clearRateLimits(keys: string[]): Promise<void> {
  for (const key of keys) {
    await db.delete(npAuthRateLimits).where(eq(npAuthRateLimits.key, key));
  }
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

  if (typeof email !== "string" || typeof password !== "string" || typeof username !== "string" || typeof displayName !== "string") {
    res.status(400).json({ error: "email, password, username, and displayName are required" });
    return;
  }

  const emailNorm = normalizedEmail(email);
  const usernameNorm = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, "");
  const displayNameTrim = displayName.trim();
  if (!emailNorm || username.length > MAX_USERNAME_LENGTH || displayNameTrim.length === 0 || displayNameTrim.length > MAX_DISPLAY_NAME_LENGTH) {
    res.status(400).json({ error: "Enter a valid email, username, and display name" });
    return;
  }
  const initial = displayNameTrim.charAt(0).toUpperCase();

  if (!validPassword(password)) {
    res.status(400).json({ error: `Password must be between 6 and ${MAX_PASSWORD_LENGTH} characters` });
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

  const passwordHash = await hashPassword(password);
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
    localAuth: true,
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

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const emailNorm = normalizedEmail(email);
  if (!emailNorm || password.length > MAX_PASSWORD_LENGTH) {
    res.status(400).json({ error: "Enter a valid email and password" });
    return;
  }
  const loginKeys = [
    rateLimitKey("login-ip", clientAddress(req)),
    rateLimitKey("login-email", emailNorm),
  ];
  const allowedByIp = await consumeRateLimit(loginKeys[0], LOGIN_RATE_LIMIT);
  const allowedByEmail = await consumeRateLimit(loginKeys[1], LOGIN_RATE_LIMIT);
  if (!allowedByIp || !allowedByEmail) {
    res.status(429).json({ error: "Too many sign-in attempts. Please try again later." });
    return;
  }

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

  if (!(await checkPassword(password, user.passwordHash!))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  await clearRateLimits(loginKeys);

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
    localAuth: true,
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
  const email = normalizedEmail(req.body?.email);
  const genericResponse = { success: true, message: "If an EverPage account exists for that email, we sent a reset link." };

  if (req.body?.email == null || typeof req.body.email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  if (!email) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }

  const forgotKey = rateLimitKey("forgot-ip", clientAddress(req));
  if (!(await consumeRateLimit(forgotKey, FORGOT_RATE_LIMIT))) {
    // Deliberately keep this indistinguishable from the normal response.
    res.json(genericResponse);
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
  // A mail-provider outage must not invalidate a previously delivered link.
  // Successful consumption below revokes every outstanding link atomically.
  await db.insert(npPasswordResetTokens).values({
    id: generateId(),
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  try {
    const delivered = await sendPasswordResetEmail(user.email, token);
    if (!delivered) {
      req.log?.error("Password reset email is not configured or could not be delivered");
      // Do not remove the token: a transient provider/configuration failure
      // must not turn a safe retry into a destructive operation.
      res.json(genericResponse);
      return;
    }
  } catch (error) {
    req.log?.error({ error }, "Failed to send password reset email");
    res.json(genericResponse);
    return;
  }

  res.json(genericResponse);
});

router.post("/local-auth/reset-password", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!token || token.length > MAX_RESET_TOKEN_LENGTH || !validPassword(newPassword)) {
    res.status(400).json({ error: "A valid reset link and a password of 6 to 128 characters are required" });
    return;
  }

  const tokenHash = hashResetToken(token);
  const newHash = await hashPassword(newPassword);
  let claimed = false;
  try {
    await db.transaction(async (tx) => {
      const [candidate] = await tx.select({ userId: npPasswordResetTokens.userId })
        .from(npPasswordResetTokens)
        .where(resetTokenClaimCondition(tokenHash, new Date())).limit(1);
      if (!candidate) return;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`password-reset:${candidate.userId}`}))`);
      // UPDATE ... RETURNING is the claim. Concurrent requests can both
      // inspect a token, but only one can atomically transition used_at from
      // NULL while it is still unexpired.
      const [reset] = await tx
        .update(npPasswordResetTokens)
        .set({ usedAt: new Date() })
        .where(resetTokenClaimCondition(tokenHash, new Date()))
        .returning({ userId: npPasswordResetTokens.userId });
      if (!reset) return;

      const [updatedUser] = await tx
        .update(npUsers)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(npUsers.id, reset.userId))
        .returning({ id: npUsers.id });
      if (!updatedUser) {
        throw new Error("Reset token referenced a missing account");
      }
      await deleteUserSessions(reset.userId, tx);
      await tx.update(npPasswordResetTokens).set({ usedAt: new Date() })
        .where(and(eq(npPasswordResetTokens.userId, reset.userId), isNull(npPasswordResetTokens.usedAt)));
      claimed = true;
    });
  } catch (error) {
    req.log?.error({ error }, "Password reset transaction failed");
    res.status(503).json({ error: "Password reset is temporarily unavailable. Please try again." });
    return;
  }

  if (!claimed) {
    res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
    return;
  }

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
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (!validPassword(currentPassword) || !validPassword(newPassword)) {
    res.status(400).json({ error: `Passwords must be between 6 and ${MAX_PASSWORD_LENGTH} characters` });
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

  if (!(await checkPassword(currentPassword, rows[0].passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(npUsers)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(npUsers.id, session.user.id));
    await deleteUserSessions(session.user.id, tx);
  });

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
  if (typeof password !== "string" || !validPassword(password)) {
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

  if (!(await checkPassword(password, rows[0].passwordHash!))) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  const userId = session.user.id;

  await db.transaction(async (tx) => {
    await tx.delete(npBooks).where(eq(npBooks.userId, userId));
    await tx.delete(npSessions).where(eq(npSessions.userId, userId));
    await tx.delete(npStreak).where(eq(npStreak.userId, userId));
    await tx.delete(npMarginNotes).where(eq(npMarginNotes.userId, userId));
    await tx.delete(npRoomMembers).where(eq(npRoomMembers.userId, userId));
    await tx.update(npRoomMessages)
      .set({ body: "[deleted]", userId: "deleted" })
      .where(eq(npRoomMessages.userId, userId));
    // sessions has no foreign key to the local account, so revoke it
    // explicitly before removing the account.
    await deleteUserSessions(userId, tx);
    await tx.delete(npUsers).where(eq(npUsers.id, userId));
  });

  res.json({ success: true });
});

export default router;
