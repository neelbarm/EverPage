---
name: lib/db rebuild pattern
description: How to correctly rebuild lib/db TypeScript declarations after schema changes
---

After changing any file in `lib/db/src/`, you must rebuild the composite project declarations before other packages pick up the new types.

**The rule:** Use `pnpm exec tsc --build tsconfig.json --force` from `lib/db/`. Plain `--build` reuses incremental cache and will silently skip re-emitting changed files.

**Why:** `lib/db` uses `composite: true` + `emitDeclarationOnly: true`. TypeScript project references read from `dist/*.d.ts`, not from `src/`. If `dist/` is stale or partially deleted, `--build` may see timestamps as up-to-date and skip emission. `--force` ignores timestamps.

**How to apply:** Any time you edit `lib/db/src/schema/*.ts` or `lib/db/src/index.ts`, run:
```bash
cd lib/db && pnpm exec tsc --build tsconfig.json --force
```
Then re-run `typecheck` in consuming packages (e.g. `artifacts/api-server`).
