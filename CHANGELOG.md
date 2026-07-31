# Changelog

## Known Issues (Unresolved)

- `shared/types.ts`'s `BuildingSpace` interface only models the columns actually
  read by current call sites (`id`, `building_id`, `floor`, `space_type`). The
  real `building_spaces` table has more columns; expand the interface if a new
  call site needs them instead of widening it speculatively now.
- DB row shapes from `server/db/index.ts` (`db.all<T>` / `db.get<T>`) are
  asserted via a generic, not validated at runtime. If a SQL query's columns
  drift from the `T` passed at the call site, TypeScript will not catch it -
  only zod-validated boundaries (request bodies, Claude's JSON output) get
  runtime safety. Accepted tradeoff, not a bug: these rows come from trusted
  internal queries, not external input.
- Residential buildings (halls not owned by any of the 6 teams) generate
  `building_tasks` rows tagged `period = 'afternoon'` but are never assigned
  to a custodian - `POST /api/schedules/generate` only auto-assigns common
  (team-owned) buildings. Deferred deliberately, not a bug: scheduling
  residential coverage is a separate follow-up task.
- `@libsql/client`'s local-file driver appears to hold an OS-level lock on a
  db file for the rest of a process's life once anything in that process has
  called `createClient()` on it, even read-only, even after `.close()`.
  Confirmed on Windows; unconfirmed on Linux (prod). Worked around in
  `scripts/init-db.js` (`--reset`'s unlink retries a few times) and in the
  test suite (every test file gets its own db path, one process spawns
  another to do a write it will later need to delete). Not something this
  app's own code can fix - it's inside the client library.

---

## 2026-07-13

### Migrated client and server to TypeScript

- Added `tsconfig.json` (server + `shared/`) and `client/tsconfig.json` (DOM
  lib, `@shared/*` path alias). Both run with `noEmit: true`; `npm run
  typecheck` runs both in sequence.
- Runtime: server executes via `tsx` (dev: `tsx watch server/index.ts`, prod:
  `tsx server/index.ts`) instead of a `tsc` build step feeding plain `node`.
  Deferred: revisit a real build step (esbuild/tsc) only if startup latency
  or route count grows enough to justify it - not worth the complexity at 6
  route files.
- `shared/types.ts`: hand-written interfaces for the DB row shapes returned by
  raw SQL in `server/routes/*.ts`. Deliberately not zod-validated - these come
  from trusted internal queries, not external input, so runtime validation
  would add cost with no safety benefit.
- `shared/schemas.ts`: zod schemas for the two untrusted boundaries in this
  app: client request bodies (every POST/PATCH body across `buildings`,
  `custodians`, `zones`, `disruptions`, `schedules`, `ai` routes) and Claude's
  JSON output in `ai.ts` (`aiRebalanceResultSchema`, `aiSuggestZonesResultSchema`).
  Chosen over a hand-written-types-only approach specifically because the AI
  output boundary needs runtime validation - a model response is not
  guaranteed to match its prompt-specified shape, and it wasn't being checked
  at all before this.
- `client/src/api.ts`: typed fetch wrappers over `shared/types` +
  `shared/schemas`, replacing ad-hoc `fetch(...).then(r => r.json())` calls
  across all five pages.
- `client/vite.config.ts`: added `server.fs.allow` and
  `resolve.alias["@shared"]` so the client can import `shared/`, which lives
  outside the Vite project root (`client/`).
- `@types/express` resolved to v5 via npm (latest tag) against the installed
  `express@4.22` runtime - pinned to `^4` to match.

### Bugs fixed during conversion

Found while typing existing files for the migration above, not new work:

- `server/routes/buildings.ts`: `GET /map` was registered after `GET /:id`,
  so Express matched `map` as an `:id` param first and the route was
  unreachable - any request to `/api/buildings/map` returned a 404 from the
  `:id` handler instead. Reordered `/map` before `/:id`.
- `server/routes/ai.ts`: all three routes called `db.prepare(sql).all()` /
  `.get()`, a `better-sqlite3`-style synchronous API that does not exist on
  the `@libsql/client`-backed `db` module (only async `all`/`get`/`run`/`exec`
  are exported). Every AI route threw at runtime before this fix. Rewired to
  the async API used everywhere else in the codebase.
- `server/routes/ai.ts`: `callClaude()` sent no `x-api-key` or
  `anthropic-version` header, so the Anthropic API call had no auth regardless
  of the bug above. Added both headers, reading `ANTHROPIC_API_KEY` from env
  (already declared in `.env.example` but never read).

### Style

- Note: `data/custodial.db` is generated from seeds and
  gitignored - re-run `npm run db:init` to pick up the seed text change.

---

## 2026-07-13 (2)

### Reskinned client to Whitworth brand colors, top nav, light/dark toggle

- Pulled real values from whitworth.edu's own CSS
  (`media.whitworth.edu/css/mq-base.css`) rather than guessing: primary
  crimson `#9f0811` (392 occurrences, clearly dominant), darker crimson
  `#6e060c`/`#3e0307`, secondary teal `#007c89`/`#004e56`, small gold accent
  `#f7d04e`. Their real nav is a horizontal top bar (`primary-nav`), not a
  sidebar.
- `client/src/index.css`: kept existing CSS variable names (`--navy`,
  `--navy-mid`, `--gold`, etc.) and only changed their values, to avoid
  touching every page component that references them as inline
  `var(--gold)`/`var(--navy)` strings (`Zones.tsx`, `ScheduleBoard.tsx`,
  `Custodians.tsx`, `CampusMap.tsx`). Brand colors (`--navy-mid` = crimson,
  `--navy-light` = crimson-dark, `--gold`) are constant across themes;
  `--navy`/`--surface*`/`--border`/`--text*` are the themed values, overridden
  under a new `:root[data-theme="light"]` block.
- Added `--teal`/`--teal-dark` (defined, not yet used - future secondary
  accent), `--on-accent` (fixed dark text color for use on top of `--gold`
  fills, decoupled from `--navy` since `--navy` itself is now themed and
  would otherwise go light-on-light in light mode), and `--map-bg` (fixed
  dark, theme-invariant - the campus map SVG's grid lines and labels are
  hardcoded white/light and assume a dark backdrop regardless of app theme).
- Fixed a latent bug this surfaced: `.btn-primary` used
  `color: var(--navy)` for its dark text-on-gold-button contrast. Once
  `--navy` became themed (light in light mode), that would have put light
  text on a gold button. Decoupled to the new `--on-accent` constant.
- `client/src/index.css` / `client/src/App.tsx`: replaced the left
  `.sidebar` layout with a horizontal `.topbar` (crimson fill, gold
  bottom stripe, wordmark left, nav items inline, theme toggle right),
  matching whitworth.edu's real nav structure at a scale appropriate for a
  5-page internal tool (no mega-menu).
- Theme toggle: `App.tsx` holds `theme` state, initialized from
  `localStorage`, persisted on change, applied via
  `document.documentElement.setAttribute("data-theme", ...)`.
  `client/index.html` has a small inline script that reads `localStorage`
  and sets the attribute before first paint, to avoid a flash of the wrong
  theme on load.
- `client/src/pages/CampusMap.tsx`: one-line change, map SVG background from
  `var(--navy)` to `var(--map-bg)` (see above - required for correctness
  once `--navy` became theme-dependent).
- Verified visually, not just by typecheck: temporarily installed Playwright
  (flagged and confirmed with the user first per this file's dependency
  rule), screenshotted both themes across the Schedule, Custodians, and
  Campus Map pages, checked `console --errors` was empty, then uninstalled
  Playwright since the app itself doesn't need it. Caught and fixed two
  issues this way that typecheck couldn't have caught: `--gold` text
  (shift labels, hour figures) was low-contrast on the light theme's
  white/cream surfaces, so light mode gets its own deeper `--gold: #a6790a`
  override; and `.badge-gold`'s background was a hardcoded
  `rgba(200,168,75,...)` left over from the old gold hex, now updated to
  match (`rgba(247,208,78,...)`) - this class turned out to be unused in
  any page, so it was a latent inconsistency rather than a visible bug.

---

## 2026-07-31

### Custodian teams and daily coverage, from photographed whiteboards

- `seeds/004_custodian_teams.sql`: new `teams` table (Team 1-6, from the
  posted assignment sheets), `custodians.team_id` (nullable FK), and a
  `team_buildings` join table (a team can own multiple buildings; a building
  is expected to belong to at most one team in current data, not enforced
  as a constraint). Also inserts 2 buildings referenced on the sheets but
  missing from `002_whitworth_data.sql` (`Hawthorne Hall`, `Security`) -
  `seeds/003_add_coordinates.sql` already had lat/lng prepared for both
  names, so those `UPDATE`s were silently no-ops until now.
- `seeds/005_daily_coverage.sql` / `006_coverage_history.sql`: new
  `daily_coverage` table (one row per custodian per date per AM/PM period,
  free-text `assignment`, optional `excluded_note`) modeling the separate
  "Additional Coverage" whiteboard - day-specific reassignments layered on
  top of the standing team/building structure, not the same thing as
  `disruptions`. `006` transcribes 60 real entries from 3 photographed
  boards (2026-06-12, 2026-07-09, 2026-07-13). Also adds Carlie/Joe/
  Veronica/Brandon as `team_id = NULL` custodians (summer-only Hard
  Floors/Theme Houses crew, not part of the 6 teams).
- `server/routes/coverage.ts`: `GET/POST/DELETE /api/coverage`, same shape
  as `disruptions.ts`. Not wired into any client page yet - API only.
- `shared/types.ts` / `shared/schemas.ts`: `Team`, `DailyCoverage` types;
  `Custodian.team_id`; `dailyCoverageCreateRequestSchema`.

### Made `npm run db:init` safe to run against a live db

- `render.yaml`'s build command runs `npm run db:init` on every deploy.
  `scripts/init-db.js` used to unconditionally delete the db file first -
  meaning every production redeploy silently erased all real
  schedule/disruption/coverage history. Now it only wipes on an explicit
  `--reset` flag; the default path connects to whatever db already exists
  and applies seeds idempotently. `npm run db:reset` added for the old
  wipe-and-reseed behavior (local dev).
- That surfaced a real duplication bug: `custodians`, `building_spaces`,
  and `daily_coverage` INSERTs have no explicit id and no unique
  constraint, so re-running the same seed against an already-seeded db
  inserted duplicate rows every time (`building_spaces` doubled from 248
  to 496 in one repeat run). Fixed by `seeds/007_idempotent_indexes.sql`
  (unique indexes on the natural keys) - the runner already treats
  `UNIQUE constraint` failures as silent skips, so the indexes alone are
  the fix.
- `--reset`'s file unlink retries up to 10x/150ms - not for the test-suite
  issue below, but because a real prior process (dev server, another
  script) can transiently hold the file, especially on Windows.

### Added a test suite (`node:test` via `tsx`, no new dependencies)

- `npm test` runs `tests/*.test.ts`. `server/app.ts` split out of
  `server/index.ts` (app construction vs. `.listen()`) so the Express app
  is importable without binding a real port - `server/index.ts` is now a
  2-line entry point.
- `tests/db-init.test.ts`: the idempotency fix above, and that `--reset`
  actually wipes.
- `tests/schedules.test.ts` / `schedules-team-fallback.test.ts`: the
  `/generate` behavior below (carry-forward, AM/PM budget, retention
  pruning, `force`).
- While writing these, hit and worked around the `@libsql/client` Windows
  locking issue recorded in Known Issues above - each test file gets its
  own db path, and any write that a later step needs to delete happens in
  a short-lived subprocess rather than via a client held open in the test
  process itself.

### Schedule generation: AM/PM budget, retention pruning, regenerate

- `POST /api/schedules/generate`: previously created every task fully
  unassigned, every time, with no memory of prior days. Now: (1) carries
  forward the most recent prior schedule's `(building, task_type) ->
  custodian` assignments if the same custodian is still active; (2) for
  anything not carried forward, assigns common (team-owned) building tasks
  to whichever active custodian currently has the fewest hours - deliberately
  *not* weighted toward the building's nominal team, since the team
  rosters/buildings came from example whiteboards, not a fixed constraint;
  (3) tags each task `period: 'morning' | 'afternoon'` based on whether the
  assignee was under a 4-hour running total when it was assigned - a tag
  only, not real scheduled times; residential buildings (no team) are
  always tagged `afternoon` and left unassigned (see Known Issues).
- Added `building_tasks.period` (`seeds/008_building_tasks_period.sql`).
- `/generate` also now prunes `building_tasks`/`disruptions`/
  `daily_coverage` rows older than 30 days on every call (no cron runner in
  this app; generate is the natural once-a-day touchpoint).
- Added `force` (`shared/schemas.ts`): `/generate` used to 409 on any date
  that already had a schedule, with no way to overwrite. `force: true`
  deletes the existing rows for that date first instead. `client/src/pages/
  ScheduleBoard.tsx` exposes this as a "Regenerate" button (only shown when
  a schedule already exists), gated behind `confirm()`.
- `client/src/pages/ScheduleBoard.tsx`: custodian cards now group tasks
  under AM/PM headers.

### `.gitignore`

- Added `img` - a folder of whiteboard photos used as source data for the
  changes above, not meant to be committed.
