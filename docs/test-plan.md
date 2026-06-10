# Test Plan

## Overview

This document defines test scenarios for the AI Logo Generator.

### Scope

Covered features:

1. Business Information Form
2. Brand Personality Selection
3. Logo Style Selection
4. Logo Generation
5. Logo Selection
6. Re-generation (refine from a saved result)
7. Download (PNG)
8. Gallery persistence
9. Concurrency

---

## 0. Brief Non-Negotiables → Coverage

The brief's required behaviours map to these cases. These are the ones to
demonstrate on camera (at least two of the three failure states are mandatory).

| Non-negotiable | Test case(s) |
| --- | --- |
| AI calls go through the backend only | TC-SEC-003 |
| Gallery persists across refresh | TC-GAL-001, TC-GAL-002 |
| Re-generate from a saved result | TC-REF-001..003 |
| Correct under concurrent users | TC-CON-001 |
| Failure: invalid prompt | TC-BIZ-002/003, TC-GEN-007 |
| Failure: API timeout | TC-GEN-004 |
| Failure: broken response | TC-GEN-005, TC-GEN-006 |
| Meaningful 10–30s loading | TC-PERF-001 |

---

# 1. Business Information Form

## Happy Path

### TC-BIZ-001 Submit valid business information

Given:

* Business name is provided
* Business description is provided

When:

* User clicks Continue

Then:

* User proceeds to the next step

---

## Validation Tests

### TC-BIZ-002 Empty business name

Given:

* Business name is empty

When:

* User clicks Continue

Then:

* Validation error is displayed

---

### TC-BIZ-003 Empty business description

Given:

* Business description is empty

When:

* User clicks Continue

Then:

* Validation error is displayed

---

## Boundary Tests

### TC-BIZ-004 Maximum business name length

Given:

* Business name reaches maximum allowed length

When:

* User submits form

Then:

* Form is accepted

---

### TC-BIZ-005 Very long description

Given:

* Description exceeds maximum allowed length

When:

* User submits form

Then:

* Validation message is displayed

---

# 2. Brand Personality Selection

## Happy Path

### TC-PER-001 Select up to 3 traits

Given:

* Personality options are displayed

When:

* User selects 3 traits

Then:

* Selection is saved

---

## Validation Tests

### TC-PER-002 Select more than allowed

Given:

* 3 traits are already selected

When:

* User selects another trait

Then:

* Additional selection is blocked

---

# 3. Logo Style Selection

## Happy Path

### TC-STYLE-001 Select logo style

Given:

* Style options are displayed

When:

* User selects a style

Then:

* Selection is saved

---

## Validation Tests

### TC-STYLE-002 No style selected

Given:

* No style selected

When:

* User clicks Continue

Then:

* Validation error is displayed

---

# 4. Logo Generation

## Happy Path

### TC-GEN-001 Generate logos successfully

Given:

* Required fields are completed

When:

* User clicks Generate

Then:

* 12 logo concepts are generated
* Logos are displayed

---

### TC-GEN-002 AI-selected color generation

Given:

* User selects "Let AI Choose"

When:

* User clicks Generate

Then:

* Logos are generated successfully

---

## Boundary Tests

### TC-GEN-003 Complex business description

Given:

* Description contains industry-specific terminology

When:

* User generates logos

Then:

* Logos are generated successfully

---

## Error Handling Tests

### TC-GEN-004 AI timeout

Given:

* AI service response exceeds timeout threshold

When:

* User generates logos

Then:

* Error message is displayed
* Retry option is available

---

### TC-GEN-005 Invalid AI response

Given:

* AI service returns malformed output

When:

* Processing occurs

Then:

* Error is handled gracefully

---

### TC-GEN-006 Network interruption

Given:

* Internet connection is lost

When:

* User generates logos

Then:

* User receives a clear error message (UPSTREAM_ERROR), retryable

---

### TC-GEN-007 Invalid prompt rejected before AI call

Given:

* The brief is empty, or the description exceeds the max length

