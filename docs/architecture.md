# Architecture — AI Logo Generator

This document describes how the AI Logo Generator is structured: the request
flow, the module boundaries, the data model, and how the system meets the
reliability, concurrency, and security constraints in the brief.

See [tech-stack.md](./tech-stack.md) for the technology choices and
[product-requirements.md](./product-requirements.md) for the functional scope.

---

## 0. App Journey (request flow)

The brief asks how a prompt travels browser → backend → AI → back. Mapped to the
reference flow, with our specifics:

| # | Reference step | In this app |
| --- | --- | --- |
| 1 | User inputs on the frontend | The 4-field brief (business name, description, ≤3 traits, style) |
| 2 | Frontend → backend | `POST /api/generate { brief }`, same-origin JSON. The browser never holds the AI key. |
| 3 | Backend → AI API | `prompt.ts` builds distinct logo prompts; `ai.ts` calls the Mistral Agents API server-side, each call time-bounded. |
| 4 | AI API → backend | Mistral returns a `file_id`; `ai.ts` downloads the image bytes. |
| 5 | Backend → frontend | Bytes saved to disk + recorded in SQLite, then `200 { concepts }` (or `{ error, code }`). |
| 6 | User sees the result | New concepts render and are prepended to the persistent gallery. |

**Re-generation** is the same path via `POST /api/refine` from a saved concept;
**refresh** is `GET /api/gallery` reading the saved records. Details in §4–§5.

---

## 1. High-Level Shape

A single **Next.js 16 fullstack app**. The browser runs a guided wizard; the
server exposes a small set of API routes that talk to the AI provider, write
image bytes to disk, and record saved logos in SQLite. UI and API are
same-origin — no separate backend.

```
┌──────────────────────────────────────────────────────────────┐
│                          Browser (React 19)                    │
│                                                                │
│   Wizard:  Business Info → Personality → Style → Generate      │
│            → Select → Refine → Download                        │
│   State:   wizard inputs, generated concepts, selection        │
└───────────────┬────────────────────────────────────────────────┘
                │  fetch (same-origin JSON)
                ▼
┌──────────────────────────────────────────────────────────────┐
│                  Next.js API routes (server)                   │
│                                                                │
│  /api/generate   /api/refine   /api/download                   │
│  /api/gallery    /api/images/[filename]   /api/health          │
└───┬───────────────┬────────────────────┬──────────────────────┘
    │               │                    │
    ▼               ▼                    ▼
┌────────┐   ┌──────────────┐    ┌────────────────┐
│  ai.ts │   │  storage.ts  │    │     db.ts      │
│ Mistral│   │ filesystem   │    │ SQLite (WAL)   │
│ Agents │   │ (atomic)     │    │ better-sqlite3 │
└───┬────┘   └──────┬───────┘    └───────┬────────┘
    │               │                    │
    ▼               ▼                    ▼
 Mistral API   ./storage/uploads   ./storage/gallery.db
 (key server-                       (saved logo records)
  side only)
```

---

## 2. Directory Layout

```
src/
├── app/
│   ├── page.tsx                 # Wizard host (server shell)
│   ├── layout.tsx               # Root layout, global styles
│   ├── globals.css              # Tailwind entry
│   └── api/
│       ├── generate/route.ts    # POST: brief → concepts (saved to gallery)
│       ├── refine/route.ts      # POST: saved concept + tweak → new variations
│       ├── gallery/route.ts     # GET:  persisted gallery (paginated, newest first)
│       ├── download/route.ts    # GET:  export a logo as PNG
│       ├── images/[filename]/route.ts  # GET: serve stored image bytes
│       └── health/route.ts      # GET:  liveness + config check
├── components/
│   ├── Wizard.tsx               # Step orchestration + wizard state
│   ├── steps/                   # One component per wizard step
│   │   ├── BusinessInfoStep.tsx
│   │   ├── PersonalityStep.tsx
│   │   ├── StyleStep.tsx
│   │   ├── ResultsStep.tsx      # Concept grid + selection
│   │   ├── RefineStep.tsx
│   │   └── DownloadStep.tsx
│   ├── Gallery.tsx              # Persistent gallery (hydrated from /api/gallery)
│   ├── GeneratingCard.tsx       # Progress UI for the 10-30s call
│   ├── LogoCard.tsx             # Single concept (select / re-generate / download)
│   └── ErrorBanner.tsx          # Retryable error states
└── lib/
    ├── types.ts                 # Shared client/server contract
    ├── prompt.ts                # Brief → AI prompt construction
    ├── ai.ts                    # Mistral Agents service (server only)
    ├── storage.ts               # Image bytes on disk (server only)
    ├── db.ts                    # SQLite persistence (server only)
    ├── http.ts                  # Uniform { error, code } responses
    └── errorCopy.ts             # User-facing copy per error code
```

