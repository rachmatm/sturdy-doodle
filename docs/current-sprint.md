# Current Sprint

## Current Goal

Backend + frontend are **complete and verified in a real browser** (2026-06-12
in-browser QA pass). The full product loop and the three failure states are proven
through the UI. The only remaining work is **deployment** (needs a host) plus two
quota/load-gated checks (refine happy-path against a real key; concurrency under
real simultaneous load).

## Current Task

**Deploy to a persistent-disk host + set live URL** · Area: Ops · Priority: P1 · Status: To Do

Deploy to a host with a persistent volume (`STORAGE_DIR` + `DATABASE_PATH` on the
mount); set `MISTRAL_API_KEY`; record the live URL in `project-memory.md`.
Requires a host (user-provided). Per `docs/architecture.md` §10.

## Next Task

**Refine happy-path + concurrency, against the deployed app** · Area: QA · Priority: P2

Once deployed (or when the free-tier image quota resets), confirm TC-REF-001..003
(refine adds new variations, original stays) and TC-CON-001 (two concurrent
clients). Both are quota/load-gated, not code gaps. Per `docs/test-plan.md`.

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

- **Seq 11 — `GET /api/images/[filename]`** ✅ 2026-06-11
  Serve stored bytes via `storage.readImage` (safe-filename + traversal guard):
  correct `Content-Type` + cache headers, 404 absent, 400 invalid filename.
  lint + build clean.
- **Seq 13 — `GET /api/gallery` (paginated, persisted)** ✅ 2026-06-11
  `concepts`/`total`/`nextOffset` response from `listConcepts`/`countConcepts`,
  newest-first; `limit` (default 24, max 100) + `offset` query params; malformed
  params → `INVALID_REQUEST` (400); `force-dynamic` so it always reflects the DB.
  Verified live: empty-state, pagination + `nextOffset` cursor, newest-first
  ordering (seeded temp DB), and the 400 validation path. lint + tsc clean.

- **Seq 12 — `POST /api/refine` (re-generate from a saved concept)** ✅ 2026-06-11
  Loads a saved concept, validates the tweak (≥1 of directive/change; empty →
  `INVALID_PROMPT`), rebuilds the prompt via `buildRefinePrompt`, regenerates 4
  variations and saves them with `refinedFrom`/`directive`/`change` in `params`;
  original is untouched (TC-004). Partial-success tolerant; nothing partial saved
  when all fail. Verified live (curl): malformed JSON, missing `conceptId`, empty
  tweak, bad directive, unknown concept, concept-without-brief, and full pipeline
  → typed `UPSTREAM_ERROR` (502) with no key. lint + tsc + build clean.

- **Seq 14 — `GET /api/download` (PNG)** ✅ 2026-06-11
  Exports a saved logo by `id` as a PNG attachment: looks up the concept, reads
  bytes via `storage.readImage` (reusing the traversal guard), and sets
  `Content-Disposition: attachment` with a friendly filename slugged from the
  business name + id suffix. Extension comes from the magic-byte content type, so
  it never mislabels the bytes. Premium formats (svg / png-transparent / favicon)
  are rejected as "not available yet" rather than faked (PRD §5.2, §9). Verified
  live (curl): missing id, unknown id, premium-format rejection, and the happy
  path (200, attachment headers, valid PNG matching stored bytes). lint + tsc +
  build clean.

### Milestone: backend complete — all 6 API routes done and verified. The full
server pipeline (generate → store → gallery → refine → download) is provable
end-to-end. Next: the wizard/gallery UI, starting with the persistent gallery.

- **Seq 20 — persistent gallery view + hydrate on load** ✅ 2026-06-11
  First frontend task. `components/Gallery.tsx` (`'use client'`) hydrates from
  `GET /api/gallery` on mount and renders loading / retryable-error / empty /
  grid states with `nextOffset` "Load more" pagination; `components/LogoCard.tsx`
  shows each concept via `next/image` (same-origin `/api/images`, `unoptimized`).
  `page.tsx` is now a server shell with the app header + `<Gallery/>`; replaced
  the create-next-app scaffold and fixed placeholder `metadata`. Because the
  gallery holds no client source of truth, a refresh re-fetches the persisted
  records (FR-4 / TC-003). lint + tsc + build clean. Verified: server shell HTML
  (header + loading state), empty-state API, and the full data path a seeded
  concept renders from (gallery listing + image bytes). **Visual render in a real
  browser not yet confirmed** — no headless browser here; check with `npm run dev`.

