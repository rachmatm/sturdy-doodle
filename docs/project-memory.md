# Project Memory — AI Logo Generator

Long-lived context that should survive across sessions. Update this at the end
of every meaningful task. For the live task list see `current-sprint.md`; for
build progress see `development-status.md`.

---

## What this project is

An AI image-generation web app in the **logo niche** for small-business owners.
A user describes their business (4-field brief), the backend generates distinct
logo concepts via a real AI image API, and every result — image + prompt — is
saved to a **persistent gallery**. Any saved logo can be **re-generated** by
tweaking its prompt.

Full scope: `product-requirements.md`. Journey: `user-journey.md`. Design:
`architecture.md`. Stack & decisions: `tech-stack.md`. Honest limitations:
`known-limitations.md`.

## Non-negotiables (never regress these)

1. AI API calls go through the **backend only** — the key never reaches the browser.
2. Images stored **server-side**; the gallery **persists across refresh**.
3. Correct under **concurrent users** (UUID names, atomic writes, SQLite WAL + busy_timeout).
4. **Meaningful loading** — 10–30s is normal and shown as expected.
5. Three failure states handled visibly & retryably: **invalid prompt, API timeout, broken response**.
6. Live via a **public URL**; uses a real free AI image API (Mistral Agents API).

## Architecture in one paragraph

Single Next.js 16 fullstack app. Wizard (React 19) → same-origin API routes →
`ai.ts` (Mistral Agents, server-only), `storage.ts` (filesystem, atomic), `db.ts`
(SQLite WAL). Uniform `{ error, code }` error model. Server-only modules
(`ai.ts`, `db.ts`, `storage.ts`) must never be imported by client code.

## Key conventions / decisions

- `lib/types.ts` is the single client/server contract; client never imports server-only modules.
- Error codes: `INVALID_REQUEST`, `INVALID_PROMPT`, `TIMEOUT`, `NO_IMAGE`, `UPSTREAM_ERROR`, `INTERNAL`.
- Save **every** generated concept (not just favorites) — that is what makes the gallery durable.
- PNG download only; SVG/favicon are future, not faked (the model returns raster).
- No accounts — one shared anonymous gallery (enough to prove persistence + concurrency).
- Build order is risk-first / contract-first: backend correctness before UI.

## Decision log

| Date | Decision | Why |
| --- | --- | --- |
| 2026-06-11 | Realigned all `docs/` + Notion brief/board to the assessment | Match Actual Inc. deliverables while keeping the existing logo concept |
| 2026-06-11 | Save every concept to the gallery | Persistence non-negotiable (image + prompt across refresh) |
| 2026-06-11 | `GET /api/gallery` returns `{concepts,total,nextOffset}`, `force-dynamic`, `limit`≤100 | Offset pagination + always-fresh reads; built on `feat/api-gallery` branch |
| 2026-06-11 | `POST /api/refine` regenerates **4** variations (≤ generate's concurrency bound), reuses the brief stored in the original's `params`, saves with `refinedFrom` set, leaves the original untouched | Re-generation = re-prompting (PRD §5.1 / TC-004); brief is never re-entered; empty tweak is the invalid-prompt failure state |
| 2026-06-11 | `GET /api/download?id=` serves PNG as an attachment; extension from magic-byte content type; premium formats rejected, not faked | Backend now complete (6/6 routes). PNG download proves the "usable asset" loop (PRD §5.2) without claiming vector/favicon export |
| 2026-06-11 | Frontend started: `Gallery` (client) hydrates from `GET /api/gallery` on mount and holds no client source of truth; `next/image` uses `unoptimized` for same-origin `/api/images` | Persistence non-negotiable proven by re-fetch on every load (FR-4 / TC-003); `unoptimized` avoids needing remote-pattern/optimizer config for our own image route. Note: `react-hooks/set-state-in-effect` forbids sync setState in effects — mount effect must call a fetch-only fn that sets state async |
| 2026-06-11 | `Wizard` owns brief state + per-step validation; presentational steps are prop-driven; brief leaves via `onSubmit` only | Keeps generation/loading/results out of the wizard (architecture §3); steps stay dumb + testable. Client revalidates (mirrors `validateBrief`) for instant UX, but the server stays the source of truth. Built decoupled from the page so mount + generate wiring is one clean next step |
| 2026-06-11 | New `LogoStudio` host owns gallery + generating state; `Gallery` made presentational; generate prepends concepts and failures leave the gallery intact | Architecture §3 wants one host so the wizard, 10–30s loading, and persistent gallery coexist and the loading state never blocks the gallery (C4). Prepend = newest-first without a refetch; on error nothing partial is shown/saved (C5). `page.tsx` renders `<LogoStudio/>`, not `<Gallery/>` directly |
| 2026-06-11 | Client preserves `{error,code}` via `lib/apiClient.ts` (`ClientApiError`/`requestJson`); `ErrorBanner` branches on the code | The three required failure states must each read distinctly (FR-6); a bare error string can't drive that. Invalid-prompt hides retry (fix the brief via the still-live wizard); timeout/no-image/upstream offer retry of the same brief. Keeps the server as the single source of truth for the failure type |
| 2026-06-11 | PNG download is a plain `<a href="/api/download?id=" download>` anchor, not a JS fetch; selection state owned by `LogoStudio` and threaded through `Gallery` → `LogoCard` | The route already returns `Content-Disposition: attachment`, so a link triggers the save with zero JS (FR-8). Selection lives in the host because the refine flow needs it next; clicking the selected card again clears it |
| 2026-06-11 | `RefineToolbar` offers only fixed directive/change chips (no free text); generate + refine share one busy flag, prepend, and `ErrorBanner`; retry replays a `LastAction` data union | Completes the core loop (FR-5 / TC-004). No free text means an empty tweak can't be triggered from the UI, so invalid-prompt stays a server guard. Storing the last action as data (not a closure) avoids a self-referencing `useCallback` (this Next's `react-hooks/immutability` rule forbids it) |
| 2026-06-11 | Mobile pass was a class audit + two conservative tweaks, not a visual verification | The UI is responsive by construction (stacking, `flex-wrap`, `grid-cols-1`, `sm:`-gated labels); no browser in the build env, so small-screen rendering + full loop click-through remain outstanding QA to run with `npm run dev` |

## Known issues / risks

See `known-limitations.md` (The Honest Part). Headlines: AI text rendering is
unreliable for wordmarks; raster-only output; single-server persistence; shared
anonymous gallery; no streaming and no automated test suite yet.

## Pointers

- Live URL: _TBD (set on first deploy)_
- AI provider: Mistral Agents API (`image_generation`, FLUX1.1 [pro] Ultra)
- Env: `MISTRAL_API_KEY` (required), `MISTRAL_AGENT_ID`, `STORAGE_DIR`, `DATABASE_PATH`
- Delivery board (Notion): https://app.notion.com/p/f7a7f65bae574f3ba6a0bf864b929633
