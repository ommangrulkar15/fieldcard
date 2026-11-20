# Fieldcard

Job cards for field crews. A crew member fills in a form on their phone; the office sees the same jobs in a searchable table, exports them to Excel, and prints a job card. Each business sets up its own form, so an electrician, a plumber and a civil contractor can each use it without code changes.

> Fieldcard is a portfolio project. Every name, place and amount in the demo is invented. It was designed after a real job-tracking tool built for an electrical contractor, but contains none of that client's data, name or branding.

## Live demo (GitHub Pages)

The `pages` workflow publishes an interactive demo: the real React screens running against a small
in-browser stand-in for the API (`web/src/demo/server.ts`). No server, no database, nothing saved; a reload
resets it. Sign-in, form setup, Excel export, the PDF job card and the activity log are only in the full app.

To publish: make the repo public, then **Settings, Pages, Source: GitHub Actions**, and push to `main`.
The site appears at `https://<your-username>.github.io/<repo-name>/`.
Run it locally with `cd web && VITE_DEMO=1 npm run dev`.
Footer links live in `web/src/landing/links.ts`.

## What it does

- **Job Entry** — a form made from the workspace's own fields, grouped into sections. Job numbers are assigned by the server.
- **Data** — a table with search, sort on any column, pagination, and a detail sheet. Columns, headers and order are configured separately from the form.
- **Admin panel** — add, rename, hide, restore and reorder fields; edit dropdown options; add users and set roles; read an activity log.
- **Photos** — up to 5 per job, shrunk in the browser and re-encoded on the server (this removes camera and GPS data). Visible only inside the app, never on the printed card.
- **Exports** — CSV and Excel with exactly the table's headers, following the current search, sort and filters; a PDF job card per job.
- **Roles** — crew enter and edit jobs; supervisors also delete and export; admins also set up the form and users.
- **Templates** — "Electrical contractor" reproduces the reference tool's form fields and its 16 table headers; "Blank" starts empty.

## Architecture

```mermaid
flowchart LR
  Browser["React + TypeScript web app<br/>(Vite, Tailwind, TanStack Query)"]
  API["FastAPI API<br/>auth · permissions · validation"]
  DB[("PostgreSQL<br/>jobs.data JSONB + form_fields")]
  Store[("Photo storage<br/>local disk / S3-compatible")]
  Browser -- "JSON + short-lived access token<br/>httpOnly refresh cookie" --> API
  API --> DB
  API --> Store
```

The interesting part is the **dynamic schema**. Each workspace has its own `form_fields` rows. A field has an immutable `key`, a changeable `label`, and a locked `type`. The five core fields (date, job number, description, status, close date) are real columns on `jobs`; everything else lives in one `jobs.data` JSONB column.

- Renaming a field never touches stored data, because data is keyed by `key`.
- "Deleting" a field hides it; old values stay and old exports stay valid.
- Removed dropdown options are archived, not deleted, so old jobs remain valid.
- Sort and filter keys are checked against the workspace's own field list and passed as bound parameters, so a column name from a request never reaches SQL as text.
- Numbers are stored as decimal strings and cast to `numeric` for sorting, so 9 sorts before 10.
- Search uses a `pg_trgm` index. A list page over 10,000 jobs answers in 11 to 17 ms.

## Security model