- **Wizard shell + steps 1–3 (brief collection)** ✅ 2026-06-11
  `components/Wizard.tsx` (`'use client'`) — client state machine owning the brief
  + current step, per-step validation gating Next/Generate, Back/Next nav, and a
  3-step progress indicator. Presentational steps: `BusinessInfoStep` (name +
  description, char counts, inline errors, length bounds from `prompt.ts`),
  `PersonalityStep` (trait chips capped at `MAX_TRAITS`, optional), `StyleStep`
  (single-select cards from `LOGO_STYLES`, one required). Output is the validated
  `LogoBrief` via an `onSubmit` prop; `submitting` prop reserved for the generate
  call. Covers TC-005/006/007 validation at the UI layer. lint + tsc + build
  clean. **Not yet mounted** — `page.tsx` wiring + the generate call land in the
  next task so the button does real work when it appears.

### Milestone: frontend wizard built — brief collection (steps 1–3) is complete
and validated; next it gets mounted and wired to the generate pipeline.

- **Generate + meaningful loading state** ✅ 2026-06-11
  Wired the create loop end-to-end and mounted the UI. New `components/
  LogoStudio.tsx` host (architecture §3) owns the gallery + generating state;
  `Gallery.tsx` refactored to presentational (data via props). Wizard `onSubmit`
  → `POST /api/generate`; results **prepend** to the gallery (newest first) and
  bump the count. New `GeneratingCard.tsx` shows the 10–30s wait as expected
  (C4 / FR-7) without blocking the gallery. A failed generation surfaces a typed
  message and leaves the gallery + prior results untouched (C5). `page.tsx` now
  renders `<LogoStudio/>` in a two-column layout (replaces direct `<Gallery/>`).
  lint + tsc + build clean. Verified live: page server-renders wizard step 1 +
  gallery shell; `/api/generate` empty brief → `INVALID_PROMPT` 400; valid brief
  (no key) → typed `UPSTREAM_ERROR` 502 with the gallery intact. **Browser
  interaction (step nav, spinner, prepend) not yet visually confirmed** — check
  with `npm run dev`.

### Milestone: core create loop wired — brief → generate → loading → persistent
gallery works at the API layer and is mounted; next is the shared retryable
`ErrorBanner` for the three failure states.

- **`ErrorBanner` + three retryable failure states** ✅ 2026-06-11
  New `lib/apiClient.ts` (`ClientApiError` + `requestJson`) preserves the API's
  `{error,code}` on the client so the UI branches on the *kind* of failure, not a
  bare string. New `components/ErrorBanner.tsx` renders a retryable state keyed on
  `ErrorCode`: invalid-prompt frames as "fix your brief" (retry hidden; the wizard
  stays interactive), while timeout / no-image / upstream / internal offer a retry.
  `LogoStudio` now stores the typed generate error + the last brief, renders
  `ErrorBanner` (retry re-runs the same brief; dismiss clears it), and routes its
  gallery + generate fetches through `requestJson`. Gallery untouched on error
  (C5 / FR-6 / TC-008–009). lint + tsc + build clean (one transient Google-Fonts
  fetch failure on first build; passed on retry). Verified live: `INVALID_PROMPT`
  and `UPSTREAM_ERROR` codes still flow to the page. **Banner retry/dismiss not yet
  exercised in a browser** — check with `npm run dev`.

### Milestone: failure handling complete — the three required retryable states are
surfaced via a shared `ErrorBanner`; next is per-card select + PNG download.

- **Concept card actions — select + download** ✅ 2026-06-11
  `LogoCard` now has a selectable image region (`aria-pressed`, ring when
  selected) and a **Download** link — a plain anchor to `GET /api/download?id=`
  with the `download` attr; the route returns the bytes as an attachment so no JS
  fetch is needed (FR-8). Selection state lives in `LogoStudio` (`selectedId`,
  toggle on re-click) and threads through `Gallery` → `LogoCard`; it feeds the
  refine flow next. lint + tsc + build clean. Verified live: the card's download
  href returns 200 + `Content-Disposition: attachment` + valid PNG, and the
  gallery API exposes the concept the grid maps. **Click-through (select ring,
  download trigger) not yet confirmed in a browser** — check with `npm run dev`.

