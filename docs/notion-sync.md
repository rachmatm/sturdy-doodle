# Notion Sync — AI Logo Generator

**Single source of truth for syncing the Notion Delivery Board and project
brief page.** When asked to "sync Notion" / "sync the kanban board", use ONLY
this file plus `current-sprint.md` and `development-status.md` to decide each
card's status. **Do not read application source code** — the docs are the
authority for what is done. (Read source only if a doc and the board disagree
in a way the docs can't resolve, and say so first.)

This keeps a sync cheap: no codebase scan, no Notion search to rediscover card
IDs (the map below already has them).

---

## Board pointers

| Thing | Value |
| --- | --- |
| Database (Delivery Board) | https://app.notion.com/p/f7a7f65bae574f3ba6a0bf864b929633 |
| Data source (collection) ID | `54dc4cd8-8402-4df0-82bd-c5e9cad06573` |
| Parent brief page | `37b028ef-f0ee-81c9-a93c-c73b12e52d2c` |
| Kanban view | group by **Status**, sort by **Seq** ascending |

**Schema** — `Name` (title), `Seq` (number), `Status` (select), `Area`
(select), `Priority` (select), `Notes` (text). All editable; none read-only.

- **Status** options: `Backlog`, `To Do`, `In Progress`, `Review`, `Done`
- **Area** options: `Setup`, `Backend`, `Frontend`, `AI`, `QA`, `Docs` (no
  `Ops` — deploy/ops tasks use `Setup`)
- **Priority** options: `P0`, `P1`, `P2`

---

## Sync procedure

1. Read this file + `current-sprint.md` ("Done This Sprint" / "Current" /
   "Next") + `development-status.md` ("At a glance", "Verified", "Outstanding").
   Do **not** open source files.
2. For each card in the map below, determine the true status from those docs:
   - shipped + verified (lint/tsc/build and/or live) → `Done`
   - built but only manually checked, no automated suite / awaiting a pass →
     `Review`
   - not started or in-flight → `To Do` / `In Progress`
3. **Write-only — do NOT `notion-fetch` cards to confirm.** Trust the
   "Last-synced Status" column below as the baseline: compare it to the true
   status from step 2 and act only on the **deltas**. Update straight to target;
   only `notion-fetch` a single card if its write actually fails (e.g. the ID is
   stale). This keeps a sync to a handful of writes instead of ~30 reads.
4. Update each changed card with `notion-update-page`
   (`command: update_properties`), setting `Status` and appending a short
   `DONE <date>: …` (or status note) to `Notes`. Batch independent updates in
   parallel.
5. If a doc tracks a task with no card (e.g. a new sprint task), create it with
   `notion-create-pages` under the data source ID, then add a row below.
6. After syncing, **update the "Last-synced Status" column and the date** in
   this file so the next sync starts from a true baseline.

---

## Card map (Seq ↔ Notion page ID)

_Last synced: 2026-06-12._

| Seq | Name | Area | Pri | Notion page ID | Last-synced Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Scaffold Next.js 16 app | Setup | P0 | `37b028ef-f0ee-81f6-aa61-ce4090374964` | Done |
| 2 | Configure env + `.env.example` | Setup | P0 | `37b028ef-f0ee-8132-ac98-cdc02a8f88be` | Done |
| 3 | Shared contract `lib/types.ts` | Backend | P0 | `37b028ef-f0ee-8178-8adc-ec3c524da17e` | Done |
| 4 | `lib/http.ts` + `lib/errorCopy.ts` | Backend | P0 | `37b028ef-f0ee-81a5-b770-fb9a322f319f` | Done |
| 5 | SQLite `lib/db.ts` (WAL) | Backend | P0 | `37b028ef-f0ee-8139-9067-e106b1792472` | Done |
| 6 | Filesystem `lib/storage.ts` | Backend | P0 | `37b028ef-f0ee-811b-8de2-e1637cf6ce4e` | Done |
| 7 | Mistral `lib/ai.ts` | AI | P0 | `37b028ef-f0ee-8108-bc52-c7c08497421c` | Done |
| 8 | Prompt builder `lib/prompt.ts` | AI | P0 | `37b028ef-f0ee-81de-8315-f203632a4d90` | Done |
| 9 | `GET /api/health` | Backend | P1 | `37b028ef-f0ee-8155-b62f-e72eedd77bca` | Done |
| 10 | `POST /api/generate` | Backend | P0 | `37b028ef-f0ee-8159-a934-fd2a3fddaa7a` | Done |
| 11 | `GET /api/images/[filename]` | Backend | P0 | `37b028ef-f0ee-81a2-b26d-f27370e121c7` | Done |
| 12 | `POST /api/refine` | Backend | P1 | `37b028ef-f0ee-81c4-ac7f-f893c123536d` | Done |
| 13 | `GET /api/gallery` | Backend | P0 | `37b028ef-f0ee-81a3-8d2f-d7ee87a0ca3b` | Done |
| 14 | `GET /api/download` | Backend | P1 | `37b028ef-f0ee-8145-a15b-cb1c4f0e5b9c` | Done |
| 15 | Wizard shell `components/Wizard.tsx` | Frontend | P0 | `37b028ef-f0ee-8115-ae09-e573834d1772` | Done |
| 16 | Step 1 — Business Info | Frontend | P0 | `37b028ef-f0ee-81fa-a07e-eba2acc724bc` | Done |
| 17 | Step 2 — Personality | Frontend | P0 | `37b028ef-f0ee-814f-bbbd-d7e35c269b45` | Done |
| 18 | Step 3 — Style cards | Frontend | P0 | `37b028ef-f0ee-8159-b3eb-fd82534783f5` | Done |
| 19 | Step 4 — Generate + GeneratingCard | Frontend | P0 | `37b028ef-f0ee-811f-9e30-ce91af88d301` | Done |
| 20 | Persistent gallery view + hydrate | Frontend | P0 | `37b028ef-f0ee-815f-8753-f604a3b0b27f` | Done |
| 21 | Concept card — select/regen/download | Frontend | P0 | `37b028ef-f0ee-8123-8f95-e9d7292dbdf1` | Done |
| 22 | Re-generate toolbar | Frontend | P1 | `37b028ef-f0ee-8144-8598-e0973effc808` | Done |
| 23 | Step 7 — Download (PNG) | Frontend | P1 | `37b028ef-f0ee-818a-ade5-dac99939e59c` | Done |
| 24 | `ErrorBanner` + 3 retryable states | Frontend | P0 | `37b028ef-f0ee-8170-b5a8-f1661503b180` | Done |
| 25 | Mobile-responsive pass | Frontend | P1 | `37b028ef-f0ee-81e6-af52-da8acbf255f2` | Done |
| 26 | Concurrency stress-test script | QA | P0 | `37b028ef-f0ee-8114-a00e-ff6ecc43c83e` | To Do |
| 27 | Validation + failure-state test cases | QA | P0 | `37b028ef-f0ee-8107-9480-e1b8b88280fd` | Done |
| 28 | Security checks | QA | P0 | `37b028ef-f0ee-81e6-b6db-c24b6f8a0be6` | Done |
| 29 | README + finalize docs | Docs | P0 | `37b028ef-f0ee-8187-bf4d-cdaa334ff0af` | Done |
| 30 | Deploy to persistent-disk host + live URL | Setup | P1 | `37c028ef-f0ee-81d6-80e5-ee975232cb38` | To Do |
| 31 | In-browser QA pass (full loop + responsiveness) | QA | P1 | `37c028ef-f0ee-81fa-90b9-f03d2ddf86b7` | Done |
| 32 | Multi-provider image fallback (pixazo + per-key rollover) | AI | P1 | `37d028ef-f0ee-8165-ac14-e54bcdedca58` | Done |
| 33 | Automated fallback tests (vitest) | QA | P2 | `37d028ef-f0ee-8107-8f5b-f550011a3c86` | Done |
