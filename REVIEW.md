# Review log

A multi-role review (code reviewer, security tester, load tester, UI/accessibility tester) of Fieldcard.
Every fix below has a regression test that failed before the fix.

## Fixed

| # | Found by | Problem | Fix |
|---|----------|---------|-----|
| 1 | Concurrency test | Two requests holding one refresh token could both rotate it (4 of 16 succeeded) | Row lock on the token (`services/auth.py`) |
| 2 | Concurrency test | Simultaneous edits to different fields of one job silently erased each other (4 of 6 lost) | Row lock on the job during update (`services/jobs.py`) |
| 3 | Abuse test | No request-size cap: a 10 MB JSON body was parsed on every endpoint | `limits.py`: 1 MB for JSON, 9 MB for photo upload, also for chunked bodies |
| 4 | Abuse test | 50,000 junk keys produced a 1.2 MB validation reply; FastAPI echoed the submitted input back | Max 200 fields per job; 422 replies name the field, never echo input |
| 5 | Code review | Rate limiter only freed keys when revisited, so rotating emails grew memory without bound | Periodic sweep of expired keys |
| 6 | UI test | Entry form re-seeded on every background refetch and could overwrite typing | Seed once per job |
| 7 | UI test | Changing a filter fetched the old page before resetting to page 1 | Page derived from the filter signature |
| 8 | Accessibility test | Touch targets under 44 px on phone (admin reorder arrows, small buttons, workspace picker, auth links) | Sized to 44 px |
| 9 | Lint | 4 React lint warnings | Cleared (0 warnings) |

## Attacked and held

Cross-tenant read, write, delete, export, card, audit, fields, members and photos (13 routes, all 404);
forged, `alg:none` and tampered JWTs; SQL injection through sort and filter keys; wildcard search;
CSV formula injection; 5 MB password and 2 MB email on login; 60 concurrent job creates (no duplicate numbers);
brute-force login (429 after 5).

## Load (20,000 jobs, one workspace)

List, deep page, sort by custom field, search and filter: 30 to 50 ms. CSV export 0.9 s, XLSX 2.6 s.
200 mixed requests at 40-way concurrency: p95 0.8 s, no errors.

## Known and not fixed

No Postgres row-level security; in-process rate limiter (single instance only); S3 backend untested
against a real bucket; no email password reset; soft-deleted jobs keep their photo files; XLSX export of
20,000 rows is built in memory.
