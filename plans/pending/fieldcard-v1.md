# Fieldcard v1 — full-stack build plan (DRAFT, pending your answers)

Status: draft. Nothing is built. Defaults below are my recommendations; the four decisions in the question round can change them.

## What we are building
A multi-trade job-management web app. One workspace per client. An admin defines the job form (add, rename, hide, restore, reorder fields). Crew enter jobs on phone or desktop, attach up to 5 compressed photos, view them in a Data table, and export CSV, Excel and a printable PDF job card.
The "Electrical contractor" template reproduces the real client's form, 17 table headers and printed card exactly, as seed data. The real client's own app and Supabase project are never touched.

## Stack (recommended)
- Frontend: React + TypeScript + Vite + Tailwind, TanStack Query and Table, react-hook-form + zod. Built from the canvas boards.
- Backend: Python FastAPI, SQLAlchemy 2 + Alembic, Pydantic. (TypeScript/NestJS is the alternative.)
- Database: PostgreSQL. Local in Docker; hosted on Supabase free (Postgres + private Storage only).
- Auth: own email + password in the API. argon2id hashing, 15-minute access token, refresh token in an httpOnly cookie. Roles: admin, supervisor, crew.
- Photos: browser resizes to 1280 px WebP (about 150 KB), plus a 320 px thumb. Upload goes through short-lived signed URLs to a private bucket. Server re-validates type and size.
- PDF: server-side from an HTML template (WeasyPrint). Excel: openpyxl. CSV: stdlib with formula-injection guard.
- Tests: pytest + real Postgres, Playwright for the 3 critical flows. CI: GitHub Actions.

## Data model
- workspaces(id, name, template)
- users(id, email, password_hash, name)
- memberships(user_id, workspace_id, role)
- field_groups(id, workspace_id, name, position)
- form_fields(id, workspace_id, key IMMUTABLE slug, label, type, options jsonb, group_id, position, required, in_table, on_card, is_core, is_hidden) — UNIQUE(workspace_id, key)
- jobs(id, workspace_id, job_no, job_date date, description, status, closed_at, data jsonb, created_by, timestamps, deleted_at) — UNIQUE(workspace_id, job_no) WHERE deleted_at IS NULL
- job_counters(workspace_id, next_no) — atomic number allocation
- job_photos(id, job_id, workspace_id, storage_key, thumb_key, bytes)
- audit_log(id, workspace_id, user_id, action, entity, entity_id, diff jsonb, at)

Rules locked in the model:
- Four core fields (Date, Job Card No., Description, Status) are real columns and cannot be removed or hidden.
- Everything else lives in `jobs.data` keyed by the immutable field key. Renaming changes the label only, so old data and export headers stay correct.
- Hide = flag. Data stays. Restore brings it back.
- Field type is locked after creation (to change it: add a new field, hide the old one). Dropdown/choice options are archived, never deleted, so old jobs still show their value.
- Money fields are NUMERIC, never float. Dates are `date`, shown dd-mm-yyyy.
- Sorting, filtering and search on dynamic fields only use keys loaded from `form_fields` for that workspace (never raw client strings) and bound parameters. GIN index on `data`.

## Phases (vertical slices, riskiest first)

### Phase 0 — Scaffold (S)
Verified when: `docker compose up` starts API + Postgres; `/health` returns ok; CI green on an empty test.
Files: repo root, `api/`, `web/`, `docker-compose.yml`, `.github/workflows/ci.yml`, README.
Blocked by: none.

### Phase 1 — Dynamic-schema core (M) — the risky one
Steps: 1.1 migrations for the tables above; 1.2 create/list fields; 1.3 create job validated against the workspace's fields; 1.4 list jobs with sort, filter, search, pagination across dynamic fields; 1.5 minimal table page.
Acceptance: a job with 24 fields round-trips; sorting by a dynamic number field is numeric; an injected key such as `x'); drop table` is rejected; 10,000 seeded jobs list in under 300 ms (EXPLAIN checked).
Verification: `pytest api/tests/test_dynamic_jobs.py` + EXPLAIN ANALYZE recorded in the PR.
Blocked by: 0.

### Phase 2 — Auth, roles, tenant isolation (M)
Acceptance: login/logout/refresh; password reset; admin vs supervisor vs crew permissions from ONE derivation point shared by API and UI; a user in workspace A gets 404 (not 403) for any workspace B id on every endpoint.
Verification: `pytest api/tests/test_tenant_isolation.py` (every route, both directions) and a test that removing the permission check makes a test fail.
Blocked by: 1.

### Phase 3 — Job Entry and Data table from the canvas (L → split 3a entry, 3b table and detail)
Acceptance: form renders from schema for all 8 field types; the Electrical template shows the client's exact field order and the 17 exact headers; phone and desktop match the boards; keyboard and screen-reader pass on the form.
Verification: Playwright "create job" and "edit job" flows at 390 px and 1440 px.
Blocked by: 2.

