# Product Requirements — AI Logo Generator

> **Niche:** AI image generation for **logos**. The user is a small-business
> owner who needs a usable logo and has zero design vocabulary. The niche shapes
> every decision below — inputs are business facts (not art-direction jargon),
> outputs are logo concepts, and the gallery is a "brand workspace" the owner
> returns to.

This document is scoped to the Actual Inc. assignment. It states what the app
must do, what it deliberately does **not** do, and how it satisfies the
non-negotiable constraints.

---

## 1. What we're building

An AI image-generation web app, in the logo niche, with a **persistent personal
gallery**. A user describes their business, the backend generates logo concepts
through a real AI image API, and every result — image **and** its prompt — is
saved server-side and stays visible after a refresh. From any saved result the
user can **tweak the prompt and re-generate** without starting the flow over.

A first-time user in this niche should be able to open the app and get a logo
**without any explanation**.

---

## 2. Non-negotiable constraints (from the brief)

These are requirements, not goals. Each maps to a section of
[architecture.md](./architecture.md).

| # | Constraint | How we meet it |
| --- | --- | --- |
| C1 | AI API calls go through the backend only, never the browser | The Mistral key is read only inside route handlers (`lib/ai.ts`); it is never in the client bundle. See architecture §1, §8. |
| C2 | Images stored server-side; gallery persists across refresh | Bytes written to disk (`lib/storage.ts`); records in SQLite (`lib/db.ts`); the gallery loads from `GET /api/gallery` on every page load. |
| C3 | Correct under multiple concurrent users | UUID filenames, atomic writes, SQLite WAL + `busy_timeout`. See architecture §7. |
| C4 | Loading is meaningful (10–30s is normal) | A dedicated generating state shows progress and never blocks the gallery; the user is told the wait is expected. |
| C5 | Handle failure states: timeout, invalid prompt, broken response | Three typed, retryable error states surfaced in the UI. See §6 and architecture §6. |
| C6 | Live via a public URL at submission | Deployed to a host with a persistent disk (architecture §9). |
| C7 | Uses a real, free-tier AI image API | Mistral Agents API (`image_generation` tool, FLUX1.1 [pro] Ultra under the hood). |

---

## 3. Problem & user

Small-business owners (restaurants, laundries, shops, freelancers) need a logo
but can't afford a designer, don't know design terms, and want results fast.
General AI image tools ask for a free-text prompt and a model name — that blank
box is exactly what this user can't fill in.

**The product's job:** translate a few plain business facts into a strong image
prompt on the user's behalf, so they never have to think like a designer or a
prompt engineer.

---

## 4. Core user value

1. **Describe, don't design.** Answer four plain questions; the backend writes
   the prompt.
2. **See real options.** Get a set of distinct logo concepts to react to.
3. **Keep everything.** Every generation is saved to a gallery that survives
   refreshes and return visits.
4. **Iterate, don't restart.** Pick any saved logo, tweak its prompt, and
   re-generate from there.

---

## 5. Scope

### 5.1 In scope (MVP)

**Inputs — the brief (4 fields).** The niche lets us keep inputs minimal:

- Business name
- What the business does (short description)
- Up to 3 brand-personality traits (Trustworthy, Modern, Friendly, Premium,
  Creative, Professional, Innovative, Fun, Elegant, Strong, Simple)
- Logo style (Text Only, Icon + Text, Badge, Abstract Symbol, Mascot)

Industry, audience, color, and typography are **inferred by the backend** from
the brief, so the user is never asked to make a design decision.

**Generation.** The backend turns the brief into a prompt and generates a small
set of distinct logo concepts (multiple layout / typography / icon directions).

**Persistent gallery.** Every generated concept is saved with its image and the
exact prompt sent to the AI. The gallery is server-side and reloads on refresh.

**Re-generation.** From any saved concept the user can apply a refinement
(More Professional / Modern / Friendly / Premium / Minimalist, or change
color / icon / font) — which **edits the prompt** — and re-generate new
variations. The original stays in the gallery; the new ones are added.

**Download.** Save the chosen logo as a PNG.

**Failure handling.** Timeout, invalid prompt, and broken/empty AI response are
each shown as a clear, retryable state (§6).

### 5.2 Out of scope — and why (deliberately not built)

The brief rewards handling complexity *without over-engineering*. We are not
building:

| Not building | Why |
| --- | --- |
| Accounts / auth | The gallery is the workspace; a single anonymous gallery is enough to prove persistence and concurrency. Auth adds surface without testing anything the brief asks for. |
| Vector / SVG editing, drag-and-drop canvas | Editing is done by re-prompting, not by a manual editor. A real editor is a different product. |
| True SVG / favicon / social-kit export | PNG download proves the "usable asset" loop. Real vectorization needs a different pipeline; listed as future, not faked. |
| Like/dislike training, recommendations | No feedback loop in an MVP; it would imply learning we don't do. |
| Multi-tenant workspaces, collaboration | Outside the niche's core job (one owner, one logo). |

These appear as **Future Enhancements** (§9), never as half-built UI.

---

## 6. Failure states (required)

All three are real and individually demonstrable.

| State | Trigger | What the user sees |
| --- | --- | --- |
| **Invalid prompt** | Empty brief, over-length description, or an empty re-generation tweak | Inline validation before any AI call; the Generate action is blocked with a clear reason. |
| **Timeout / slow API** | AI call exceeds the server timeout | A retryable error: "Generation took too long — try again." The gallery and prior results are untouched. |
| **Broken response** | AI returns a non-2xx, a network error, or a payload with no usable image | A retryable error explaining the provider failed; nothing partial is saved. |

Every error state keeps the user where they are and offers retry — no dead ends,
no lost gallery.

---

## 7. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-1 | Collect the 4-field brief with per-field validation. |
| FR-2 | Generate logo concepts from the brief via the backend only. |
| FR-3 | Persist every concept (image bytes + prompt + metadata) server-side. |
| FR-4 | Show the full gallery on load and after refresh, newest first. |
| FR-5 | Let the user open any saved concept, tweak its prompt, and re-generate. |
| FR-6 | Surface the three failure states as clear, retryable UI. |
| FR-7 | Show a meaningful loading state for the 10–30s generation. |
| FR-8 | Download a chosen logo as PNG. |
| FR-9 | Remain correct when multiple users generate at the same time. |

---

## 8. Non-functional requirements

- **Usability:** completable without instructions; mobile-responsive.
- **Performance:** generation typically completes inside the 10–30s window;
  the gallery render is instant from stored records.
- **Reliability:** AI failures degrade to retryable states, never crashes.
- **Security:** all input validated server-side; SQLite via prepared
  statements; image route guarded against path traversal; secrets server-side.

---

## 9. Future enhancements (not in MVP)

- True SVG / transparent-PNG / favicon export via a vectorization step.
- Per-user galleries with accounts.
- Brand kit (palette + typography) generated alongside the logo.
- Saved brief presets for quick re-runs.
