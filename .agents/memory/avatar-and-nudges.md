---
name: Avatar upload + nudge push token pattern
description: How profile picture upload (GCS presigned URL) and Expo push token registration work in EverPage.
---

# Avatar upload flow

Presigned URL flow (NOT server-side multipart):
1. `POST /api/storage/uploads/request-url` (authenticated) → `{ uploadURL, objectPath }`
2. `fetch(localUri)` → blob → `PUT uploadURL` directly to GCS
3. Construct serving URL: `${getApiBase()}/storage${objectPath}` (i.e. `https://domain/api/storage/objects/uuid`)
4. `PATCH /api/social/me/avatar` with `{ avatarUrl: servingUrl }` — stores FULL URL (not just path) so client can use it directly as Image source

**Why full URL stored:** Avoids re-constructing domain on read; Image source just uses `socialProfile.avatarUrl` directly.

**api-server has no `zod` dep** — storage route uses manual `typeof` validation instead of Zod schemas.

# Expo push token registration

- `getExpoPushToken()` in `lib/notifications.ts` (Platform.OS==='web' returns null)
- Called in two places in `you.tsx`:
  1. `handleToggleNudges(true)` — after notification permission granted
  2. `useEffect([isRegistered])` — on profile load, covers existing users who already had permission

**Why two call sites:** Toggle-on covers new opt-ins; the useEffect ensures token is registered for existing users without requiring them to toggle nudges.

# Object storage in api-server

Template files live at `.local/skills/object-storage/templates/api-server/src/`. Copied to `artifacts/api-server/src/lib/objectStorage.ts` and `objectAcl.ts`. These use Replit sidecar auth — do NOT modify the GCS client setup.
