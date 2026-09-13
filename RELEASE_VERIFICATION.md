# EverPage reliability release verification

Status: backend deployed and verified September 13; iOS build/submission awaits
the user's Apple sign-in inside Replit's Expo Launch wizard.

## Deployed source and verification

- GitHub main/review branch app-source revision: `2f8ecd614463a9df47231f8ef3d1b1cd240b1f31`.
- Replit merged app-source revision: `acfcd9426c77bf87af64565f7726225295306a72`.
- Replit confirmed clean working tree and passing mobile/API/database checks.
- Reviewed generated production SQL: exactly the three additive tables and
  their constraints/indexes; no existing-data overwrite option selected.
- Replit reported Published/Live; publish history includes `eb85830d`.
- Production `/api/healthz`: HTTP 200, `{ "status": "ok" }`.
- Non-mutating malformed login probe: HTTP 400 with controlled validation error.
- Production Database overview confirms `np_auth_rate_limits`,
  `np_push_deliveries`, and `np_storage_uploads`; pre-existing table counts
  observed in the overview remained unchanged during this check.
- Local browser also confirmed room navigation after reload opens the same
  room through “Go to room.”
- Replit's aggregate workspace typecheck has a React type-version conflict in
  `artifacts/mockup-sandbox/src/components/ui/calendar.tsx:132`. API/mobile/DB
  checks pass and that design artifact is not in the production build.
- Local test API, Expo server, and disposable Postgres instance stopped.

Baseline GitHub commit: `01ec88a2040a319d2fd436c702b7c57d62f62567`.
Target review branch: `codex/reliability-review` (imports Replit candidate plus independent fixes).
Email-domain verification is paused. Do not treat recovery email as operational.

## Apple release preparation

App Store Connect inspected September 13: current live version is 1.0.3 build 7;
TestFlight has no newer upload. Created 1.0.4 draft (Prepare for Submission),
preserving existing metadata and automatic-after-approval release settings.
No build attached and no submission made. Accurate release notes are saved.
The Replit Expo Launch wizard selected the existing EverPage project, then
requested a separate Apple Developer login. User input was requested; no
credential was guessed or changed. App Store Connect remains signed in.

## Release gates

### Local verification completed September 13

- Full workspace typecheck and API production build passed.
- iOS Expo/Hermes export passed (this is not a signed App Store build).
- `node scripts/test-reliability.mjs`: 16 policy/storage-fake tests passed.
- `node scripts/test-mobile-store.mjs`: 8 behavioral cases passed against real
  StoreProvider/AuthProvider components (10 Node test entries including parents).
  Covers offline outbox recovery, credential retry, same-entity acknowledgement
  races, delayed hydration, account switching, cached identity, 503 vs 401,
  and refusing another token's cached identity.
- `scripts/release-api.integration.mjs`: 8 behavioral cases passed against a
  disposable local Postgres database and actual API (9 entries including parent).
  Covers concurrent session/activity idempotency, concurrent room creation,
  membership enforcement, concurrent nudges without device tokens, dated
  leaderboard/Monday rollover, atomic reset, and session revocation on deletion.
- Additional independent corrections after Replit review: immutable-entry queue
  acknowledgements; account provider remount; token-bound social requests; offline
  identity cache/retry; outbox overlay on cold start; hydration mutation guard;
  nudge concurrency/retry; preserve previously delivered reset links on mail failure.
- Local browser smoke checks: complete birthday entry, test-account sign-in,
  book added at page 50 with no reading credit, recommendation expansion and
  science-fiction matching explanation, timer restored after page reload,
  short-session save with zero forced minutes/pages, and matching shelf/Stats totals.
  Corrected goal copy to distinguish reaching the daily goal from logging a streak day.
  These are web checks and do not certify iOS force-quit or notification display.

The checklist below remains the broader release/device checklist. A test above
does not imply every platform/device variation below has been manually tested.

- [ ] Review the actual diff and preserve existing Replit/Expo/Apple identities.
- [ ] Account A -> logout -> empty account B never exposes or uploads A's data.
- [ ] A delayed A request cannot mutate B's state or use B's credentials.
- [ ] Offline session survives process restart and uploads exactly once.
- [ ] Hydration arriving during a save preserves both cloud and pending local data.
- [ ] Partial queue failure retains unacknowledged operations and preserves order.
- [ ] Double save creates one durable session and one social activity event.
- [ ] Timer survives background/restart and log-form abandonment until saved/discarded.
- [ ] Zero-page sessions and short elapsed durations do not fabricate progress.
- [ ] Local-day and Monday-week boundaries agree across shelf, stats and friends.
- [ ] Previously joined room remains identifiable on transient lookup failure.
- [ ] Nonmember cannot retrieve room messages; concurrent create is idempotent.
- [ ] Private object reads enforce ACL; public legacy avatars remain functional.
- [ ] Concurrent reset requests permit one successful token claim only.
- [ ] Deleted account and password-change sessions are revoked as intended.
- [ ] Malformed auth inputs return controlled errors; transient errors preserve login.
- [ ] Expo object/array tickets and delayed receipts cover success and error cases.
- [ ] Notification status does not equate provider acceptance with device display.
- [ ] Notes disambiguate author and title; recommendations display truthful reasons.
- [ ] Full typecheck, API build, mobile bundle and behavioral regression tests pass.
- [ ] Review additive migration SQL before production application.
- [ ] Replit confirms exact reviewed source revision before backend publishing.
- [ ] Production health and expected migration schema verified after deployment.
- [ ] iOS build version/number verified against App Store Connect before submission.

## Separate external checks

Push delivery needs a permitted real-device test and valid production APNs/EAS
credentials. Compilation and mocked Expo responses alone do not prove delivery.
Even an Expo receipt with status `ok` means Apple/Google accepted the notification,
not that the user's phone displayed it. See Expo's sending-notifications docs.
Password-reset mail needs a verified sender domain and configured EMAIL_FROM;
that setup remains explicitly paused pending the client's domain access.
App Store submission and Apple approval are distinct from backend deployment.
