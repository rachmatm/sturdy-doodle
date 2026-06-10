# User Journey — AI Logo Generator

**Goal:** let a non-designer create a logo by answering a few plain questions,
keep every result in a gallery that survives refreshes, and let them re-generate
from any saved result by tweaking the prompt.

This document covers two journeys the assignment asks for:

- **A. The App Journey (request flow)** — how a prompt travels browser →
  backend → AI API → back as an image.
- **B. The User Journey (screens)** — what the person actually does.

---

## A. The App Journey (request flow)

This is the path of a single "Generate" action. The browser never talks to the
AI provider — only to our backend.

```
1. Browser        User fills the 4-field brief and clicks "Generate My Logos".
        │
        │  POST /api/generate  { brief }   (same-origin JSON)
        ▼
2. Backend        Validate the brief. Reject empty/over-long input as
   (route)        INVALID_PROMPT before any AI call.
        │
        │  prompt.ts turns the brief into N distinct logo prompts
        ▼
3. Backend        ai.ts calls the Mistral Agents API (image_generation tool),
   (ai.ts)        server-side, with the MISTRAL_API_KEY. Each call is
        │         time-bounded (AbortController).
        ▼
4. AI API         Mistral generates the image and returns a file_id; ai.ts
                  downloads the raw image bytes.
        │
        ▼
5. Backend        storage.ts writes bytes to disk atomically (UUID filename);
   (store)        db.ts records { id, prompt, image_url, params } in SQLite.
        │
        │  200 { concepts: [...] }   or   { error, code }
        ▼
6. Browser        Renders the new concepts and prepends them to the gallery.
                  On error, shows the matching retryable state.
```

**Re-generation** reuses steps 2–6: the request is `POST /api/refine` with a
saved `conceptId` plus a tweak; `prompt.ts` folds the tweak into the stored
prompt, and the new variations are saved alongside the original.

**On refresh,** the browser calls `GET /api/gallery`, which reads the saved
records from SQLite — so the gallery is exactly as the user left it.

---

## B. The User Journey (screens)

The flow is a short guided wizard, then a persistent gallery the user lives in.

### Step 1 — Tell us about your business

**Screen title:** *Tell us about your business*

- **Business name** — e.g. "Rachmat Laundry", "Toko Maju Jaya".
- **What does your business do?** — one or two sentences, e.g. *"Laundry and dry
  cleaning for busy families."*

Validation: both required; description length-bounded. This is the
**invalid-prompt** guard before any AI call.

### Step 2 — Brand personality

**Screen title:** *How should customers feel about your business?* — choose up
to 3.

Trustworthy · Modern · Friendly · Premium · Creative · Professional ·
Innovative · Fun · Elegant · Strong · Simple

Selecting a 4th trait is blocked.

### Step 3 — Logo style

**Screen title:** *Which style do you prefer?* (visual cards)

- **Text Only** (Google, Coca-Cola)
- **Icon + Text** (Spotify, Slack)
- **Badge** (Starbucks)
- **Abstract Symbol** (Nike, Adidas)
- **Mascot** (KFC)

One style required. Color, industry, audience, and typography are inferred by
the backend — the user is never asked to art-direct.

### Step 4 — Generate (the meaningful wait)

Button: **Generate My Logos**.

The generating state makes the 10–30s wait expected, not broken: a progress
indicator, the brief echoed back, and copy like *"Designing your concepts — this
usually takes 10–30 seconds."* The gallery below stays interactive.

### Step 5 — Results land in the gallery

The new concepts appear and are **already saved**. Each card shows the logo and
can be selected to download or re-generate. Nothing is lost if the user
refreshes or closes the tab — the gallery reloads from the server.

### Step 6 — Re-generate from any saved result

**Screen title:** *Make it better* — open any saved logo and tweak its prompt:

- **Personality:** More Professional / Modern / Friendly / Premium / Minimalist
- **Visual:** Change Color / Icon / Font

The tweak edits the stored prompt and re-generates new variations **without
restarting the wizard**. The original stays; the new ones are added to the
gallery.

### Step 7 — Download

Download the chosen logo as **PNG**. (SVG / transparent PNG / favicon are
future, not built — see product-requirements §5.2.)

---

## Worked example — brief → prompt

The niche's value is the brief→prompt translation the user never sees.

**User input**

| Field | Value |
| --- | --- |
| Business name | Rachmat Laundry |
| Description | Laundry and dry cleaning services for busy families |
| Personality | Trustworthy, Friendly, Professional |
| Style | Icon + Text |
| Color | (left to AI) |

**Prompt the backend builds**

```
Create a professional logo.
Business name: Rachmat Laundry
Industry (inferred): Laundry / home services
Target audience (inferred): families and working professionals
Brand personality: Trustworthy, Friendly, Professional
Style: Icon + wordmark
Design principles: simple, memorable, scalable, flat
Color: a palette appropriate to the brand personality
Produce one distinct logo direction.
```

The backend issues several such prompts (varying layout / typography / icon
direction) so the user gets distinct concepts to choose from.

---

## What the user never has to do

- Write a prompt or pick a model.
- Choose colors, fonts, or layout.
- Re-enter the brief to iterate — re-generation starts from a saved result.
- Worry about losing work — the gallery is server-side and persistent.
