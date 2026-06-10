# Current Sprint

## Current Goal

Stand up the AI Logo Generator foundation — backend libs and API routes — so the
non-negotiables (server-side AI, persistent gallery, concurrency, the three
failure states) are correct before the wizard UI is built on top.

## Current Task

**Seq 11 — `GET /api/images/[filename]`** · Area: Backend · Priority: P0 · Status: To Do

Serve stored image bytes via `storage.readImage` (safe-filename + traversal
guard): 200 with correct `Content-Type` + cache headers, 404 when absent, 400
on an invalid filename. Dynamic param via Next 16 `RouteContext`/awaited
`params`. Per `docs/architecture.md` §8.

## Next Task

**Seq 13 — `GET /api/gallery` (paginated, persisted)** · Area: Backend · Priority: P0

Serve the persisted gallery (every saved concept, newest first) so the frontend
can hydrate on load and survive refresh — the persistence non-negotiable.
Re-generation (`Seq 12 — POST /api/refine`) follows once persistence is proven.

## Done This Sprint

- **Seq 1 — Scaffold Next.js 16 app (TS, Tailwind v4, ESLint)** ✅ 2026-06-11
  `create-next-app`: Next 16.2.9, React 19.2.4, Tailwind v4, ESLint 9, TS 5,
  `src/` App Router, `@/*` alias. Verified lint clean + prod build clean.
- **Seq 2 — Configure env + `.env.example`** ✅ 2026-06-11
  Added `.env.example` (required `MISTRAL_API_KEY`; optional `MISTRAL_AGENT_ID`,
  `STORAGE_DIR`, `DATABASE_PATH`). Added `!.env.example` to `.gitignore` so the
  template commits while `.env.local` stays ignored.
- **Seq 3 — Define shared contract in `lib/types.ts`** ✅ 2026-06-11
  `LogoBrief`, 11 traits (max 3), 5 styles, refinement directives + color/icon/
  font changes, download formats, `LogoConcept` (mirrors `gallery`), API
  request/response shapes, 6 error codes + `ApiError`/`isApiError`. Client-safe;
  `tsc --noEmit` + lint clean.
- **Seq 4 — `lib/http.ts` + `lib/errorCopy.ts`** ✅ 2026-06-11
  `errorCopy.ts`: `ERROR_COPY` map + `getErrorCopy` (client-safe). `http.ts`
  (server-only): code→HTTP status map, `ApiException`, `jsonOk`/`jsonError`/
  `toErrorResponse`, `parseJsonBody`. lint + build clean.
- **Seq 5 — SQLite layer `lib/db.ts` (WAL)** ✅ 2026-06-11
  `better-sqlite3` ^12.10 WAL + `busy_timeout`, `gallery` table +
  `created_at` index, prepared-statement insert/list/count/get. External in
  `next.config.ts`; `/storage` gitignored. lint + build + runtime smoke clean.
- **Seq 6 — filesystem `lib/storage.ts` (atomic, magic-byte)** ✅ 2026-06-11
  `saveImage` (UUID stem, atomic temp+rename, magic-byte typing for
  png/jpg/webp/gif), `readImage` (safe-filename regex + resolve-inside-root
  guard). lint + build + smoke (incl. 4 traversal rejections) clean.
- **Seq 7 — Mistral service `lib/ai.ts` (Agents API)** ✅ 2026-06-11
  Agent ensure/cache (env override + dedup), `generateImage`
  (conversation → `file_id` → file bytes), AbortController timeouts →
  TIMEOUT/NO_IMAGE/UPSTREAM_ERROR, `isConfigured()`. lint + build clean;
  live calls deferred (no key).
- **Seq 8 — prompt builder `lib/prompt.ts`** ✅ 2026-06-11
  `validateBrief` (single source of truth: bounds, ≤3 traits, valid style),
  `buildConceptPrompts` (12 distinct directions), `buildRefinePrompt`,
  AI-choose color inference. lint + build + unit smoke clean.

- **Seq 9 — `GET /api/health`** ✅ 2026-06-11
  Liveness + `aiKeyConfigured` (`isConfigured()`), `force-dynamic`. Verified
  lint + build + live curl (false without key, true with key).
- **Seq 10 — `POST /api/generate` (12 concepts)** ✅ 2026-06-11
  Full pipeline: validate → 12 prompts → bounded-parallel generate → atomic
  store → DB record → `GenerateResponse`; partial-success tolerant. Hardened
  `http.ts` (`ApiException.publicMessage` — no internal detail leaks). Verified
  lint + build + live curl (INVALID_REQUEST / INVALID_PROMPT / UPSTREAM_ERROR
  paths). Happy path pending real `MISTRAL_API_KEY`.

### Milestone: backend/AI lib layer (Seq 1–8) complete — routes underway.

## Blockers

None
