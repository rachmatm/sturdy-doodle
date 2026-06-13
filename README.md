# AI Logo Generator

An AI image-generation web app in the **logo niche** for small-business owners.
Describe your business in a few plain fields, the backend generates distinct
logo concepts through a real AI image API, and every result — image **and**
prompt — is saved to a **personal gallery that persists across refreshes**. Pick
any saved logo, tweak the prompt, and re-generate without starting over.

- All AI calls run **server-side** (the API key never reaches the browser).
- Storage is **pluggable, selected from the environment**: images on the local
  filesystem or **Vercel Blob**, gallery records in local **SQLite** or **Turso** —
  so the same build runs on a persistent-disk host *or* on a diskless serverless
  platform like Vercel. All four options are persistent.
- Built to stay correct under **concurrent users** and to handle the three
  failure states (invalid prompt, API timeout, broken response) visibly.

> Full design docs are in [`docs/`](./docs) — start with
> [`product-requirements.md`](./docs/product-requirements.md),
> [`architecture.md`](./docs/architecture.md), and
> [`tech-stack.md`](./docs/tech-stack.md).

---

## Run it locally (under 15 minutes)

### 1. Prerequisites

- **Node.js 20.9+** (tested on 24) and npm. Check with `node -v`.
- An **image-provider API key** — the simplest is a free **Mistral** key from
  <https://console.mistral.ai/> (image generation runs through Mistral's Agents
  API). **Pixazo** (FLUX.1 Schnell) is supported as an alternative or fallback;
  see the env table below.

### 2. Clone & install

```bash
git clone git@github.com:rachmatm/sturdy-doodle.git
cd sturdy-doodle
npm install
```

`npm install` also builds the native `better-sqlite3` module (prebuilt binaries,
no toolchain needed in the common case); it's only loaded when the local SQLite
backend is active, so a Turso deploy is unaffected by it.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Then open `.env.local` and set your key:

| Variable | Required | Description |
| --- | --- | --- |
| `MISTRAL_API_KEY` | **Yes**¹ | Server-side AI key. Get one at <https://console.mistral.ai/>. |
| `MISTRAL_AGENT_ID` | No | Pin a specific image-generation agent. Leave blank to auto-manage: the app creates one on first use, persists its id, and reuses it across restarts (re-creating only if it was deleted upstream). |
| `STORAGE_DIR` | No | Where image bytes are written (local filesystem backend). Defaults to `./storage/uploads`. |
| `DATABASE_PATH` | No | SQLite file for saved logos (local SQLite backend). Defaults to `./storage/gallery.db`. |

¹ At least one provider key is required. `MISTRAL_API_KEY` is the simplest;
alternatively configure Pixazo (below) and set `IMAGE_PROVIDER=pixazo`.
`.env.local` is gitignored — never commit it.

**Image provider & fallback (optional).** The AI service can try multiple
providers and keys per logo, returning the first success — so a rate-limited
free-tier key (429) rolls over to the next. Leave these unset to use
`MISTRAL_API_KEY` alone.

| Variable | Description |
| --- | --- |
| `IMAGE_PROVIDER` | Ordered, comma-separated providers to try per logo, e.g. `pixazo,mistral`. Defaults to `mistral`. |
| `MISTRAL_API_KEYS` | Extra Mistral keys (comma-separated), tried after `MISTRAL_API_KEY`. |
| `PIXAZO_API_KEY` | Pixazo FLUX.1 Schnell key (server-side only). Get one at <https://pixazo.ai/>. |
| `PIXAZO_API_KEYS` | Extra Pixazo keys (comma-separated), tried after `PIXAZO_API_KEY`. |

**Storage backend (auto-selected at runtime).** Leave the variables below unset
to use the local filesystem + SQLite defaults above. Set a pair to switch that
half to its cloud backend — needed on a diskless host like Vercel:

| Variable(s) | Switches to | Notes |
| --- | --- | --- |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | **Turso** (libSQL) for gallery records | Both must be set. Create a DB at <https://turso.tech/>. |
| `BLOB_STORE_ID` + `BLOB_READ_WRITE_TOKEN` | **Vercel Blob** for image bytes | Both must be set. Injected automatically when you attach a Blob store on Vercel. |

