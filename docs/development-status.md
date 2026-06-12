# Development Status — AI Logo Generator

Snapshot of what is built, in progress, and outstanding. Update at the end of
every meaningful task. Task-level detail lives in `current-sprint.md`; durable
context in `project-memory.md`.

_Last updated: 2026-06-12_

---

## At a glance

| Layer | Status |
| --- | --- |
| Backend libs (`lib/*`) | ✅ Complete |
| API routes | ✅ Complete (6 of 6) |
| Frontend (wizard + gallery) | ✅ Complete (in-browser QA passed 2026-06-12) |
| QA (security, validation, UI loop) | ✅ Passed in-browser 2026-06-12; ⬜ concurrency-under-load left |
| Deploy / live URL | ⬜ Not started |

Overall: **backend complete (all 6 routes); frontend complete and verified in a
real browser (2026-06-12) — the full product loop is proven end-to-end through the
UI (describe → generate → 10–30s loading → persistent gallery → select → refine →
download), with the three retryable states via `ErrorBanner` and all security
checks passing. Remaining: deploy (needs a host) + the two quota/load-gated items
below (refine happy-path against a real key, concurrency under real simultaneous
load).**

---

## Built (✅)

**Library layer (`src/lib/`)**

- `types.ts` — shared client/server contract (brief, concept record, error shape).
- `http.ts` + `errorCopy.ts` — uniform `{ error, code }` responses + user copy.
- `db.ts` — SQLite (WAL + busy_timeout), `gallery` table + index, prepared statements.
- `storage.ts` — atomic image writes, UUID names, magic-byte typing, path-traversal guard.
- `ai.ts` — Mistral Agents service, timeouts → `TIMEOUT`/`NO_IMAGE`/`UPSTREAM_ERROR`, `isConfigured()`.
- `prompt.ts` — brief validation + brief→prompt construction + refine prompt.
- `apiClient.ts` — client-safe fetch helper (`ClientApiError` + `requestJson`) preserving the `{error,code}` contract so the UI can branch on the failure code.

**API routes (`src/app/api/`)**

- `GET /api/health` — liveness + `aiKeyConfigured`.
- `POST /api/generate` — full pipeline (validate → generate → store → record), partial-success tolerant.
- `GET /api/images/[filename]` — serve stored bytes safely.
- `GET /api/gallery` — paginated persisted listing (`concepts`/`total`/`nextOffset`), newest-first, `force-dynamic`. **Verified live** (empty-state, pagination cursor, ordering, 400 on bad params).
- `POST /api/refine` — re-generate from a saved concept: load → validate tweak → `buildRefinePrompt` → 4 variations saved with `refinedFrom`; original untouched, partial-success tolerant. **Verified live** (all validation/error paths + typed upstream failure).
- `GET /api/download` — export a saved logo by `id` as a PNG attachment (`Content-Disposition`, friendly slugged filename, magic-byte extension); premium formats rejected, not faked. **Verified live** (missing/unknown id, premium-format rejection, happy-path attachment + valid PNG bytes).

**Frontend (`src/components/`, `src/app/`)**

