# Tech Stack & Decisions — AI Logo Generator

This document covers the **"Your Thinking"** part of the brief: the stack and
why, the build process and how it was sequenced, and the key technical decisions
(and their trade-offs). The stack is deliberately small, embedded, and
zero‑config so the whole product runs as a single deployable unit with no
external infrastructure beyond an AI provider key.

---

## 1. Summary

| Layer | Technology | Why |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router) | Fullstack — UI and API in one deployable, same‑origin (no CORS) |
| Language | **TypeScript 5** | Type-safe contract shared between client and server |
| UI runtime | **React 19** | Component model, server + client components |
| Styling | **Tailwind CSS v4** | Utility-first, fast to build a clean responsive wizard |
| AI generation | **Mistral Agents API** (`image_generation` tool) | Server-side image generation, FLUX1.1 [pro] Ultra under the hood |
| Persistence | **SQLite** (`better-sqlite3`, WAL mode) | Embedded, zero-config record store for saved logos |
| Image storage | **Local filesystem** | Bytes on disk, served via an API route; swappable for cloud later |
| Linting | **ESLint 9** (`eslint-config-next`) | Consistent code style |
| Runtime | **Node.js 20.9+** (tested on 24) | Required by Next 16 / `better-sqlite3` prebuilt binaries |

---

## 2. Framework — Next.js 16 (App Router)

The product is a guided, multi-step wizard that ends in a server-side AI call.
Next.js lets us ship the UI and the API as a **single fullstack app**:

- The wizard screens (Business Info → Personality → Style → Generate → Select →
  Refine → Download) are React components under the App Router.
- The AI generation, refinement, and download endpoints are **route handlers**
  under `src/app/api/*`, same-origin with the UI — no separate backend, no CORS,
  no API base URL to wire up.
- Secrets (the AI provider key) are only ever read inside route handlers, so
  they never reach the browser bundle.

> **Note:** Next.js 16 has breaking changes versus older versions. Consult
> `node_modules/next/dist/docs/` before writing route handlers or server
> components rather than relying on older conventions.

---

## 3. Language & UI — TypeScript + React 19

- A single `src/lib/types.ts` defines the **client-facing API contract**
  (the logo record shape, the wizard input shape, the uniform error shape).
  Server-only modules (which import `better-sqlite3`) are kept out of the
  browser bundle so native code never ships to the client.
- React 19 server components render the static wizard shell; client components
  own interactive state (selected traits, chosen style, the generating state).

---

## 4. Styling — Tailwind CSS v4

Tailwind v4 (via `@tailwindcss/postcss`) keeps styling colocated with markup,
which suits a UI made of many small, repeated controls — trait chips, style
cards, the 12-logo result grid, and the refinement toolbar. Mobile-responsive
layout (a non-functional requirement) is handled with Tailwind's responsive
utilities.

---

## 5. AI Generation — Mistral Agents API

Mistral has no plain image endpoint; image generation runs through the **Agents
API** with the `image_generation` tool (FLUX1.1 [pro] Ultra under the hood,
agent model `mistral-medium-latest`). The verified server-side flow is:

1. Ensure an agent with the `image_generation` tool exists (created once per
   process and cached, or reused via `MISTRAL_AGENT_ID`).
2. POST a conversation with the constructed prompt; the response carries a
   `tool_file` chunk with a `file_id`.
3. Download the image bytes from the files endpoint.

For the MVP's **12 concepts**, the generation service issues parallel prompt
variations (different layout / typography / icon directions derived from the
same brief) and collects the results. The same service powers **refinement**:
the user's refinement choice (More Professional, change color, change icon,
etc.) is folded into the prompt and re-generated.

All AI calls are **server-side only**. Failures are surfaced as typed errors
(`INVALID_PROMPT`, `TIMEOUT`, `NO_IMAGE`, `UPSTREAM_ERROR`) that route handlers
map to the user-facing, retryable error states the test plan requires.

> **Pluggability:** the AI provider sits behind a single service module
> (`src/lib/ai.ts`), so a different image model can be swapped in without
> touching the wizard or the API routes.

---

## 6. Persistence — SQLite (better-sqlite3)

Saved favorite logos are recorded in an **embedded SQLite** database via
`better-sqlite3`:

- **WAL mode** lets many readers run while a write is in progress — a good fit
  for a single-server deployment, and the basis for the concurrency guarantees
  in the test plan.
- `busy_timeout` makes concurrent writes wait rather than throw.
- `better-sqlite3` is synchronous and sub-millisecond for these queries, and it
  ships prebuilt binaries, so reviewer setup is just `npm install`.
- It is a **native module**, so it's marked external in `next.config.ts`
  (`serverExternalPackages`) and never bundled into the client.

---

## 7. Image Storage — Local Filesystem

Generated image bytes are written to a directory **outside `public/`** and
served back through `/api/images/[filename]`:

