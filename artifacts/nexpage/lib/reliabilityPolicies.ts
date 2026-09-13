export type QueueEntityKind = 'book' | 'session' | 'streak';

export type QueueEntity = {
  id: string;
  accountId: string;
  kind: QueueEntityKind;
  createdAt: number;
};

/**
 * Queue IDs are stable entity keys, not attempt keys. Replaying a save after
 * an interrupted request therefore replaces the pending copy rather than
 * creating a second write.
 */
export function queueEntityId(kind: QueueEntityKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

export function upsertQueueEntity<T extends QueueEntity>(queue: T[], operation: T): T[] {
  return [...queue.filter((item) => item.id !== operation.id), operation];
}

export function acknowledgeQueueEntity<T extends QueueEntity>(queue: T[], operation: T): T[] {
  // An in-flight request owns this exact immutable queue entry. A newer
  // edit may have replaced it under the same stable entity ID meanwhile.
  return queue.filter((item) => item !== operation);
}

export function upsertSessionByStableId<T extends { id: string }>(
  sessions: T[],
  incoming: T,
): T[] {
  return sessions.some((session) => session.id === incoming.id)
    ? sessions
    : [...sessions, incoming];
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localWeekDates(today = new Date()): string[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = monday.getDay() === 0 ? 6 : monday.getDay() - 1;
  monday.setDate(monday.getDate() - day);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return localDateKey(date);
  });
}

export function localCalendarDayDistance(later: string, earlier: string): number | null {
  const parse = (value: string): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1])
      && date.getMonth() === Number(match[2]) - 1
      && date.getDate() === Number(match[3])
      ? date
      : null;
  };
  const laterDate = parse(later);
  const earlierDate = parse(earlier);
  if (!laterDate || !earlierDate) return null;
  return (
    Date.UTC(laterDate.getFullYear(), laterDate.getMonth(), laterDate.getDate())
    - Date.UTC(earlierDate.getFullYear(), earlierDate.getMonth(), earlierDate.getDate())
  ) / 86400000;
}