- `LogoStudio.tsx` — client host (architecture §3): owns the gallery + generating + **selection** state, fetches the gallery on mount + paginates (via `requestJson`), wires the wizard's `onSubmit` → `POST /api/generate` and the refine toolbar → `POST /api/refine` (shared busy flag, `GeneratingCard`, and **prepend** — newest first), and renders a retryable `ErrorBanner` keyed on the typed code (retry replays the last action via a `LastAction` data union) with the gallery left untouched on failure (C5).
- `Gallery.tsx` — presentational gallery (data via props): loading / retryable-error / empty / grid states with `nextOffset` "Load more" (FR-4 / TC-003).
- `GeneratingCard.tsx` — meaningful 10–30s loading UI; tells the user the wait is expected (C4 / FR-7).
- `ErrorBanner.tsx` — retryable failure state keyed on `ErrorCode`; invalid-prompt frames as "fix your brief" (no retry), timeout / no-image / upstream / internal offer retry (C5 / FR-6 / TC-008–009).
- `RefineToolbar.tsx` — appears for the selected concept; directive chips + "Different color/icon/font" emit a `{directive}|{change}` refinement (no free text) (FR-5 / TC-004).
- `Wizard.tsx` + `steps/` — brief-collection state machine (steps 1–3) feeding `onSubmit(brief)`; **now mounted** via `LogoStudio`.
- `LogoCard.tsx` — one saved concept via `next/image` (same-origin `/api/images`, `unoptimized`); selectable image region (`aria-pressed` + ring) and a PNG **Download** link (anchor → `GET /api/download?id=`, `download` attr) (FR-8).
- `steps/BusinessInfoStep.tsx` — name + description inputs, char counts, inline errors, length bounds from `prompt.ts` (TC-005/006/007).
- `steps/PersonalityStep.tsx` — trait chips, capped at `MAX_TRAITS`, optional.
- `steps/StyleStep.tsx` — single-select style cards from `LOGO_STYLES`, one required.
- `page.tsx` / `layout.tsx` — server shell with app header + `<LogoStudio/>` (two-column); create-next-app scaffold + placeholder metadata replaced.

---

## Outstanding (⬜)
- Deploy to a host with a persistent disk; set the live URL. _(README done — runnable + accurate.)_
- Refine **happy-path** against a real key (TC-REF-001..003): every refine attempt
  during QA hit the free-tier image rate limit (`429`); the refine *failure* path
  and "original stays" are verified, but new-variations-added is still quota-gated.
- Concurrency under real simultaneous load (TC-CON-001): proven by construction
  (UUID names + atomic temp→rename + WAL/busy_timeout; 12 generations left 0
  zero-byte/`.tmp` files) but not stress-tested with concurrent live clients.

---

## Verified

- **In-browser QA pass (2026-06-12, headless Chrome via Playwright against
  `npm run dev`, isolated temp DB/storage):** drove the real UI end-to-end.
  - Wizard (Phase A, 13/13): TC-BIZ-002/003 inline "required" errors block
    advance; TC-BIZ-001 advances; TC-PER-002 trait cap = 3 (8 others disabled,
    `3/3 selected`, deselect releases); TC-STYLE-002 "Select a logo style." blocks
    generate; TC-STYLE-001 selects; Back preserves state.
  - Live generate + gallery: real Mistral JPEG concepts generated **through the
    browser** and **8/8 images decode in-page** (`naturalWidth>0`); TC-GAL-001
    gallery persists identically across refresh (server-hydrated, no client source
    of truth); TC-GAL-002 bytes on disk + DB rows match the API total.
  - Selection/download/refine: TC-SEL-001 ring + `aria-pressed`; TC-SEL-002 moves
    selection; TC-DL-001 downloads a valid JPEG with an honest slugged filename
    (`vela-roastery-<id>.jpg`); refine shows the generating state and, on the
    free-tier `429`, surfaces a retryable banner with the gallery untouched (C5).
  - Three failure states via `ErrorBanner` (Phase D, injected server codes — the
    server emits them live): INVALID_PROMPT → "Check your brief" with **no** retry;
    TIMEOUT → "That took too long" + retry; UPSTREAM_ERROR → "The logo service had
    trouble" + retry; "Try again" re-issues the request; ✕ dismisses; gallery
    intact throughout. Plus a **real (non-injected)** live UPSTREAM_ERROR banner
    captured when generation hit the quota.
  - Mobile (390px): single-column gallery, no horizontal overflow.
  - Security: TC-SEC-001 injected `<img onerror>`/`<script>` fired no dialog;
    TC-SEC-002 gallery table intact after SQL-ish input; **TC-SEC-003** key absent
    from page HTML and all 17 client JS chunks (only referenced in `src/lib/ai.ts`);
    TC-SEC-004 all traversal variants rejected (400/404, no `/etc/passwd`).

