---
name: Replit Auth mobile OIDC wiring
description: How Replit Auth is wired for the Expo mobile app in this project
---

**Architecture:** Replit OIDC (PKCE) via expo-auth-session → server token-exchange → SecureStore → Bearer header

**Flow:**
1. `AuthProvider` (`artifacts/nexpage/lib/auth.tsx`) uses `expo-auth-session` PKCE flow with `clientId = EXPO_PUBLIC_REPL_ID`
2. On success, sends `code + code_verifier` to `POST /api/mobile-auth/token-exchange`
3. Server (`routes/auth.ts`) validates with Replit OIDC, upserts into `users` table, creates session in `sessions` table, returns `{ token: sid }`
4. Mobile stores `sid` in `expo-secure-store` under key `auth_session_token`
5. All subsequent API calls include `Authorization: Bearer <sid>` header
6. `authMiddleware` validates Bearer token by looking up `sessions` table

**Key env vars (shared):**
- `EXPO_PUBLIC_DOMAIN` → API hostname (set to `$REPLIT_DEV_DOMAIN` value)
- `EXPO_PUBLIC_REPL_ID` → OIDC client_id (set to `$REPL_ID` value)

**Note:** Expo start command already injects `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN` and `EXPO_PUBLIC_REPL_ID=$REPL_ID` so the shared env vars are redundant at runtime but useful as documented fallback.

**Social layer:** `SocialContext` reads the SecureStore token via `getAuthToken()` and attaches `Authorization: Bearer` to every social API call. Social routes use `req.isAuthenticated()` + `req.user.id` (OIDC `sub`). `np_users.id` = OIDC user ID directly (no device_id column).

**Why:** Device-ID auth was rejected by code review as spoofable (broken access control). Replit Auth OIDC is the correct replacement.