### Milestone: usable-asset loop closed — any saved logo can be selected and
downloaded as PNG; next is re-generation from a selected concept (refine toolbar).

- **Refine toolbar — re-generate from a saved concept** ✅ 2026-06-11
  New `components/RefineToolbar.tsx` appears when a concept is selected: directive
  chips (`REFINEMENT_DIRECTIVES`) + "Different color/icon/font" (`REFINEMENT_
  CHANGE_TARGETS`), emitting a `{directive}|{change}` refinement (no free text, so
  an empty tweak can't be triggered from the UI). `LogoStudio` now has `runRefine`
  → `POST /api/refine` reusing the generate path's busy flag, `GeneratingCard`,
  prepend, and `ErrorBanner`; the original concept stays (FR-5 / TC-004). Error
  retry was generalized to a `LastAction` data union (generate | refine) so retry
  replays the right call without a self-referencing callback (`react-hooks/
  immutability`). lint + tsc + build clean. Verified live: directive + change
  refinements reach the AI call (typed `UPSTREAM_ERROR` without a key), empty
  tweak → `INVALID_PROMPT` 400, and the original concept remains in the gallery
  (`total:1`). **Toolbar click-through not yet confirmed in a browser** — check
  with `npm run dev`.

### Milestone: core product loop complete — describe → generate → keep (persistent
gallery) → iterate (refine) → download, all wired and proven at the API layer.
Remaining is polish (mobile), then README + deploy with a real key.

- **Mobile pass + visual polish** ✅ 2026-06-11
  Audited the responsive classes across the studio layout, wizard, gallery,
  refine toolbar, and error banner. The layout was already responsive by
  construction (single-column stacking, `flex-wrap` chips, `grid-cols-1` gallery,
  step labels `sm:inline`); applied two conservative tweaks: tighter mobile
  gutters on the page main (`px-4 py-8` → `sm:px-6 sm:py-10`) and a smaller
  stacked column gap in `LogoStudio` (`gap-6` → `lg:gap-8`). lint + tsc + build
  clean. **Visual responsiveness NOT verified** — no browser in this environment;
  the actual small-screen check + full loop click-through still need `npm run
  dev` (carried as outstanding QA).

### Milestone: frontend feature-complete (pending in-browser QA) — full loop built
and responsive by construction; next is README + deploy with a real key.

- **README refresh (run in < 15 min)** ✅ 2026-06-11
  Updated the existing README to match the now-complete app: API table no longer
  marks `gallery`/`refine`/`download` as in-progress, added a "Using the app"
  walkthrough (describe → generate → gallery → refine → download + failure
  handling), and rewrote Project status to feature-complete (backend + UI built;
  in-browser QA + deploy outstanding). Verified no stale "in progress" refs remain
  and all linked docs resolve. Setup/env/scripts/deploy sections were already
  accurate. Deploy itself remains (needs a real key + host).

### Milestone: README accurate + runnable; only deploy (real key + host) and
in-browser QA remain before submission.

- **In-browser QA pass** ✅ 2026-06-12
  Drove the real UI end-to-end in headless Chrome (Playwright, isolated temp
  DB/storage). All wizard validation (TC-BIZ/PER/STYLE), live generation with real
  Mistral JPEGs rendering in-page (8/8 decode), gallery persistence across refresh
  (TC-GAL-001/002), select + change-selection (TC-SEL-001/002), a valid honest-named
  JPEG download (TC-DL-001), the refine generating/failure flow (gallery untouched,
  C5), all three `ErrorBanner` states (invalid-prompt no-retry; timeout/upstream
  retry; retry re-issues; dismiss clears), mobile single-column (390px, no
  overflow), and security (TC-SEC-001/002/003/004) all passed. Disk integrity clean
  (0 zero-byte/`.tmp`). Two findings carried forward: refine **happy-path** and
  concurrency-under-load remain quota/load-gated (not code gaps); the model returns
  **JPEG not PNG** so "Download PNG" copy is technically inaccurate (the file is
  labeled honestly via magic bytes). Full detail in `development-status.md`.

### Milestone: app verified in a real browser — full loop + three failure states +
security all pass; only deploy and the two quota/load-gated checks remain.

