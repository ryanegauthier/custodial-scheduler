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
- `server/routes/ai.ts`'s `/rebalance` and `/callout-impact` routes join
  `custodians` to `shift_templates` with an inner `JOIN` on
  `c.shift_template_id`. Every real custodian (added from whiteboard data)
  has `shift_template_id = NULL`, so that join matches nothing - both
  routes silently return an empty custodian list for all real data, not
  just missing shift info. Not fixed here; noticed while tracking down why
  the Custodians page showed nobody (`shift_template_id` was never set for
  any of them, since none of the whiteboards specified shift start times).
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

---

## 2026-07-31 (2)

### `npm run up` / `npm run down` for the local dev server

- `scripts/dev-up.js` starts `npm run dev` detached (server + client via
  `concurrently`), logs to `.dev.log`, tracks the pid in `.dev.pid`.
  `scripts/dev-down.js` reads that pid and stops the whole tree.
- On Windows, `taskkill /PID <pid> /T /F` doesn't reliably catch everything -
  `tsx watch`'s own hot-reload restart spawned a server process that
  escaped the tracked tree in testing. `dev-down.js` follows up with a
  fallback sweep of whatever's still listening on ports 3001/5173.
- Log capture fought back on Windows specifically: Node's own
  `child_process` shell redirection (`stdio` fds, and later a `>>` string
  passed through `spawn(..., {shell:true})`) didn't survive inheritance
  through the `npm -> concurrently -> tsx/vite` chain - the servers ran
  fine, but `.dev.log` stayed empty either way. `Start-Process`'s own
  `-RedirectStandardOutput`/`-Error` also can't both point at the same
  file (Windows rejects that outright). Landed on: launch `cmd /c "npm run
  dev >> .dev.log 2>&1"` via `Start-Process` - `cmd`'s own `2>&1` merges
  the streams into one file before `Start-Process` is even involved.

### Custodians page: fixed a real "why is this empty" bug, added drag-and-drop shift assignment

- `client/src/pages/Custodians.tsx` grouped custodians into exactly 3 fixed
  shift buckets (4am/5am/6am) by `shift_template_id`. None of the 20 real
  custodians (added from whiteboard data) have a `shift_template_id` set -
  none of the whiteboards specified shift start times - so all 20 fell
  outside every bucket and the page rendered nobody. Added a 4th
  "Unassigned Shift" bucket so people without one are actually visible.
- `shared/types.ts`: `Custodian.shift_template_id` was typed as
  non-nullable `number` while the real column (and API responses) can be
  `null` - corrected to `number | null`.
- Added native HTML5 drag-and-drop (no new dependency) to move a
  custodian between shift buckets: rows are `draggable`, shift cards are
  drop targets with a gold dashed outline while hovered.
- That needed `PATCH /api/custodians/:id` to support clearing
  `shift_template_id` back to `null` (dragging into "Unassigned"), which
  it couldn't actually do - the route used
  `shift_template_id = COALESCE(?, shift_template_id)`, and a `null`
  param there means "keep the existing value," not "clear it." Fixed by
  giving `shift_template_id` its own direct `UPDATE` (only run when the
  key is present in the request body at all) instead of routing it through
  the same `COALESCE` pattern as `name`/`active`/`notes`.
  `custodianUpdateRequestSchema.shift_template_id` is now
  `.nullable().optional()` to let that explicit `null` through validation.
- `client/src/api.ts`: added `updateCustodian` + a `patchJSON` helper
  (only `getJSON`/`postJSON` existed before).

### Corrected the productive shift length: 7.5 hours, not 7.0

- The real shift is 4:00am-12:30pm with a half-hour lunch (450 productive
  minutes), not the 420 (7.0hr) the schema had. Fixed
  `shift_templates.productive_min`'s default in
  `seeds/002_whitworth_data.sql`, added
  `seeds/009_shift_productive_hours.sql` to correct the value in
  already-seeded databases (a column `DEFAULT` change alone doesn't touch
  rows already inserted), and updated the one client-side fallback
  (`Custodians.tsx`, for custodians with no shift assigned yet) from
  420 to 450 for consistency.
- Left `block1-3_min`/`break1-2_min`/`lunch_min` alone - confirmed via
  grep that nothing outside the seed's own `CREATE TABLE` reads them, so
  they're inert documentation columns, not something the productive-hours
  fix needed to touch.

### Trash pairing and team-clean threshold in schedule generation

- `POST /api/schedules/generate`: Trash (Common) now always goes to
  whoever has Trash (Classrooms) for the same building, with the same
  AM/PM period - previously each task type was assigned independently,
  so the two could land on different people. Trash (Common) no longer
  consults its own carry-forward entry at all; it simply mirrors whatever
  Trash (Classrooms) resolved to (carried or freshly picked), which also
  self-corrects any pre-existing mismatched data from before this feature
  existed.
- For buildings whose total daily hours exceed 4 (a "team clean"
  threshold), Restrooms is now assigned to someone other than whoever has
  the trash pair, guaranteeing at least 2 people share a large building
  instead of the least-hours algorithm happening to put everything on one
  person. Floors/Vacuum and Spot Clean remain independently assigned, per
  explicit choice not to bundle them in too.
  `pickAssignee()` gained an optional exclude parameter for this.
  Buildings at or under the threshold are unaffected - still whichever
  single least-hours pick each task type happens to land on.
- The assignment loop is now building-centric (one pass per building,
  computing trash-pair and restroom assignees before iterating that
  building's task rows) rather than a flat per-(building, task type)
  loop, since these decisions now depend on each other within a building.
- Caught in review before shipping: the building-centric rewrite's
  residential-building branch dropped carry-forward entirely (`assigned_to`
  was hardcoded `NULL` for every residential task, every time), silently
  wiping any manually-assigned residential task on every regenerate. Fixed
  before merging - residential buildings still don't get *fresh*
  auto-assignment (unsolved, see Known Issues), but a prior manual
  assignment now correctly survives regeneration again.
- Added `tests/schedules-team-fallback.test.ts` coverage: the pairing
  invariant (checked across every building with both trash task types,
  not just one), and the restroom split on Robinson Science Hall
  (~10.7 daily hours, real seed data).
