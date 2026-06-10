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

## Known issues / risks

See `known-limitations.md` (The Honest Part). Headlines: AI text rendering is
unreliable for wordmarks; raster-only output; single-server persistence; shared
anonymous gallery; no streaming and no automated test suite yet.

## Pointers

- Live URL: _TBD (set on first deploy)_
- AI provider: Mistral Agents API (`image_generation`, FLUX1.1 [pro] Ultra)
- Env: `MISTRAL_API_KEY` (required), `MISTRAL_AGENT_ID`, `STORAGE_DIR`, `DATABASE_PATH`
- Delivery board (Notion): https://app.notion.com/p/f7a7f65bae574f3ba6a0bf864b929633