When:

* User clicks Generate

Then:

* Request is rejected as INVALID_PROMPT with no AI call made
* No partial record is written to the gallery

---

# 5. Logo Selection

## Happy Path

### TC-SEL-001 Select favorite logo

Given:

* Generated logos are displayed

When:

* User clicks a logo

Then:

* Logo is marked as selected

---

### TC-SEL-002 Change selected logo

Given:

* A logo is already selected

When:

* User selects another logo

Then:

* New logo becomes selected

---

# 6. Re-generation (refine from a saved result)

## Happy Path

### TC-REF-001 Make logo more professional

Given:

* User opened a logo already saved in the gallery

When:

* User chooses "More Professional" and re-generates

Then:

* New variations are generated and added to the gallery
* The original saved logo is unchanged and still present
* The wizard is not reset — the user did not re-enter the brief

---

### TC-REF-002 Change color

Given:

* User selected a logo

When:

* User changes color preference

Then:

* Updated logo variations are generated

---

### TC-REF-003 Change icon

Given:

* User selected a logo

When:

* User requests a new icon

Then:

* Updated variations are generated

---

## Error Handling Tests

### TC-REF-004 Refinement service failure

Given:

* AI refinement request fails

When:

* User submits refinement

Then:

* Error message is displayed

---

# 7. Download Assets

## Happy Path

### TC-DL-001 Download PNG

Given:

* User selected a logo

When:

* User clicks Download PNG

Then:

* PNG file is downloaded

---

> **Note:** SVG, transparent PNG, and favicon export are **out of MVP scope**
> (see product-requirements §5.2 — the model returns raster only). No test cases
> here; they are future work, not faked.

## Error Handling Tests

### TC-DL-004 Download failure

Given:

* Asset generation fails

When:

* User requests download

Then:

* Error message is displayed

---

# 8. Gallery Persistence

## Happy Path

### TC-GAL-001 Gallery survives a page refresh

Given:

* The user has generated at least one logo

When:

* The user refreshes the page (or reopens the app)

Then:

* The gallery loads from the server (`GET /api/gallery`)
* All previously generated logos and their prompts are still visible

---

### TC-GAL-002 Generated images stored server-side

Given:

* A successful generation

When:

* The stored record and file are inspected

Then:

* The image bytes exist on the server disk (not only in the browser)
* A SQLite row holds the prompt, image URL, and brief metadata

---

# 9. Concurrency

## Reliability

### TC-CON-001 Simultaneous generations from multiple users

Given:

* Two or more clients generate at the same time

When:

* Their requests are processed concurrently

Then:

* No image file collides or is half-written (UUID + atomic writes)
* No DB write fails under contention (WAL + busy_timeout)
* Each client receives its own correct results

---

# Non-Functional Tests

## Performance

### TC-PERF-001 Logo generation performance

Given:

* Valid user input

When:

* User generates logos

Then:

* Initial results appear within 30 seconds

---

## Reliability

### TC-REL-001 Consecutive generations

Given:

* User generates logos multiple times

When:

* Requests are processed

Then:

* System remains stable

---

## Security

### TC-SEC-001 Script injection attempt

Given:

* User enters HTML or JavaScript in form fields

When:

* Data is submitted

Then:

* Input is sanitized
* No script execution occurs

---

### TC-SEC-002 SQL injection attempt

Given:

* User enters malicious SQL-like strings

When:

* Data is submitted

Then:

* System remains secure
* No database errors occur

---

### TC-SEC-003 AI key never reaches the browser

Given:

* The app is built and running

When:

* The client bundle and network traffic are inspected

Then:

* `MISTRAL_API_KEY` appears in no client bundle or browser request
* All AI calls originate from the backend only

---

### TC-SEC-004 Image path traversal blocked

Given:

* A request to `/api/images/` with a traversal filename (e.g. `../../etc/passwd`)

When:

* The route resolves the filename

Then:

* The request is rejected; resolution stays inside the storage root