### Phase 4 — Admin Form setup and workspace creation (M)
Acceptance: add, rename, hide, restore, reorder fields; edit options; templates (Electrical, Civil, Electronics, Plumbing/HVAC, Blank) create a workspace in one step; Data-table column picker for workspaces with many fields.
Verification: Playwright "admin adds Shift field, crew sees it, hide it, old jobs keep value".
Blocked by: 3.

### Phase 5 — Photos (M)
Acceptance: up to 5 per job; stored size about 150 KB; EXIF (GPS) stripped; wrong type or over 400 KB rejected by the server even if the browser is bypassed; URLs are signed and expire; deleting a job removes its files.
Verification: `pytest api/tests/test_photos.py` + manual upload of a 12 MB phone photo.
Blocked by: 3.

### Phase 6 — Exports and printed job card (M)
Acceptance: CSV and Excel headers equal the field labels in table order; any cell starting with `=`, `+`, `-` or `@` is neutralised; the PDF card matches the client's layout for the Electrical template and escapes all user text.
Verification: `pytest api/tests/test_exports.py` + open the Excel file and PDF by eye.
Blocked by: 4.

### Phase 7 — Hardening, deploy, portfolio polish (M)
Acceptance: rate limits on login and uploads; security headers and CSP; Postgres RLS as a second tenant layer; audit log screen; one-click demo logins (Admin, Crew) with seeded fake data; keep-alive job so the demo is never asleep; README with architecture diagram, setup, and a case-study write-up.
Verification: security review on the diff; cold-visit test of the live URL after 8 days idle.
Blocked by: 5, 6.

## Decision log
| Decision | Chosen | Why |
| --- | --- | --- |
| One workspace per client | yes | Simplest isolation; matches how the real client works |
| Hide, not delete | yes | Old jobs keep their values; exports stay valid |
| Immutable field key | yes | Rename must not break data or exports |
| Type locked after creation | yes | Changing type on existing jsonb data is the classic data-loss path |
| Own auth in the API | yes | One authority for roles; no second source of truth |
| Online-only v1 | yes | Offline queue is a separate project; mitigate with upload retry |
| Backend: FastAPI + PostgreSQL, React + TypeScript web | yes | User asked for easiest and cheapest; one language per side, typed end to end |
| Roles read from the DB per request, never from the JWT | yes | A demoted user loses power immediately; the UI reads the same permission sets |
| Password reset is admin-driven, only for accounts that admin created | yes | No email infrastructure on a free tier; prevents one tenant's admin taking over another's user |
| Refresh-token reuse detection with a 30 s grace window | yes | Two tabs share one cookie jar; without the window a normal page load looks like theft |
| Close Date is stamped by the system when a job is closed | assumption | The brief did not say who sets it; cleared on reopen |
| Data-table header and order are separate from the form label and order (`table_label`, `table_position`) | yes | The client's 16 table headers differ from its form labels |
| Photos go through the API and are re-encoded server-side | yes | Strips EXIF/GPS, rejects non-images, one place enforces the 5-photo limit |
| Storage behind an interface: local disk (dev/tests), S3-compatible (prod) | yes | Free hosts wipe local disk; production refuses to start on it |
| Rate limiter is in-process | yes | One free-tier instance; swap for a shared store if scaled out |
| Demo accounts: one-click sign-in, sign-in details locked | yes | Visitors cannot lock each other out; `python -m app.seed --reset` rebuilds the demo |
| Public sign-up off on the portfolio deployment | yes | Open sign-up on a public free tier invites storage abuse |
| Postgres row-level security as a second tenant layer | dropped from v1 | Needs a non-owner DB role and per-request settings; tenant isolation is enforced and tested in the API instead. Revisit if the data becomes sensitive |

## Not yet specified
- Phase 6: exact PDF layout details — needs the client's printed card reference to hand (I will use the screenshots from earlier).
- Phase 7: custom domain; keep-alive target.
- Fog: Import from File (column mapping UI), Master Data tab content, Overview dashboard metrics. Researched when reached, and only if in scope.

## Always / Never
- Always: workspace-scoped queries; server-side validation; tests next to each slice; fake data only.
- Never: touch the real client's Supabase project, data, name or logo; change the client's 17 headers or PDF format inside the Electrical template; store real photos or personal data in the demo; ship a secret to git.

## Progress
| Phase | Status |
| --- | --- |
| 0 Scaffold | done |
| 1 Dynamic-schema core | done, 10,000-row list in 11-17 ms |
| 2 Auth and isolation | done, every workspace route tested for anonymous 401 and other-tenant 404 |
| 3 Entry and table | done, checked in a browser at 1440 px and 390 px |
| 4 Form setup | done: fields, options, order, users, roles, activity log |
| 5 Photos | done on local-disk storage; the S3 backend is written but not run against a real bucket |
| 6 Exports and PDF | done: CSV, Excel, PDF job card; formula injection neutralised |
| 7 Hardening and deploy | code and config done; not deployed (needs the owner's Supabase, Render and Vercel accounts) |
