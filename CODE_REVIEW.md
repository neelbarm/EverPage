# EverPage code review

Reviewed local GitHub snapshot `01ec88a2040a319d2fd436c702b7c57d62f62567` (app version 1.0.4). This is a source review, not certification of the deployed binary. Email/domain setup remains paused at the user's request. No application changes or deployment were made during this review.

## Validation and scope

- `pnpm run typecheck`: passed across libraries, API, mobile app, scripts, and mockup sandbox.
- `pnpm --filter @workspace/api-server build`: passed.
- No automated behavioral test suite was found in the app/API package files inspected.
- Reviewed authentication, password recovery, database schemas, bookshelf persistence, timer/session logging, statistics, recommendations, room access, notification registration/delivery, notes, reports, and file serving. Generated files, image assets, and unrelated `pluely/` were excluded from substantive review.
- No real accounts were modified, messages sent, production data queried, or phone-delivery tests performed in this review.

## High-priority findings

### 1. Local reading data is shared between accounts

`artifacts/nexpage/context/StoreContext.tsx:293`, `:366`, `:407`, `:470`; `artifacts/nexpage/lib/auth.tsx:184`.

The shelf and cloud-initialization marker use device-wide keys, and the store observes only the authenticated boolean, not the user ID. Logout clears the token but not reading state. When another account with an empty cloud shelf logs in, hydration leaves the previous reader's data visible; if the initialization marker is absent, it can upload that data to the new account. Profile counters and reminders are also retained.

Fix: key persistent data and initialization by account, reset state on account changes, reject stale in-flight responses, and explicitly distinguish guest-data import from account switching. Verify with two accounts on one device, including an empty second account.

### 2. Offline sessions can disappear after cloud hydration

`artifacts/nexpage/context/StoreContext.tsx:470`, `:515`, `:529`, `:568`.

Failed writes are swallowed with no durable retry queue. On the next authenticated startup, any existing cloud data replaces local books and sessions wholesale. A session logged offline is therefore discarded if it never reached the server. The initialization flag is also written before its uploads succeed. Foreground reconciliation recomputes local totals but does not retry those writes.

Fix: persistent pending-operation queue, idempotent session IDs, retry on reconnection, and merge unsynced records before accepting cloud data. Test offline log -> restart -> reconnect, plus a cloud response arriving during local logging.

### 3. Expo push tickets are parsed incorrectly

`artifacts/api-server/src/routes/social.ts:612`.

The API sends one message object to one token but reads the response as `result.data[0]`. Expo documents an object ticket for that request shape. An accepted notification can consequently be reported as unavailable; object-form token errors are also ignored. This does not establish why every previously reported notification failed, because the message may still be delivered despite the incorrect result handling.

There is also no receipt-processing path in the inspected source, so failures reported later by Apple/Google remain invisible. A nudge record and its cooldown are created before delivery is attempted, including when sending throws.

Fix: normalize object/array tickets, retain ticket IDs, inspect receipts, and distinguish queued, failed, and in-app delivery. Verify success/error response fixtures and perform a real-device test with the production EAS/APNs configuration.

Reference: https://docs.expo.dev/push-notifications/sending-notifications/

### 4. Room messages can be read without membership

`artifacts/api-server/src/routes/rooms.ts:246`.

The GET messages endpoint treats a missing membership as page zero instead of rejecting access. An authenticated nonmember who knows a room code can read messages tagged page zero. Posting correctly checks membership, making the read/write authorization inconsistent. The room detail route also exposes member information before joining; confirm whether that preview is intentional.

Fix: require membership before returning messages, with explicit authorization tests. Review block behavior inside rooms as well.

### 5. Weekly and lifetime statistics drift from saved sessions

`artifacts/nexpage/context/StoreContext.tsx:615`; `artifacts/nexpage/app/(tabs)/stats.tsx:132`; `artifacts/api-server/src/routes/social.ts:350`.