- **Tenant isolation** is enforced in the API: every workspace route checks membership. A non-member gets 404 (the workspace does not exist for them); a member without the permission gets 403. A test enumerates every workspace route from the OpenAPI document and checks anonymous → 401 and other-tenant → 404 for each, so a newly added route is covered automatically.
- **Roles are read from the database on every request**, never copied into the token, so demoting someone takes effect at once. The UI reads the same permission sets from `/auth/me`.
- **Passwords**: argon2id. Unknown emails cost the same time as wrong passwords.
- **Sessions**: 15-minute access token in memory; 14-day rotating refresh token in an `httpOnly` cookie, stored only as a hash. Reusing an old refresh token revokes the session. Cookie calls also need an `X-Fieldcard` header.
- **Sign-in rate limits**: 30 requests per address and 5 wrong passwords per address+email, per 5 minutes.
- **Uploads**: decoded and re-encoded (never stored as received), 8 MB cap, pixel-count cap against decompression bombs, only JPEG/PNG/WebP, storage keys built from UUIDs only.
- **Exports**: any cell starting with `=`, `+`, `-` or `@` is prefixed so a spreadsheet shows it instead of running it.
- **Headers**: the API sends a locked-down CSP and `nosniff`; `render.yaml` (and `web/vercel.json` for Vercel) carries the web app's CSP, checked in a browser against the whole sign-in, entry, photo, table and PDF flow.
- **Production refuses to start** on the development signing key or on local-disk photo storage.

## Run it locally

You need Python 3.13, Node 22 and PostgreSQL 16.

```bash
# 1. database (or use your own Postgres and set DATABASE_URL in api/.env)
docker compose up -d db

# 2. API
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp ../.env.example .env        # adjust DATABASE_URL if needed
alembic upgrade head
uvicorn app.main:app --reload  # http://localhost:8000/docs

# 3. web
cd ../web
npm ci
npm run dev                    # http://localhost:5173
```

Optional: `python -m app.seed` loads the demo workspace (45 invented jobs). Set `DEMO_ENABLED=true` to show the one-click demo buttons on the sign-in page.

## Tests

```bash
cd api
createdb fieldcard_test        # once; UTF-8
TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/fieldcard_test python -m pytest
python -m pytest -m perf       # the 10,000-job timing check
```

127 tests. The migrations are built, downgraded and re-upgraded on every run. The tests that guard the important rules (tenant scoping, the photo limit, formula neutralisation, token reuse) were each checked by breaking the rule on purpose and confirming a test fails.

## Deploying (free tier)

Live: **https://fieldcard-web-qxgu.onrender.com** (sample data; sign in with a one-click demo role).

| Part | Where | Notes |
| --- | --- | --- |
| Database | Supabase Postgres (Singapore) | `DATABASE_URL` is the **session pooler** string (IPv4, port 5432). Migrations run at API start and turn on row-level security for every table, so Supabase's public REST API sees nothing. |
| Photos | Supabase Storage, private bucket `job-photos` | Reached through its S3 endpoint with an access key (path-style URLs). |
| API | Render web service (Docker, Singapore), `render.yaml` | Sleeps after 15 idle minutes; the web app shows a "waking up" state. |
| Web | Render static site, same `render.yaml` | Proxies `/api/*` to the API, so the sign-in cookie is first-party. |
| Keep-alive | Supabase `pg_cron` job `fieldcard-keepalive` | Pings `/health` every 10 minutes from 06:30 to 23:30 India time. |

Secrets (`DATABASE_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) are set only in the Render dashboard. `SECRET_KEY` is generated by Render.

The demo workspace rebuilds itself on the first demo sign-in after 24 hours, so visitors' changes never pile up. Run `python -m app.seed --reset` to rebuild it sooner.

## Known limits

Stated plainly, so nobody finds them by surprise:

- **Tenant isolation lives in the API.** RLS is on but has no policies: it shuts out every other route into the database, and the API (the tables' owner) enforces and tests per-workspace isolation.
- **The rate limiter is in memory**, which is right for one instance. Scaling out needs a shared store.
- **No email, so no "forgot password".** An admin resets passwords for accounts they created.
- **Online only.** No offline queue.
- **No "Import from File"**, no billing.
- **CI actions are referenced by tag**, not pinned to commit SHAs.
- **Exports stop at 20,000 rows** (the response carries an `X-Export-Truncated` header).
- **Deleting a job is a soft delete**; its photo files stay in storage.
- **The PDF job card is a clean generic layout**, not a copy of any client's printed form.
- **Free hosting means cold starts.** The app says when the server is waking up.
- **No automated browser tests are committed.** The flows were checked by hand-driven browser runs; a Playwright suite would be the next step.
