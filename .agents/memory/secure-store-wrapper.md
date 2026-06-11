---
name: SecureStore native bridge fix
description: expo-secure-store v15 crashes in Expo Go with "setValueWithKeyAsync is not a function"; use a wrapper with AsyncStorage fallback
---

## Rule
Never call `expo-secure-store` directly in app code. Always go through `@/lib/storage` (getItem/setItem/deleteItem).

**Why:** expo-secure-store v15 (SDK 54) calls a native method `setValueWithKeyAsync` that is missing in some Expo Go builds, throwing a hard crash. The wrapper probes availability once (caches result in module-level `_available`) and falls back to AsyncStorage.

**How to apply:**
- `lib/storage.ts` is the single place where `expo-secure-store` is imported
- All other files that need token storage import `{ getItem, setItem, deleteItem }` from `@/lib/storage`
- Affected files: `lib/auth.tsx`, `context/StoreContext.tsx`, `context/SocialContext.tsx`, `lib/api.ts`, `app/profile/[userId].tsx`
- If a new file needs the auth token, import from `@/lib/storage`, never from `expo-secure-store` directly
