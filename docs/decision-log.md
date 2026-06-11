# Decision Log — AI Logo Generator

A dated, append-only record of implementation decisions and the reasoning behind
them. Extracted from `project-memory.md` to keep that file focused on durable
context. Add a new row at the end of the table for each meaningful decision;
don't rewrite past rows (they are a point-in-time record).

For durable project context see `project-memory.md`; for the live task list see
`current-sprint.md`; for build progress see `development-status.md`.

---

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