### 4. Start the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. Sanity-check the backend wiring:

```bash
curl http://localhost:3000/api/health
# { "status": "ok", "aiKeyConfigured": true }
```

If `aiKeyConfigured` is `false`, your key isn't being read — recheck
`.env.local` and restart the dev server.

> **Note on timing:** image generation is real and takes **10–30 seconds** per
> request. That wait is expected, not a hang.

---

## Available scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server at <http://localhost:3000>. |
| `npm run build` | Production build. |
| `npm run start` | Serve the production build (one process serves UI + API). |
| `npm run lint` | Run ESLint. |

---

## API endpoints

All AI calls go through these server routes; the browser only ever talks to your
own backend.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness + whether the AI key is configured. |
| `POST /api/generate` | Validate a brief → generate concepts → store + record → return them. |
| `GET /api/gallery` | The persisted gallery (newest first), paginated. |
| `POST /api/refine` | Re-generate from a saved concept with a prompt tweak. |
| `GET /api/images/[filename]` | Serve stored image bytes safely. |
| `GET /api/download` | Export a saved logo as a PNG download. |

Errors use a uniform `{ error, code }` shape. Codes: `INVALID_REQUEST`,
`INVALID_PROMPT`, `TIMEOUT`, `NO_IMAGE`, `UPSTREAM_ERROR`, `INTERNAL`.

---

## Using the app

1. **Describe your business** in the wizard — name, what it does, up to 3
   personality traits, and a logo style. Industry, audience, and colors are
   inferred for you; you never have to think like a designer.
2. **Generate.** The backend writes the prompt and generates a set of distinct
   concepts. Generation takes 10–30s and shows a progress state the whole time.
3. **Everything is saved.** Each concept lands in the gallery with its prompt and
   stays there across refreshes.
4. **Refine.** Select any saved logo and apply a tweak (More Modern, different
   color, …) to generate new variations — the original stays put.
5. **Download.** Save any concept as a PNG.

If generation fails — invalid brief, a slow/timed-out API, or a broken response —
you get a clear, retryable message and your gallery is left untouched.

## Project status

Backend (all six API routes) and the full wizard/gallery UI are built and
verified in a real browser; the complete loop — describe → generate → persistent
gallery → refine → download, plus the three retryable failure states — works
end-to-end. Storage is now Vercel-compatible (Turso + Blob, verified live against
both backends), so the only outstanding item is deployment to a live URL. See
[`docs/development-status.md`](./docs/development-status.md) and
[`docs/current-sprint.md`](./docs/current-sprint.md) for the live picture, and
[`docs/known-limitations.md`](./docs/known-limitations.md) for the honest list of
what doesn't work well yet.

---

## Deployment

The storage backend is chosen from the environment, so the app deploys two ways.

**Vercel (or any diskless serverless host).** Provide cloud storage instead of a
local disk:

1. Set `MISTRAL_API_KEY` (and any other provider keys).
2. Attach a **Vercel Blob** store — this injects `BLOB_STORE_ID` and
   `BLOB_READ_WRITE_TOKEN` automatically.
3. Create a **Turso** database and set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`.
4. Deploy. The native `better-sqlite3` module is never loaded when Turso is
   active, so it won't break the serverless build.

**Persistent-disk host (Railway, Render, Fly.io, a VPS).** Use the local
backends against a mounted volume:

1. Set `MISTRAL_API_KEY` in the host's environment.
2. Point `STORAGE_DIR` and `DATABASE_PATH` at the mounted volume (leave the
   Turso/Blob variables unset).
3. `npm run build && npm run start`.

`/api/health` doubles as a readiness probe.

---

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS v4 ·
Mistral Agents API (`image_generation`) · records in SQLite (`better-sqlite3`,
WAL) or Turso (`@libsql/client`) · images on the local filesystem or Vercel Blob
(`@vercel/blob`). Rationale in [`docs/tech-stack.md`](./docs/tech-stack.md).
