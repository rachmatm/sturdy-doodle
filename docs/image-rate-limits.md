# Image API Rate Limits — How We Stay Under the RPM Cap

The image providers we use (Mistral Agents / FLUX, and the pixazo FLUX.1 Schnell
gateway) are consumed on **free-tier keys**, which enforce two kinds of caps:

- **Requests per minute (RPM)** — how many calls a key may make in a window.
- **Concurrency** — how many calls a key may have *in flight* at once.

Both endpoints that call the model fan out **multiple** image requests from a
single user action:

- `POST /api/generate` builds **12** concept prompts (`CONCEPT_COUNT` in
  `src/lib/prompt.ts`) and generates one image per prompt.
- `POST /api/refine` regenerates **4** variations (`REFINE_COUNT` in
  `src/app/api/refine/route.ts`).

A naive implementation — fire all 12 calls at once, all starting on the same
key — makes a single free-tier key absorb the entire burst. It hits the cap
almost immediately, returns `429 Too Many Requests`, and only a handful of the
12 images come back. (This is exactly the **"~4 of 12 succeeded"** failure we
observed; see decision-log 2026-06-13.)

This doc explains the layered solution that keeps the fan-out under the cap.

---

## The four layers

No single knob fixes this. The burst is tamed by four cooperating mechanisms,
each addressing a different facet of the cap.

### 1. Bounded concurrency — cap how many run at once

`src/app/api/generate/route.ts` never opens all 12 upstream calls
simultaneously. A small worker pool (`CONCURRENCY = 4`) processes the 12 prompts
in waves:

```
worker A: prompt 0 → 4 → 8
worker B: prompt 1 → 5 → 9
worker C: prompt 2 → 6 → 10
worker D: prompt 3 → 7 → 11
```

`mapWithConcurrency` spawns `min(CONCURRENCY, prompts.length)` workers, each
pulling the next prompt off a shared index until the queue drains. **Peak
in-flight is 4, total calls is 12, run in ~3 waves.** This directly respects the
provider's *concurrency* cap and spreads the 12 calls over time so they don't
all land inside the same RPM window.

`REFINE_COUNT = 4` in the refine route is deliberately kept **at/below** that
same concurrency bound, so a refine burst stays within the same envelope as one
generate wave (it fans out via `Promise.allSettled`).

`maxDuration = 60` (both routes) is the companion setting: running in sequential
waves takes longer than one big burst, so the serverless function timeout is
raised to give the waves room to finish.

### 2. Round-robin key strategy — spread the burst across keys

Bounding concurrency limits the burst but doesn't decide *which* key each call
starts on. By default every call starts on the first configured key, so even 4
concurrent calls still pile onto one key.

`IMAGE_KEY_STRATEGY=round-robin` (opt-in; default `fallback`) fixes this. In
`src/lib/ai.ts`, each request takes a per-process counter (`rotationCounter++`)
and **left-rotates both the provider order and each provider's key pool** by
that offset. Successive concurrent calls therefore *start* on different
providers/keys, spreading the fan-out across all configured accounts instead of
hammering one. Configure multiple keys via `MISTRAL_API_KEYS` /
`PIXAZO_API_KEYS` (comma-separated) to give the rotation something to spread
across.

### 3. Fallback rollover — a 429 is not fatal

Even spread out, an individual key can still hit its cap. `generateImage` walks
the **entire** provider×key chain for each image: if the first attempt returns a
429 (or any failure), it rolls over to the next key, then the next provider,
returning the first success. Every provider×key is tried before the image is
declared failed — under both `fallback` and `round-robin` (round-robin only
changes the *starting* point, not the coverage).

So a rate-limited key degrades gracefully into "use a different account for this
one image" rather than "this image failed."

### 4. Per-image isolation — partial success, never all-or-nothing

Both routes collect results with settled semantics (`mapWithConcurrency` returns
`PromiseSettledResult[]`; refine uses `Promise.allSettled`). One image hitting an
unrecoverable cap does **not** sink the others — if 10 of 12 succeed, the user
gets 10 concepts. Only when **every** call fails does the route throw a typed
`UPSTREAM_ERROR` so the UI shows a retryable state. Nothing partial is persisted
on total failure.

---

## How the layers combine

For a 12-image generate fan-out with round-robin enabled and several keys:

1. **At most 4** calls are in flight at any instant (layer 1).
2. Those 4 calls **start on different keys/providers** (layer 2).
3. Any call that still 429s **rolls over** to another key/provider (layer 3).
4. Any call that genuinely can't be served is **dropped individually**, leaving
   the rest of the batch intact (layer 4).

The net effect: the same 12-image burst that previously returned ~4 images now
returns the full set on a free-tier setup with a couple of keys configured.

---

## Tunables

| Setting | Where | Effect |
| --- | --- | --- |
| `CONCURRENCY` | `src/app/api/generate/route.ts` | Max in-flight upstream calls (default 4). Lower = gentler on the cap, more waves. |
| `CONCEPT_COUNT` | `src/lib/prompt.ts` | Total images per generate (default 12; capped by the `VARIATIONS` list). Fewer = fewer total calls. |
| `REFINE_COUNT` | `src/app/api/refine/route.ts` | Variations per refine (default 4). |
| `IMAGE_KEY_STRATEGY` | env (`ai.ts`) | `round-robin` to spread the starting key per request; `fallback` (default) for strict priority. |
| `IMAGE_PROVIDER` | env (`ai.ts`) | Ordered provider list, e.g. `pixazo,mistral`. More providers = more rollover headroom. |
| `MISTRAL_API_KEYS` / `PIXAZO_API_KEYS` | env (`ai.ts`) | Comma-separated key pools. More keys = more capacity to spread across. |
| `maxDuration` | both routes | Serverless timeout; must exceed the time for all waves to finish. |

**Rule of thumb for "faster *and* safer":** reduce `CONCEPT_COUNT` (fewer total
calls) while keeping `CONCURRENCY` at or near its current value — that cuts both
the RPM pressure and the wall-clock waves. Halving the count *and* the
concurrency together cuts the calls but keeps the same number of waves, so it is
safer but not faster.

---

## What this does *not* solve

- **Cross-instance limits.** `rotationCounter` is a per-process counter. Two app
  instances each rotate independently and don't share a view of how much of the
  RPM budget has been spent. A shared store (e.g. Redis) would be needed for a
  fleet-wide token bucket.
- **No backoff / `Retry-After`.** A 429 rolls over to the next key immediately;
  we don't read the provider's `Retry-After` header or exponentially back off.
  If *every* key is capped at once, the whole chain exhausts quickly.
- **No request coalescing or caching.** Identical briefs are generated fresh
  every time; there is no dedupe of in-flight identical prompts.

These are acceptable for the MVP's single-instance, free-tier posture; see
`known-limitations.md` for the broader honest list.
