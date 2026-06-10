# Kanban Board Seed — AI Logo Generator

**USE THIS BOARD https://app.notion.com/p/f7a7f65bae574f3ba6a0bf864b929633?v=37b028eff0ee819eb6fd000c97ebfb2f BELOW WAS THE INITIAL DATA **

## Database properties

| Property | Type | Notes |
| --- | --- | --- |
| **Name** | Title | Task title |
| **Seq** | Number | Build order — lower runs first |
| **Status** | Status / Select | `Backlog`, `To Do`, `In Progress`, `Review`, `Done` |
| **Area** | Select | `Setup`, `Backend`, `Frontend`, `AI`, `QA`, `Docs` |
| **Priority** | Select | `P0`, `P1`, `P2` |
| **Notes** | Text | Detail / acceptance pointer |

Board view: group by **Status**, sort by **Seq** ascending.

## Tasks (Seq-ordered backlog)

| Seq | Name | Area | Priority | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Scaffold Next.js 16 app (TS, Tailwind v4, ESLint) | Setup | P0 | To Do | Mirror actual-inc baseline |
| 2 | Configure env + `.env.example` (MISTRAL_API_KEY etc.) | Setup | P0 | To Do | Server-side key only |
| 3 | Define shared contract in `lib/types.ts` | Backend | P0 | To Do | Brief, concept record, `{error,code}` |
| 4 | Implement `lib/http.ts` + `lib/errorCopy.ts` | Backend | P0 | To Do | Uniform error responses |
| 5 | Implement SQLite layer `lib/db.ts` (WAL) | Backend | P0 | To Do | gallery table + index |
| 6 | Implement filesystem `lib/storage.ts` (atomic, magic-byte) | Backend | P0 | To Do | Path-traversal guard |
| 7 | Implement Mistral service `lib/ai.ts` (Agents API) | AI | P0 | To Do | Server-side, typed errors, timeouts |
| 8 | Implement prompt builder `lib/prompt.ts` | AI | P0 | To Do | Brief → prompt; infer when "AI choose" |
| 9 | `GET /api/health` | Backend | P1 | To Do | Liveness + key-configured check |
| 10 | `POST /api/generate` (concepts → gallery) | Backend | P0 | To Do | Pipeline: validate→generate→store→record every concept |
| 11 | `GET /api/images/[filename]` | Backend | P0 | To Do | Serve bytes safely (traversal guard) |
| 12 | `POST /api/refine` (re-generate from saved) | Backend | P1 | To Do | Fold tweak into a saved concept's prompt |
| 13 | `GET /api/gallery` (paginated, persisted) | Backend | P0 | To Do | All generations, newest first — persistence |
| 14 | `GET /api/download` (PNG) | Backend | P1 | To Do | Export selected logo as PNG |
| 15 | Wizard shell + state machine `components/Wizard.tsx` | Frontend | P0 | To Do | Step orchestration |
| 16 | Step 1 — Business Info (name, description) | Frontend | P0 | To Do | Validation: non-empty, bounded (invalid-prompt guard) |
| 17 | Step 2 — Personality (max 3 traits) | Frontend | P0 | To Do | Block 4th selection |
| 18 | Step 3 — Style cards (5 styles) | Frontend | P0 | To Do | One required |
| 19 | Step 4 — Generate + `GeneratingCard` | Frontend | P0 | To Do | Meaningful 10–30s progress UI |
| 20 | Persistent gallery view + hydrate on load | Frontend | P0 | To Do | Loads from `/api/gallery`; survives refresh |
| 21 | Concept card — select / re-generate / download | Frontend | P0 | To Do | Acts on saved concepts |
| 22 | Re-generate toolbar (tweak prompt) | Frontend | P1 | To Do | Personality + color/icon/font |
| 23 | Step 7 — Download (PNG) | Frontend | P1 | To Do | PNG export |
| 24 | `ErrorBanner` + 3 retryable error states | Frontend | P0 | To Do | Invalid prompt / timeout / broken response |
| 25 | Mobile-responsive pass | Frontend | P1 | To Do | NFR: responsive |
| 26 | Concurrency stress-test script | QA | P0 | To Do | Simultaneous writes (TC-CON-001) |
| 27 | Validation + failure-state test cases | QA | P0 | To Do | Per docs/test-plan.md |
| 28 | Security checks (injection, traversal, key-server-side) | QA | P0 | To Do | TC-SEC-001..004 |
| 29 | README (run in <15 min) + finalize docs | Docs | P0 | To Do | Setup, env vars, start |
