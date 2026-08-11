# Golf API course growth emergency decision

Date: 2026-08-11  
Owner: Golfriend Admin

## Decision

Golfriend must use the paid 500-call monthly Golf API allowance to grow the authoritative Firebase `courses` collection. The App reads approved cached Firebase course data. It must not repeatedly call Golf API for a course already held in Firebase.

## Required flow

1. A signed-in Director, Manager, or Course Coordinator previews a geographic import.
2. The server calls Golf API; the API key never enters the browser.
3. Admin compares provider course IDs with Firebase before requesting course details.
4. Preview reports discovered, already cached, missing, and remaining counts without writing courses.
5. A coordinator explicitly commits the preview.
6. Only still-missing courses consume detail calls and are created in Firebase.
7. Missing or doubtful coordinates create a coordinator-review item; fabricated course or hole data is prohibited.
8. Every job records API-call estimates, additions, skips, errors, operator, timestamps, and source job ID.
9. Quota rejection stops the batch safely. Existing records and manual corrections are never overwritten.

## Immediate safety corrections

- Remove hard-coded provider credentials from the Admin browser bundle.
- Do not delete records merely because two courses share a club ID; multi-course clubs are valid.
- No production import may run without a dry-run preview and measurable expected Firebase growth.

## Acceptance gate

A controlled preview and commit must prove: `Firebase after = Firebase before + added`, existing provider IDs remain unchanged, duplicate additions are zero, errors are visible, and newly approved courses are searchable by the App.
