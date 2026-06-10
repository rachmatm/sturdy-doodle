# Known Limitations — The Honest Part

The brief explicitly asks for at least one honest thing that doesn't work well.
An honest list beats a claim that everything is perfect. Here is what we know
falls short, why, and what we'd do about it.

---

## 1. Logo text is often misspelled or garbled

This is the biggest real limitation. The underlying diffusion model (FLUX via
the Mistral Agents API) is unreliable at rendering exact lettering — for a
**wordmark logo**, where the business name *is* the design, that matters a lot.
We pass the exact name in the prompt and generate several concepts so the user
can pick the cleanest one, but some runs still produce nonsense text.

*What we'd do:* composite the real business name as a text layer on top of an
AI-generated mark, instead of asking the model to render letters.

## 2. "Logos" are raster, not vector

A real logo is expected as clean, infinitely-scalable vector art (SVG). The model
returns a PNG/JPEG. We are honest about this: PNG download only, and SVG /
favicon / transparent export are listed as **future work, not built** — rather
than shipping a fake "SVG" that's just a wrapped bitmap.

*What we'd do:* add a vectorization step (e.g. potrace / a tracing service)
behind the download endpoint.

## 3. Single-server persistence, no horizontal scaling

The gallery is SQLite + local disk. This is correct and concurrency-safe for one
server (WAL, atomic writes, UUID names), and it satisfies "persists across
refresh" and "correct under concurrent users" on a single instance. But it does
**not** scale to multiple app instances — two servers wouldn't share the same
SQLite file or disk.

*What we'd do:* move records to a networked DB (Postgres) and bytes to object
storage (S3/R2). Both are already isolated behind `db.ts` / `storage.ts`, so the
swap doesn't touch the UI.

## 4. One shared, anonymous gallery

There are no accounts. Every visitor sees the same gallery. For an MVP that
proves persistence and concurrency this is intentional, but it's clearly not how
a real product would work — one user could see another's logos.

*What we'd do:* add lightweight auth (or at least per-session scoping) and a
`user_id` column.

## 5. Latency is real and not yet optimized

Generating several concepts means several diffusion calls; 10–30s is normal and
the UI treats it as expected, but we don't stream partial results — the user
waits for the whole batch. There's also no caching of identical briefs.

*What we'd do:* stream concepts as each one finishes, and/or reduce the batch
size with a "generate more" affordance.

## 6. No automated test suite yet

Failure paths and concurrency are verified manually (`curl` for error codes, a
stress script for simultaneous writes) rather than by an automated suite. That's
honest about the current state — the test cases in `test-plan.md` describe the
intended coverage, not a green CI run.

---

## What we deliberately chose *not* to build (and why)

These are not failures — they're scope decisions, repeated here so the picture is
complete (full rationale in product-requirements §5.2 and tech-stack §12):
accounts, a drag-and-drop editor, true vector export, like/dislike learning, and
multi-tenant workspaces. Each would add surface without testing anything the
brief actually asks for, so the effort went into making the required loop —
generate → persist → re-generate, with the three failure states — correct.