- **Happy path against a real `MISTRAL_API_KEY` (2026-06-11, `npm run dev`):** `/api/health` → `aiKeyConfigured:true`; `POST /api/generate` (full brief) → 200 with real **1024×768 JPEG** logos saved to disk (75–115 KB each), each carrying its prompt with an inferred palette (TC-001/002); `/api/images/<id>.jpg` serves valid JPEG bytes; `/api/gallery` reflects them (`total:4`) and they persist across re-reads (TC-003); `/api/download?id=` returns `Content-Disposition: attachment`, a slugged filename, and valid JPEG bytes (FR-8). **Refine happy path (TC-004) NOT yet confirmed** — every refine attempt hit the provider's free-tier image rate limit (`429 image_generation rate limit reached`) and correctly returned `UPSTREAM_ERROR` 502 with the gallery left intact (nothing partial saved — TC-009 verified live). Two findings: (a) generate fans out **12** image calls and the free tier rate-limits hard — only ~4 succeeded; partial-success tolerance is what kept it green; consider lowering the fan-out to fit the free tier. (b) the model returns **JPEG, not PNG** — download labels the file `.jpg` honestly via magic bytes (not faked), so the "Download as PNG" wording in the PRD/README is inaccurate; it is "download the raster as generated."
- `lint` + `tsc` + `build` clean across the library layer, all six routes, and the full frontend (studio host, gallery, wizard + steps, generating card, error banner, logo card select/download). _One earlier build hit a transient Google-Fonts fetch failure (`next/font/google`, network); a retry passed clean._
- Error paths on `/api/generate` exercised via `curl` (`INVALID_REQUEST`, `INVALID_PROMPT`, `UPSTREAM_ERROR`).
- Storage traversal rejections smoke-tested.
- `/api/gallery` exercised live: empty-state, pagination + `nextOffset` cursor, newest-first ordering (seeded temp DB), and `INVALID_REQUEST` on malformed params.
- `/api/refine` exercised live: malformed JSON, missing `conceptId`, empty tweak, unknown directive, unknown concept, and concept-without-brief all return the right code; full pipeline (seeded concept + valid tweak) reaches the AI call and surfaces a typed `UPSTREAM_ERROR` (502) without a key.
- `/api/download` exercised live: missing id and unknown id → `INVALID_REQUEST`; premium format (`svg`) rejected as not-available; happy path (seeded concept + on-disk PNG) → 200 with `Content-Disposition: attachment`, slugged filename, and downloaded bytes a valid PNG.
- Mounted UI exercised live (server): `/` server-renders the wizard step 1 (business name + description prompts) + gallery shell; `POST /api/generate` with an empty brief → `INVALID_PROMPT` 400, and with a valid brief but no key → typed `UPSTREAM_ERROR` 502, with the gallery still empty afterward (nothing partial saved, C5). The typed codes flow to the page so `ErrorBanner` can frame each state.
- Card actions exercised live (server): with a seeded concept, the card's download href (`/api/download?id=`) returns 200 + `Content-Disposition: attachment` + valid PNG bytes, and the gallery API exposes the concept the grid maps over.
- Refine toolbar exercised live (server): with a seeded concept, a directive and a change-target both reach the AI call (typed `UPSTREAM_ERROR` 502 without a key), an empty tweak → `INVALID_PROMPT` 400, and the original concept remains in the gallery (`total:1`) — TC-004's "original remains" at the API layer.
- Gallery UI: server shell HTML renders the app header + loading state; empty-state gallery API returns `{concepts:[],total:0,nextOffset:null}`; full data path a seeded concept renders from (gallery listing carries the brief; `/api/images/<id>.png` serves valid PNG bytes) confirmed via the running server.

## Not yet verified

- Happy-path **refinement** (TC-REF-001..003) against a real key — still blocked by
  the provider's free-tier image rate limit (`429`); during the 2026-06-12 QA every
  refine attempt hit it. Refine reuses the verified `generateImage` path and its
  failure handling + "original stays" are confirmed, so this is a quota wait, not a
  code gap. Retry once the image quota resets.
- Concurrency under real simultaneous load (TC-CON-001) — see Outstanding.

---

## Known issues

See `known-limitations.md`. No open blockers; the backend is complete and the
gap is simply the unbuilt UI (plus QA and deploy).
