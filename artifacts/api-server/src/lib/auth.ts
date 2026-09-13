import * as client from "openid-client";
import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, npUsers, sessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
// Keep a user signed in for 30 days and refresh an active session before the
// final week. The old fixed seven-day expiry logged out every active reader at
// once, even when they were regularly using the app.
export const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const SESSION_RENEWAL_WINDOW = 7 * 24 * 60 * 60 * 1000;

export interface SessionData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  /** True for local-password sessions; OIDC sessions may have no np_users row. */
  localAuth?: boolean;
}

let oidcConfig: client.Configuration | null = null;

export async function getOidcConfig(): Promise<client.Configuration> {
  if (!oidcConfig) {
    oidcConfig = await client.discovery(
      new URL(ISSUER_URL),
      process.env.REPL_ID!,
    );
  }
  return oidcConfig;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  const session = row.sess as unknown as SessionData;
  // A deleted local account must not remain usable through a bearer token.
  // The marker also lets existing OIDC identities continue to work even though
  // they intentionally do not have a row in np_users.
  if (session.localAuth || session.access_token === "") {
    const [localUser] = await db
      .select({ id: npUsers.id })
      .from(npUsers)
      .where(eq(npUsers.id, session.user.id))
      .limit(1);
    if (!localUser) {
      await deleteSession(sid);
      return null;
    }
  }

  if (row.expire.getTime() - Date.now() < SESSION_RENEWAL_WINDOW) {
    await db
      .update(sessionsTable)
      .set({ expire: new Date(Date.now() + SESSION_TTL) })
      .where(eq(sessionsTable.sid, sid));
  }

  return session;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

/** Revoke every local or OIDC session whose serialized user id matches. */
export async function deleteUserSessions(
  userId: string,
  executor: Pick<typeof db, "delete"> = db,
): Promise<void> {
  await executor.delete(sessionsTable).where(
    sql`${sessionsTable.sess}->'user'->>'id' = ${userId}`,
  );
}

export async function clearSession(
  res: Response,
  sid?: string,
): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies?.[SESSION_COOKIE];
}