**Module boundary rule:** anything that imports `better-sqlite3` or reads the
AI key (`db.ts`, `ai.ts`, `storage.ts`) is **server-only** and must never be
imported by a client component. The client imports `types.ts` for the contract
shapes only.

---

## 3. Wizard Flow (Client)

The wizard is a client-side state machine. Each step validates its own input
before advancing (satisfying the form validation test cases):

| Step | Input | Validation |
| --- | --- | --- |
| 1. Business Info | name, description | both non-empty; description length bounded |
| 2. Personality | up to 3 traits | at most 3 selectable; further picks blocked |
| 3. Style | one of 5 styles | a style must be selected to continue |
| 4. Generate | — | fires `POST /api/generate`, shows `GeneratingCard` |
| 5. Select | pick one from the gallery | exactly one selected; selection can change |
| 6. Re-generate | tweak choice | fires `POST /api/refine` on a **saved** concept, adds variations |
| 7. Download | format | fires `GET /api/download` |

Every generated concept is **saved to the gallery immediately** — selection is
just for download/re-generation, not a precondition for persistence. On load the
client hydrates the gallery from `GET /api/gallery`, so it survives refresh and
return visits.

The wizard holds: the collected **brief** (steps 1–3), the **gallery** (loaded
from the server + newly generated concepts), the **selected concept**, and a
transient **generating / error** status used to render `GeneratingCard` or
`ErrorBanner`.

---

## 4. Generation Pipeline (Server)

`POST /api/generate` is the core pipeline:

1. **Parse & validate** the request body — malformed JSON or an empty/invalid
   brief is a `400` (`INVALID_REQUEST` / `INVALID_PROMPT`) before any AI call.
2. **Construct the prompt** (`prompt.ts`) — turn the structured brief (business
   name, description, personality traits, style; industry/audience/colors
   inferred when "Let AI Choose" is selected) into a generation prompt with the
   design principles (simple, memorable, scalable, flat).
3. **Generate 12 concepts** (`ai.ts`) — issue parallel prompt variations
   (layout / typography / icon directions) through the Mistral Agents API and
   collect the image bytes. Each call is time-bounded.
4. **Persist** the bytes to disk (`storage.ts`) with a unique UUID filename and
   an atomic write.
5. **Record** every generated concept in SQLite (`db.ts`) — image URL, the exact
   prompt sent, and the brief/refinement metadata. This is what makes the
   gallery durable across refreshes.
6. **Respond** with the concept records (image URLs + metadata), or a uniform
   `{ error, code }` on failure. Generation is **partial-success tolerant**: if
   some of the parallel concepts fail, the ones that succeeded are still saved
   and returned.

**Refinement** (`POST /api/refine`) reuses steps 2–6: the selected concept plus
the refinement directive (More Professional / Modern / Friendly / Premium /
Minimalist, or change color / icon / font) is folded back into the prompt and
re-generated into new variations.

---

## 5. Data Model

### SQLite — saved logo records

```sql
CREATE TABLE gallery (
  id             TEXT PRIMARY KEY,   -- UUID, also the image filename stem
  prompt         TEXT NOT NULL,      -- prompt actually sent to the AI
  image_filename TEXT NOT NULL,      -- file on disk
  image_url      TEXT NOT NULL,      -- /api/images/<file>
  content_type   TEXT NOT NULL,      -- detected from magic bytes
  model          TEXT NOT NULL,      -- generating model
  created_at     TEXT NOT NULL,      -- ISO-8601
  params         TEXT                -- JSON: brief / style / refinement metadata
);
CREATE INDEX idx_gallery_created_at ON gallery (created_at DESC);
```

The `params` column stores the structured brief and refinement choices as JSON,
so a saved logo carries enough context to be regenerated or refined again.

### Image bytes — filesystem

Stored under `STORAGE_DIR` (default `./storage/uploads`), named `<uuid>.<ext>`,
outside `public/`, served only through `/api/images/[filename]`.

---

## 6. Error Handling

Every API error returns the **same JSON shape** — `{ error, code }` — so the
client branches on `code` programmatically while showing `error` to the user.

