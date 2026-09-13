export function readingCalendarDay(value: unknown, now = new Date()): { today: string; monday: string } {
  const fallback = now.toISOString().slice(0, 10);
  let today = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
  let date = new Date(`${today}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== today) {
    today = fallback;
    date = new Date(`${today}T12:00:00Z`);
  }
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return { today, monday: date.toISOString().slice(0, 10) };
}

export type ResetTokenRecord = {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
};

/**
 * This is the application-level equivalent of the SQL UPDATE predicate used
 * by reset-password. It makes the one-use and expiry rules executable without
 * requiring a database in regression tests.
 */
export function isClaimableResetToken(record: ResetTokenRecord, now: Date): boolean {
  return record.usedAt === null && record.expiresAt.getTime() > now.getTime();
}

export function claimResetToken(
  record: ResetTokenRecord,
  now: Date,
): ResetTokenRecord | null {
  if (!isClaimableResetToken(record, now)) return null;
  return { ...record, usedAt: now };
}

export type SessionRecord = {
  sid: string;
  sess: { user?: { id?: string } };
};

export function sessionBelongsToUser(session: SessionRecord, userId: string): boolean {
  return session.sess.user?.id === userId;
}

export function revokeUserSessions(
  sessions: SessionRecord[],
  userId: string,
): SessionRecord[] {
  return sessions.filter((session) => !sessionBelongsToUser(session, userId));
}

export function roomBookMatches(
  room: { bookTitle: string; bookAuthor: string | null | undefined },
  title: string,
  author: string,
): boolean {
  const roomTitle = (room.bookTitle ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const roomAuthor = (room.bookAuthor ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const requestedTitle = title.trim().toLowerCase().replace(/\s+/g, ' ');
  const requestedAuthor = author.trim().toLowerCase().replace(/\s+/g, ' ');
  return roomTitle === requestedTitle
    && (!roomAuthor || !requestedAuthor || roomAuthor === requestedAuthor);
}

export function findReusableRoom<T extends { bookTitle: string; bookAuthor: string | null | undefined }>(
  rooms: readonly T[],
  title: string,
  author: string,
): T | undefined {
  return rooms.find((room) => roomBookMatches(room, title, author));
}

export function canReadRoomMessages(memberIds: readonly string[], userId: string): boolean {
  return memberIds.includes(userId);
}

export type ExpoReceipt = {
  status?: string;
  details?: { error?: string };
};

export function expoReceiptPersistenceUpdate(
  receipt: ExpoReceipt | undefined,
): { status: 'accepted' | 'failed'; receiptError: string | null } | null {
  if (receipt?.status === 'ok') return { status: 'accepted', receiptError: null };
  if (receipt?.status === 'error') {
    return {
      status: 'failed',
      receiptError: receipt.details?.error ?? 'Expo receipt error',
    };
  }
  return null;
}
