# Development Status — AI Logo Generator

Snapshot of what is built, in progress, and outstanding. Update at the end of
every meaningful task. Task-level detail lives in `current-sprint.md`; durable
context in `project-memory.md`.

_Last updated: 2026-06-11_

---

## At a glance

| Layer | Status |
| --- | --- |
| Backend libs (`lib/*`) | ✅ Complete |
| API routes | 🟡 Partial (4 of 6) |
| Frontend (wizard + gallery) | ⬜ Not started |
| QA (concurrency, security, tests) | ⬜ Not started |
| Deploy / live URL | ⬜ Not started |

Overall: **backend/AI library layer done; persistence path (generate → store →
gallery) provable; `refine`/`download` routes and UI still to do.**

---

## Built (✅)

**Library layer (`src/lib/`)**

- `types.ts` — shared client/server contract (brief, concept record, error shape).
- `http.ts` + `errorCopy.ts` — uniform `{ error, code }` responses + user copy.
- `db.ts` — SQLite (WAL + busy_timeout), `gallery` table + index, prepared statements.
- `storage.ts` — atomic image writes, UUID names, magic-byte typing, path-traversal guard.
- `ai.ts` — Mistral Agents service, timeouts → `TIMEOUT`/`NO_IMAGE`/`UPSTREAM_ERROR`, `isConfigured()`.
- `prompt.ts` — brief validation + brief→prompt construction + refine prompt.

**API routes (`src/app/api/`)**

- `GET /api/health` — liveness + `aiKeyConfigured`.
- `POST /api/generate` — full pipeline (validate → generate → store → record), partial-success tolerant.
- `GET /api/images/[filename]` — serve stored bytes safely.
- `GET /api/gallery` — paginated persisted listing (`concepts`/`total`/`nextOffset`), newest-first, `force-dynamic`. **Verified live** (empty-state, pagination cursor, ordering, 400 on bad params).

---

## In progress / next (🟡)

- `POST /api/refine` (re-generate from a saved concept) — **next**, P1.
- `GET /api/download` (PNG) — P1.

---

## Outstanding (⬜)

- `GET /api/download` (PNG).
- Frontend: wizard shell, steps 1–3, generate + loading state, **persistent gallery view (hydrate on load)**, concept card (select / re-generate / download), re-generate toolbar, PNG download, `ErrorBanner` (3 retryable states), mobile pass.
- QA: concurrency stress-test, validation + failure-state cases, security checks (injection, traversal, key-server-side).
- README (run in < 15 min) + deploy to a host with a persistent disk; set the live URL.

---

## Verified

- `lint` + `tsc` clean across the library layer and the four routes.
- Error paths on `/api/generate` exercised via `curl` (`INVALID_REQUEST`, `INVALID_PROMPT`, `UPSTREAM_ERROR`).
- Storage traversal rejections smoke-tested.
- `/api/gallery` exercised live: empty-state, pagination + `nextOffset` cursor, newest-first ordering (seeded temp DB), and `INVALID_REQUEST` on malformed params.

## Not yet verified

- Happy-path generation against a real `MISTRAL_API_KEY` (live image bytes).
- Gallery persistence across refresh **in the browser** (route proven; UI not built).
- Concurrency under real simultaneous load.

---

## Known issues

See `known-limitations.md`. No open blockers; the gap is simply unbuilt UI and
the remaining routes.