- **Automated fallback tests (vitest)** ✅ 2026-06-12
  Added the project's first automated suite: `vitest` dev-dep + `npm test` /
  `test:watch`. `src/lib/ai.test.ts` (9 tests, ~250ms, mocked `fetch`, no real
  API calls) proves the 2-pixazo + 2-mistral provider×key fallback: in-pool 429
  rollover, first-success short-circuit, cross-provider rollover, full chain
  order + last-error surfacing, key de-dup, and `INTERNAL` when unconfigured. The
  suite caught a footgun — keys for a provider not listed in `IMAGE_PROVIDER` are
  ignored (order defaults to `mistral`); captured as a regression test (the live
  `IMAGE_PROVIDER=pixazo,mistral` is unaffected). lint + tsc + build clean.

### Milestone: fallback logic now has a deterministic regression net — re-verifying
the multi-key rollover is `npm test` (free, no quota) instead of a manual QA pass.

- **Persist + reuse the Mistral agent across restarts** ✅ 2026-06-13
  `ensureAgent` no longer creates a throwaway agent per process. New flow: env
  `MISTRAL_AGENT_ID` → in-memory cache → **DB-persisted id verified live via
  `GET /v1/agents`** → create + persist. Added a `mistral_agents` table +
  `getStoredAgentId`/`saveAgentId` to `db.ts` (both Turso + SQLite backends),
  keyed by a SHA-256 fingerprint of the API key so the secret never lands in the
  DB. DB I/O is best-effort (logged, non-fatal) and a *failed* existence check
  reuses the stored id rather than spawning a duplicate, so an agent-store hiccup
  can't break generation. 4 new `ai.test.ts` cases (reuse / create+persist /
  recreate-when-gone / env-override-skips-store) → 13 tests total. lint + tsc +
  build + `npm test` clean. **Not exercised against a live key** (no key in env);
  the live reuse path is covered by mocked-fetch tests, not a real API round-trip.

- **Round-robin image API key strategy (opt-in)** ✅ 2026-06-13
  New `IMAGE_KEY_STRATEGY` env (`fallback` default | `round-robin`) in `ai.ts`.
  `fallback` keeps today's strict-priority chain; `round-robin` left-rotates the
  provider order **and** each provider's key pool by a per-process counter
  advanced once per request, so the ~12 concurrent calls from `POST /api/generate`
  spread across providers/keys (`mistral,pixazo` ×2 keys → m1,m2,p1,p2 then
  p2,p1,m2,m1 then back) instead of all hammering the first free-tier key.
  Rollover is unchanged — every provider×key is still tried before failing; only
  the starting point rotates, and a single-key/single-provider deploy is a no-op.
  Pure + encapsulated in `ai.ts` (routes/UI untouched). 4 new `ai.test.ts` cases
  (alternating starting provider, in-request rollover from a failing start,
  full-chain coverage on all-fail, fallback-default unchanged) → 17 tests total.
  lint + tsc + build + `npm test` clean. **Not exercised against a live key** (no
  key in env); rotation/rollover is covered by mocked-fetch tests, not a real
  multi-key burst.

- **Cloudflare Turnstile bot protection (opt-in)** ✅ 2026-06-13
  **Beyond documented MVP scope** (user-requested; not in PRD/acceptance-criteria).
  New server-only `lib/turnstile.ts` (`verifyTurnstile`/`isTurnstileEnabled`/
  `clientIp`) guards `POST /api/generate` + `POST /api/refine` before any AI work;
  new client `TurnstileWidget.tsx` (next/script loader + explicit render +
  imperative `reset()`), wired via `LogoStudio` so one shared widget feeds both
  flows — the one-time `turnstileToken` is sent per request and reset afterwards.
  **Enforcement is opt-in:** verified only when `TURNSTILE_SECRET_KEY` is set,
  else skipped with a one-time warn (local dev / key-less deploys unaffected).
  Site key is public (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, given key baked as
  default); secret is server-only and lives in gitignored `.env.local`. A
  failed/missing token reuses the existing `INVALID_REQUEST` retryable state (no
  new error code). Client is non-blocking (buttons not gated on token) so a
  widget that fails to load can't brick the app; the server is the gate. New
  `turnstile.test.ts` (9 cases, mocked fetch) → 26 tests total. lint + tsc +
  build + `npm test` clean. The provided secret key is configured in `.env.local`,
  so enforcement is live locally; **not yet exercised end-to-end in a browser**
  (the widget needs the deploy/localhost domain allowed in the Cloudflare widget).

## Blockers

None