Daily totals are now derived from dated sessions, which is an improvement. However, weekly counters simply accumulate into weekday buckets and weekly pages without a week reset. Cloud hydration restores sessions but retains local profile counters, so a new device can show zero lifetime statistics despite existing sessions. The friends leaderboard uses a separately posted activity table and server-local day boundaries, unlike the shelf's session dates. Partial network failures and midnight boundaries can make these disagree.

Fix: derive weekly/lifetime statistics from sessions; define one calendar/timezone rule; create social activity atomically with the session or through a retryable event process.

### 6. Session logging allows duplicate submissions

`artifacts/nexpage/app/session-log/[bookId].tsx:35`; `artifacts/nexpage/context/StoreContext.tsx:568`.

The save button has no in-flight guard. Each call creates a new session ID, so repeated taps during network waits can create multiple cloud sessions/activity entries. Stale state snapshots can also cause local and cloud totals to disagree.

Fix: disable/guard save synchronously, use a stable session ID from timer start through final save, and make activity publication idempotent.

### 7. Reset-token consumption is not atomic

`artifacts/api-server/src/routes/local-auth.ts:280`.

A valid unused reset token is selected before the transaction. Two concurrent submissions can both pass that check, and the later transaction can overwrite the password even though the first consumed the token. The transaction's token update does not require `used_at IS NULL`.

Fix: atomically claim the unexpired unused token inside the same transaction before changing the password, returning an error if no row is claimed. Test two concurrent requests with one token. This review does not resume external email setup.

## Additional confirmed issues and follow-up checks

- **Room button regression on network error:** `app/book/[bookId].tsx:134` clears known membership when its lookup fails. Existing readers can see Create Room again. Retain known membership and show a retry state for unknown membership.
- **Timer draft loss:** `app/session/[bookId].tsx:126` removes the persisted timer before the log form is saved. Killing the app on that form loses the draft. Opening another book also overwrites the sole saved timer. Persist through completion and offer explicit resume/discard behavior.
- **Forced page/minute credit:** timer logging floors duration with a minimum of one minute; the log form forces at least one additional page. A short session or rereading without advancing can overstate progress. Define and implement the intended counting rules.
- **Account deletion leaves other sessions valid:** `routes/local-auth.ts:419` deletes only the current session after account removal. Session middleware trusts stored session JSON without checking that the user still exists. Revoke every session transactionally and ensure deleted identities cannot recreate data using an old token.
- **Auth endpoint protections:** no application-level login/reset throttling was found. Registration/login also assume string types, so malformed requests can throw. Add explicit input schemas, reasonable bounds, async password hashing, and appropriate rate limits; check hosting protections separately.
- **False logout on service errors:** `lib/auth.tsx:76` deletes a saved token whenever a parsed response lacks `user`, including a JSON server error. Only confirmed authentication failures should clear credentials; network/server failures need a retry state.
- **Private object access not enforced:** `routes/storage.ts:61` serves object paths without checking authentication or object ACL. The storage helper reads ACL only for cache headers. Public avatars may be intended, but any private object served through this route is accessible to someone with its path. Enforce visibility/ownership and validate upload size/type.
- **Notes use title only:** `routes/notes.ts:21` ignores book author in retrieval, potentially mixing different books with the same title.
- **Recommendations:** expansion is wired to render beyond three cards, and ranking genuinely uses reading minutes by genre. The candidate pool is nevertheless an unordered maximum of 2,000 other shelf rows, with exact genre matching; this limits relevance as data grows. No live visual test was performed.
- **Reset email links:** currently use only an `everpage://` link. Test real mail clients and the installed 1.0.4 build; a secure HTTPS fallback would support users without the updated app and browsers that do not open the custom scheme.

## Recommended work order

1. Account isolation, durable sync, duplicate-session prevention, and session revocation.
2. Room authorization and private-file handling.
3. Push-ticket/receipt handling and real-device delivery diagnostics.
4. Session-derived statistics and timer draft recovery.
5. Reset-token atomicity and auth validation/throttling.
6. Focused regression tests, followed by a controlled TestFlight pass. Resume domain verification only when authorized by the user.

Passing compilation is useful but does not resolve these behavior and authorization findings. These items remain unfixed in this audit.