- Decouples on-disk location from the public URL, so cloud storage can be
  swapped in later without changing callers.
- **Atomic writes** (temp file + rename) mean a concurrent reader never sees a
  half-written file.
- **Unique image IDs** (UUID) mean simultaneous generations never clobber each
  other.
- Image **type is detected from magic bytes**, not a caller-provided extension.
- The serving route guards against **path traversal** (filenames are validated
  and resolved inside the storage root).

---

## 8. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
| --- | --- | --- |
| `MISTRAL_API_KEY` | **Yes** | AI provider key, server-side only |
| `MISTRAL_AGENT_ID` | No | Reuse a pre-created image-generation agent |
| `STORAGE_DIR` | No | Image storage dir (default `./storage/uploads`) |
| `DATABASE_PATH` | No | SQLite file path (default `./storage/gallery.db`) |

---

## 9. Tooling & Scripts

- `npm run dev` — local dev server (`http://localhost:3000`).
- `npm run build` / `npm run start` — production build and serve (one command
  serves both UI and API).
- `npm run lint` — ESLint.
- A concurrency stress-test script exercises the storage and DB layers with
  simultaneous writes (no API key / paid calls needed).

---

## 10. Why This Stack

- **One deployable, same-origin** — no separate frontend/backend, no CORS.
- **Embedded & zero-config** — SQLite + local disk mean setup is `npm install`.
- **Secrets stay server-side** — the AI key never reaches the browser.
- **Provider- and storage-pluggable** — the AI service and storage layer are
  isolated behind modules, so either can be replaced without touching the UI.
- **Deploy target** — needs a host with a **persistent writable disk** (Railway,
  Render, Fly.io, a VPS) rather than an ephemeral serverless filesystem.

---

## 11. Your Process — what was prioritized and why

The work was sequenced **risk-first and contract-first**: lock the things that
are hard to change late (the data shapes, the persistence + concurrency
guarantees, the AI integration) before building UI on top of them.

1. **Scaffold + env (server-side key).** Get a clean Next 16 app and prove the
   AI key is read server-side only — the most important non-negotiable.
2. **The contract (`types.ts`).** Define the brief, the concept record, and the
   uniform `{ error, code }` shape first, so client and server agree before
   either is built.
3. **Reliability primitives before features.** SQLite (WAL) and the filesystem
   store (atomic writes, UUID names, traversal guard) came next, because
   "persists across refresh" and "correct under concurrent users" are the
   constraints most likely to be wrong if bolted on later.
4. **The AI integration in isolation (`ai.ts` + `prompt.ts`).** Prove the
   Mistral Agents flow and the typed failure mapping (TIMEOUT / NO_IMAGE /
   UPSTREAM_ERROR) against the real API before wiring any UI.
5. **Routes (`/api/generate`, `/api/gallery`, `/api/refine`, images).** Compose
   the primitives into the request journey; verify the error paths with `curl`.
6. **UI last.** The wizard, the persistent gallery, the loading state, and the
   three error states — built on a backend already known to be correct.
7. **Hardening + docs.** Concurrency stress test, security checks, README.

**Why this order:** the brief is scored heavily on persistence, concurrency, and
failure handling. Those live in the backend, so the backend was made correct
first and the UI was kept thin on top of it. Commits follow this sequence
(see `current-sprint.md`) — one task at a time, not one big drop.

---

## 12. Key Decisions & Trade-offs

| Decision | Why | Trade-off accepted |
| --- | --- | --- |
| **Next.js fullstack** (not separate FE/BE) | One deployable, same-origin, secrets stay server-side, no CORS | Tied to a Node host; not a static export |
| **SQLite on local disk** (not Postgres/S3) | Zero-config, embedded, fits a single-server MVP; setup is `npm install` | Single-writer; needs a persistent volume, doesn't scale horizontally as-is |
| **Local filesystem for images** (not cloud object store) | Simplest correct server-side storage; atomic writes give concurrency safety | Bound to one machine's disk until swapped for cloud (isolated behind `storage.ts`) |
| **Mistral Agents API** (not a plain image endpoint) | Free-tier image generation via the `image_generation` tool; one provider module | Image gen via an agent is more indirect (ensure agent → conversation → file); raster-only output |
| **Save every concept, not just favorites** | The brief requires the gallery to persist *generated images and prompts* | More rows/bytes on disk; acceptable for an MVP |
| **Anonymous, single shared gallery** (no auth) | Proves persistence + concurrency without auth surface | Not multi-tenant; a real product would scope galleries per user |
| **Raster PNG download only** | Honest to what the model returns; proves the asset loop | No true vector/SVG export (listed as future, not faked) |

These choices are recorded so a reviewer can see what was chosen **and what was
deliberately not built** — the things we'd revisit before this became a real,
multi-user product are in `known-limitations.md`.
