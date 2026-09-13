import { test } from "node:test";
import assert from "node:assert/strict";
import { noteBookKey } from "./notes";
import { canonicalAvatarUrl, expoReceiptState, normalizeExpoTickets } from "./social";
import {
  canReadRoomMessages,
  claimResetToken,
  expoReceiptPersistenceUpdate,
  findReusableRoom,
  isClaimableResetToken,
  revokeUserSessions,
} from "../lib/reliabilityPolicies";
import {
  isMatchingUploadedMetadata,
  isOwnedAvatarUpload,
  validateUploadRequest,
} from "./storage";

test("legacy avatar request remains transitional but assignment stays owner and metadata bound", () => {
  assert.equal(validateUploadRequest({
    name: "avatar.jpg",
    size: 0,
    contentType: "image/jpeg",
  }).ok, true);

  const legacyUpload = {
    ownerId: "account-a",
    declaredSize: 0,
    declaredContentType: "image/jpeg",
  };
  assert.equal(isOwnedAvatarUpload(legacyUpload, "account-a"), true);
  assert.equal(isOwnedAvatarUpload(legacyUpload, "account-b"), false);
  assert.equal(isMatchingUploadedMetadata(
    legacyUpload,
    { size: 2048, contentType: "image/jpeg" },
  ), true);
  assert.equal(isMatchingUploadedMetadata(
    legacyUpload,
    { size: 2048, contentType: "text/html" },
  ), false);
  assert.equal(isMatchingUploadedMetadata(
    legacyUpload,
    { size: 11 * 1024 * 1024, contentType: "image/jpeg" },
  ), false);
});

test("avatar assignment canonicalizes the API origin and rejects attacker origins", () => {
  const origin = "https://nex-page.replit.app";
  assert.equal(
    canonicalAvatarUrl(
      "https://nex-page.replit.app/api/storage/objects/uploads/abc",
      origin,
    ),
    "https://nex-page.replit.app/api/storage/objects/uploads/abc",
  );
  assert.equal(
    canonicalAvatarUrl(
      "https://attacker.example/api/storage/objects/uploads/abc",
      origin,
    ),
    null,
  );
  assert.equal(
    canonicalAvatarUrl(
      "https://attacker.example/redirect?next=/storage/objects/uploads/abc",
      origin,
    ),
    null,
  );
});

test("unknown-author note requests only share the legacy empty-author identity", () => {
  assert.equal(noteBookKey("The Gift"), noteBookKey(" the gift ", ""));
  assert.notEqual(noteBookKey("The Gift"), noteBookKey("The Gift", "Author One"));
  assert.notEqual(
    noteBookKey("The Gift", "Author One"),
    noteBookKey("The Gift", "Author Two"),
  );
});

test("Expo object and array ticket formats normalize without claiming display", () => {
  const ticket = { status: "ok", id: "ticket-1" };
  assert.deepEqual(normalizeExpoTickets(ticket), [ticket]);
  assert.deepEqual(normalizeExpoTickets([ticket]), [ticket]);
  assert.equal(expoReceiptState({ status: "ok" }), "accepted");
  assert.equal(expoReceiptState({ status: "error", details: { error: "DeviceNotRegistered" } }), "failed");
  assert.equal(expoReceiptState(undefined), "queued");
});

test("reset token claim is one-use, unexpired, and safe under a retry race", () => {
  const issuedAt = new Date("2026-01-01T00:00:00.000Z");
  const expiresAt = new Date("2026-01-01T01:00:00.000Z");
  const token = {
    tokenHash: "hash-a",
    userId: "account-a",
    expiresAt,
    usedAt: null,
  };

  assert.equal(isClaimableResetToken(token, issuedAt), true);
  const firstClaim = claimResetToken(token, new Date("2026-01-01T00:05:00.000Z"));
  assert.ok(firstClaim);
  // The second request observes the first request's used_at transition and
  // cannot update the password a second time.
  assert.equal(claimResetToken(firstClaim, new Date("2026-01-01T00:05:01.000Z")), null);
  assert.equal(claimResetToken(token, expiresAt), null);
});

test("session revocation removes every session for the changed or deleted account", () => {
  const sessions = [
    { sid: "a-1", sess: { user: { id: "account-a" } } },
    { sid: "a-2", sess: { user: { id: "account-a" } } },
    { sid: "b-1", sess: { user: { id: "account-b" } } },
    { sid: "malformed", sess: {} },
  ];
  assert.deepEqual(
    revokeUserSessions(sessions, "account-a").map((session) => session.sid),
    ["b-1", "malformed"],
  );
});

test("room messages require membership and room creation reuses the same normalized book", () => {
  assert.equal(canReadRoomMessages([], "account-a"), false);
  assert.equal(canReadRoomMessages(["account-b"], "account-a"), false);
  assert.equal(canReadRoomMessages(["account-a"], "account-a"), true);
  const existingRoom = { id: "room-1", bookTitle: "  The  Left Hand of Darkness ", bookAuthor: "" };
  assert.equal(findReusableRoom([existingRoom], "the left hand of darkness", "Ursula Le Guin"), existingRoom);
  assert.equal(findReusableRoom([existingRoom], "the left hand of darkness", "Ursula Le Guin"), existingRoom);
  assert.equal(
    findReusableRoom(
      [
        { bookTitle: "The Left Hand of Darkness", bookAuthor: "Other Author" },
      ],
      "the left hand of darkness",
      "Ursula Le Guin",
    ),
    undefined,
  );
});

test("Expo receipt persistence distinguishes accepted, failed, and still-pending tickets", () => {
  assert.deepEqual(
    expoReceiptPersistenceUpdate({ status: "ok" }),
    { status: "accepted", receiptError: null },
  );
  assert.deepEqual(
    expoReceiptPersistenceUpdate({ status: "error", details: { error: "DeviceNotRegistered" } }),
    { status: "failed", receiptError: "DeviceNotRegistered" },
  );
  assert.deepEqual(
    expoReceiptPersistenceUpdate({ status: "error" }),
    { status: "failed", receiptError: "Expo receipt error" },
  );
  assert.equal(expoReceiptPersistenceUpdate(undefined), null);
  assert.equal(expoReceiptPersistenceUpdate({ status: "ok", details: { error: "ignored" } })?.status, "accepted");
});
