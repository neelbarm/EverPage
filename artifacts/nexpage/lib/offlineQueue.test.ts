import { test } from "node:test";
import assert from "node:assert/strict";
import { bindVerifiedCredential, canSendAccountOperation } from "./offlineQueue";
import {
  acknowledgeQueueEntity,
  localCalendarDayDistance,
  localDateKey,
  localWeekDates,
  queueEntityId,
  upsertQueueEntity,
  upsertSessionByStableId,
} from "./reliabilityPolicies";

test("an account A operation can never be sent with account B credentials", () => {
  const credentialA = { accountId: "account-a", token: "token-a" };
  const credentialB = { accountId: "account-b", token: "token-b" };

  assert.equal(canSendAccountOperation("account-a", "account-a", credentialA), true);
  assert.equal(canSendAccountOperation("account-a", "account-a", credentialB), false);
  assert.equal(canSendAccountOperation("account-a", "account-b", credentialB), false);
  assert.equal(canSendAccountOperation("account-a", "account-a", null), false);
});

test("a token is bound only after the server verifies the same user id", () => {
  assert.deepEqual(
    bindVerifiedCredential("account-a", "token-a", "account-a"),
    { accountId: "account-a", token: "token-a" },
  );
  assert.equal(bindVerifiedCredential("account-a", "token-b", "account-b"), null);
  assert.equal(bindVerifiedCredential("account-a", "token-a", null), null);
});

test("stable session saves are idempotent and failed queue sends remain recoverable", () => {
  const firstSession = {
    id: "session-stable",
    bookId: "book-a",
    durationMinutes: 12,
  };
  const retrySession = { ...firstSession, durationMinutes: 12 };
  const sessions = upsertSessionByStableId(
    upsertSessionByStableId([], firstSession),
    retrySession,
  );
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "session-stable");

  const queued = {
    id: queueEntityId("session", firstSession.id),
    accountId: "account-a",
    kind: "session" as const,
    createdAt: 1,
  };
  const replaced = { ...queued, createdAt: 2 };
  const afterRetry = upsertQueueEntity(upsertQueueEntity([], queued), replaced);
  assert.equal(afterRetry.length, 1);
  assert.equal(afterRetry[0].createdAt, 2);
  // A failed request does not acknowledge the operation, so restart
  // hydration still has exactly one pending write.
  assert.equal(upsertQueueEntity(afterRetry, replaced).length, 1);
  assert.equal(acknowledgeQueueEntity(afterRetry, queued).length, 1);
  assert.equal(acknowledgeQueueEntity(afterRetry, replaced).length, 0);
});

test("an old successful request cannot acknowledge a newer edit, even in the same millisecond", () => {
  const sent = { id: 'book:a', accountId: 'a', kind: 'book' as const, createdAt: 1, page: 10 };
  const edited = { ...sent, page: 20 };
  const pending = upsertQueueEntity([sent], edited);
  assert.deepEqual(acknowledgeQueueEntity(pending, sent), [edited]);
  assert.deepEqual(acknowledgeQueueEntity(pending, edited), []);
});

test("local calendar rollover uses local dates and keeps week boundaries stable", () => {
  const beforeMidnight = new Date(2024, 1, 29, 23, 59, 59);
  const afterMidnight = new Date(2024, 2, 1, 0, 0, 1);
  assert.equal(localDateKey(beforeMidnight), "2024-02-29");
  assert.equal(localDateKey(afterMidnight), "2024-03-01");
  assert.equal(localCalendarDayDistance("2024-03-01", "2024-02-29"), 1);
  assert.equal(localCalendarDayDistance("2024-01-01", "2023-12-31"), 1);

  const week = localWeekDates(new Date(2024, 2, 3)); // Sunday
  assert.deepEqual(week, [
    "2024-02-26",
    "2024-02-27",
    "2024-02-28",
    "2024-02-29",
    "2024-03-01",
    "2024-03-02",
    "2024-03-03",
  ]);
});
