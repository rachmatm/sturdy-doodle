# AI Logo Generator

An AI image-generation web app in the **logo niche** for small-business owners.
Describe your business in a few plain fields, the backend generates distinct
logo concepts through a real AI image API, and every result — image **and**
prompt — is saved to a **personal gallery that persists across refreshes**. Pick
any saved logo, tweak the prompt, and re-generate without starting over.

- All AI calls run **server-side** (the API key never reaches the browser).
- Images are stored on disk; gallery records live in SQLite — both persistent.
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
- A **Mistral API key** — free to create at <https://console.mistral.ai/>.
  This is the only external dependency; image generation runs through Mistral's
  Agents API.

### 2. Clone & install

```bash
git clone git@github.com:rachmatm/sturdy-doodle.git
cd sturdy-doodle
npm install
```

`npm install` also builds the native `better-sqlite3` module (prebuilt binaries,
no toolchain needed in the common case).

### 3. Configure environment

```bash
cp .env.example .env.local
```

Then open `.env.local` and set your key:

| Variable | Required | Description |
| --- | --- | --- |
| `MISTRAL_API_KEY` | **Yes** | Server-side AI key. Get one at <https://console.mistral.ai/>. |
| `MISTRAL_AGENT_ID` | No | Reuse a pre-created image-generation agent. Leave blank to auto-create one on first use. |
| `STORAGE_DIR` | No | Where image bytes are written. Defaults to `./storage/uploads`. |
| `DATABASE_PATH` | No | SQLite file for saved logos. Defaults to `./storage/gallery.db`. |

Only `MISTRAL_API_KEY` is needed to run. `.env.local` is gitignored — never
commit it.

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
| `GET /api/gallery` | The persisted gallery (newest first). _(in progress)_ |
| `POST /api/refine` | Re-generate from a saved concept with a prompt tweak. _(in progress)_ |
| `GET /api/images/[filename]` | Serve stored image bytes safely. |
| `GET /api/download` | Export a logo as PNG. _(in progress)_ |

Errors use a uniform `{ error, code }` shape. Codes: `INVALID_REQUEST`,
`INVALID_PROMPT`, `TIMEOUT`, `NO_IMAGE`, `UPSTREAM_ERROR`, `INTERNAL`.

---

## Project status

The backend library layer and the `health`, `generate`, and `images` routes are
built; the `gallery` / `refine` / `download` routes and the wizard UI are in
progress. See [`docs/development-status.md`](./docs/development-status.md) and
[`docs/current-sprint.md`](./docs/current-sprint.md) for the live picture, and
[`docs/known-limitations.md`](./docs/known-limitations.md) for the honest list of
what doesn't work well yet.

---

## Deployment

The app needs a **persistent writable disk** for image storage and the SQLite
file, so deploy to a host with a persistent volume (Railway, Render, Fly.io, a
VPS) rather than an ephemeral serverless filesystem.

1. Set `MISTRAL_API_KEY` in the host's environment.
2. Point `STORAGE_DIR` and `DATABASE_PATH` at the mounted volume.
3. `npm run build && npm run start`.

`/api/health` doubles as a readiness probe.

---

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS v4 ·
Mistral Agents API (`image_generation`) · SQLite (`better-sqlite3`, WAL) ·
local filesystem storage. Rationale in
[`docs/tech-stack.md`](./docs/tech-stack.md).