| Code | Meaning | HTTP |
| --- | --- | --- |
| `INVALID_REQUEST` | Body wasn't valid JSON | 400 |
| `INVALID_PROMPT` | Empty / too-long brief | 400 |
| `TIMEOUT` | AI call exceeded the threshold | 504 |
| `NO_IMAGE` | AI returned no image (e.g. content refusal) | 502 |
| `UPSTREAM_ERROR` | Non-2xx / network failure from the provider | 502 |
| `INTERNAL` | Anything unexpected (opaque, no detail leaked) | 500 |

Rich detail is logged server-side; only the friendly message is sent to the
client. Each error state in the UI is **retryable**.

**The three required failure states** map onto these codes:

| Required failure | Code(s) | Where it's caught |
| --- | --- | --- |
| Invalid prompt | `INVALID_REQUEST`, `INVALID_PROMPT` | Validated before any AI call |
| API timeout / slow | `TIMEOUT` | `AbortController` in `ai.ts` |
| Broken response | `NO_IMAGE`, `UPSTREAM_ERROR` | Non-2xx, network error, or no usable image in the payload |

Nothing partial is persisted on failure, so a retry starts clean.

---

## 7. Concurrency & Reliability

- **Unique image IDs** (UUID) — simultaneous generations never collide.
- **Atomic writes** (temp file + rename on the same filesystem) — readers never
  observe a half-written image.
- **SQLite WAL mode** + `busy_timeout` — concurrent readers proceed during a
  write; writers wait rather than throw under contention.
- **Per-call timeouts** — a hung upstream call surfaces as a `TIMEOUT` instead
  of hanging the user; the concepts are generated with bounded parallelism.
- **Gallery durability** — because every concept is recorded in SQLite as soon
  as its bytes are written, a refresh, crash, or redeploy (with a persistent
  disk) leaves the gallery intact. The browser holds no source of truth.

---

## 8. Security

- **Secrets server-side only** — the AI key is read exclusively inside route
  handlers; it is never part of the client bundle.
- **Input validation** — briefs are validated and length-bounded server-side;
  the prompt builder is the single source of truth for the length limit.
- **Path-traversal protection** — `/api/images/[filename]` validates the
  filename against a safe pattern and resolves it inside the storage root,
  rejecting anything that escapes.
- **Magic-byte type detection** — stored content type is derived from the bytes,
  not a caller-supplied extension.
- **No injection surface** — user input is parameterized into SQLite prepared
  statements and never concatenated into queries (covers the SQL/script
  injection test cases); React escapes rendered text by default.

---

## 9. AI Knowledge — inputs, outputs, limitations, failure modes

The brief asks the implementation to reflect how AI image generation actually
works. The design accounts for the following:

**Inputs.** The model takes a text prompt only — there is no structured "logo"
mode. The product's real work is the brief→prompt translation in `prompt.ts`:
turning business facts into design language (style, personality, "simple,
memorable, scalable, flat") the model responds to. Garbage prompt → garbage
logo, so prompt quality is a first-class concern, not an afterthought.

**Outputs.** The model returns a **raster** image (PNG/JPEG/WebP), not a vector.
This is why true SVG export is out of scope (PRD §5.2): a logo people expect as
clean vector art is fundamentally a raster here. We detect the real type from
magic bytes rather than trusting an extension.

**Limitations we design around:**

- **Text rendering is unreliable.** Diffusion models routinely misspell or
  garble lettering, which matters a lot for wordmark logos. We lean on the brief
  (exact business name in the prompt) and surface multiple concepts so the user
  can pick the one that rendered the text cleanly — but we do not claim perfect
  text.
- **Non-determinism.** The same prompt yields different images. Re-generation
  embraces this: tweak the prompt, get fresh variations, keep the old ones.
- **Latency is inherent.** 10–30s is normal for image diffusion; the UI treats
  the wait as expected (C4), not as a hang.

**Failure modes we handle explicitly** (see §6): provider timeouts, non-2xx /
network errors, and "successful" responses that carry no usable image (e.g. a
content refusal). Each becomes a typed, retryable state rather than a crash or a
silent empty result.

---

## 10. Deployment

The app needs a **persistent writable disk** for image storage and the SQLite
file, so deploy to a host with a persistent volume (Railway, Render, Fly.io, a
VPS) rather than an ephemeral serverless filesystem:

1. Set `MISTRAL_API_KEY`.
2. Point `STORAGE_DIR` and `DATABASE_PATH` at the mounted volume.
3. `npm run build && npm run start` — one process serves both UI and API.

`/api/health` returns a liveness + config check (confirms the AI key is wired
up) for readiness probes.
