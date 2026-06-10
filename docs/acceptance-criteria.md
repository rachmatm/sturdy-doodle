# Acceptance Criteria — AI Logo Generator

These are the conditions the build must satisfy to meet the brief. They are
phrased so a reviewer can check each one against the live app and the demo.

## Must-pass (the brief's non-negotiables)

* **Backend-only AI:** the AI API key is never in the browser; all generation
  goes through the backend.
* **Persistent gallery:** every generated logo and its prompt is saved
  server-side and is still visible after a page refresh.
* **Re-generation:** the user can pick any saved logo, tweak its prompt, and
  re-generate — without re-entering the brief.
* **Concurrency:** simultaneous generations from multiple users don't collide,
  corrupt files, or fail under DB contention.
* **Meaningful loading:** a 10–30s generation shows clear progress, not a frozen
  screen.
* **Three failure states handled visibly and retryably:** invalid prompt, API
  timeout, broken/empty response.
* **Live URL + runnable README:** the deployed app works at review time and a
  reviewer can run it locally in under 15 minutes.

---

## Happy Path

### TC-001 Generate logos successfully

Given:

* Business name is provided
* Business description is provided
* Personality traits are selected (up to 3)
* Logo style is selected

When:

* User clicks Generate

Then:

* Distinct logo concepts are generated
* Each is saved to the gallery with its prompt
* Logos are displayed to the user

---

### TC-002 Generate with AI-chosen colors

Given:

* No explicit color preference is set

When:

* User clicks Generate

Then:

* Logos are generated successfully
* The backend infers an appropriate palette from the brief

---

### TC-003 Gallery persists across refresh

Given:

* The user has generated at least one logo

When:

* The user refreshes the page

Then:

* The gallery reloads from the server with all prior logos and prompts intact

---

### TC-004 Re-generate from a saved logo

Given:

* A logo exists in the gallery

When:

* The user opens it, applies a tweak (e.g. "More Professional"), and re-generates

Then:

* New variations are added to the gallery
* The original remains; the brief is not re-entered

---

## Validation Tests

### TC-005 Empty business name

Given:

* Business name is empty

When:

* User clicks Generate

Then:

* Validation error is displayed; no AI call is made

---

### TC-006 Empty business description

Given:

* Description is empty

When:

* User clicks Generate

Then:

* Validation error is displayed; no AI call is made

---

## Boundary Tests

### TC-007 Very long business description

Given:

* Description exceeds the maximum allowed length

When:

* User clicks Generate

Then:

* The over-length input is rejected as an invalid prompt before any AI call

---

## Error Handling Tests

### TC-008 AI provider timeout

Given:

* AI service does not respond within the timeout threshold

When:

* User clicks Generate

Then:

* User sees a clear TIMEOUT error
* Retry is available; the gallery is untouched

---

### TC-009 Broken / invalid AI response

Given:

* AI returns a non-2xx, a network error, or a payload with no usable image

When:

* Processing occurs

Then:

* System handles it gracefully (NO_IMAGE / UPSTREAM_ERROR)
* No crash; nothing partial is saved; retry is available

---

### TC-010 Concurrent generations

Given:

* Multiple users generate at the same time

When:

* Requests are processed concurrently

Then:

* No file collision or half-written image; no DB failure
* Each user gets their own correct results
