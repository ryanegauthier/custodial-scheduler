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
- `buildings.daily_hours_l2` was computed (seeds/001-002) as APPA-ratio
  whole-building workload under the old multi-task-type/multi-person
  algorithm, not calibrated as one standing-assignee's daily capacity. Now
  that `POST /api/schedules/generate` assigns a building's full
  `daily_hours_l2` to its one standing custodian, anyone with 2+ large
  buildings shows a total well past a 7.5hr shift (e.g. Olga: Weyerhaeuser
  Hall + Warren Hall = 22.8hrs/day) - confirmed visually, not a rendering
  bug. The Daily Schedule page's "7hr limit" indicator will flag most of
  the roster as a result; this reflects the input hours figures, not a
  code defect. Not fixed - recalibrating `daily_hours_l2` for a
  one-person-per-building model is a separate follow-up.
- Amos ("Thu-Mon only... see worksheets") and Isaiah ("M-F") on the
  2026-10-07 whiteboard have no building named at all - not seeded into
  `custodian_assignments` (seeds/010). Both exist as active custodians
  with zero standing assignments; seeding a guessed building was avoided.
- `@libsql/client`'s local-file driver appears to hold an OS-level lock on a
  db file for the rest of a process's life once anything in that process has
  called `createClient()` on it, even read-only, even after `.close()`.
  Confirmed on Windows; unconfirmed on Linux (prod). Worked around in
  `scripts/init-db.js` (`--reset`'s unlink retries a few times) and in the
  test suite (every test file gets its own db path, one process spawns
  another to do a write it will later need to delete). Not something this
  app's own code can fix - it's inside the client library.
- "Today" on the client is `new Date().toISOString().slice(0, 10)` (UTC)
  in both `ScheduleBoard.tsx` and `Custodians.tsx`. After 4pm/5pm Pacific
  that is already tomorrow's date, so a callout toggled late in the day
  lands on the next day. Harmless for the intended early-morning use
  (4-6am shifts); `Custodians.tsx` deliberately matches ScheduleBoard's
  definition so both pages agree. Not fixed.
- `POST /api/schedules/generate` isn't wrapped in a transaction. If it
  fails partway (seen 2026-11-20: standing tasks inserted, then the
  coverage-pool query failed on a db without `seeds/012`), the partial
  rows stay, and a retry without `force` returns 409 "Schedule already
  exists" for a half-built day. Regenerate (`force: true`) clears it once
  the cause is fixed. Not fixed - needs a transaction via the libsql
  client in `server/db/index.ts`.
- `seeds/012_coverage_pool.sql`'s initial-pool UPDATE is guarded by "nobody
  is approved yet" so `npm run db:init` re-runs don't re-approve people a
  manager un-flagged. If a manager un-flags *everyone*, the next db:init
  re-seeds the pool (every active custodian with no standing assignment).
  Not fixed - would need a one-time-migration marker, not worth it yet.
- Coverage tasks are recognized by `task_type_id` 2-4 (Restrooms, Trash x2).
  Those ids were also used by the pre-2026-10-07 APPA-ratio algorithm, so
  `GET /api/schedules` for a date generated under it would treat its
  assigned restroom/trash rows as "coverage" and hide that day's gaps.
  Retention pruning (30 days) means no such dates remain in practice.

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

---

## 2026-10-07

### Replaced APPA-ratio schedule generation with standing custodian assignments

The core model change: custodians have fixed standing building assignments
that change ~once a semester, not daily. Daily scheduling is exception
handling (callouts/FMLA/vacation) against those standing assignments, not a
fresh per-day computation. This replaces the Team 1-6 / APPA-ratio algorithm
added 2026-07-31 in full, not incrementally - confirmed with the user
up front given the scope (13+ files) and the conflicts below, rather than
assumed.

- `seeds/010_standing_assignments.sql`: new `custodian_assignments`
  (`custodian_id`, `building_id`, `assignment_type` primary|secondary,
  `days_of_week`, `notes`) and `custodian_status` (`custodian_id`, `status`
  active|fmla|callout|vacation, `effective_date`, `end_date`, `notes`)
  tables, seeded from the current whiteboard (2026-10-07). Both use
  explicit ids (project convention for curated seed data, e.g.
  buildings/teams) so reseeding is idempotent via PK conflicts, rather than
  the extra-unique-index approach `custodians`/`building_spaces` needed
  (seeds/007) for their no-id inserts.
- Roster conflict, resolved with the user before writing any seed data:
  `custodians` already had 16 rows from the 2026-07-31 Team 1-6 whiteboard
  round (seeds/004) plus Carlie/Joe/Veronica/Brandon from seeds/005's
  summer-only crew - not empty, despite this task's brief assuming an
  empty-table seed path. The new 20-name whiteboard was treated as
  authoritative: Dale and Silas (seeds/004, not on the new board) are
  deactivated (`active = 0`, not deleted, to keep `team_id` history);
  Randall, Michael, and Amos are the only genuinely new names (the other
  17 overlap by name, including 3 - Joe/Veronica/Brandon - that turned out
  to already exist from seeds/005, not seeds/004, caught only by
  diff-checking actual post-seed row counts against the expected 37
  assignment rows after a first pass silently dropped to 30 - see below).
- Real bug caught by running `scripts/init-db.js` and counting rows rather
  than trusting the SQL at a glance: the first draft's
  `INSERT INTO custodians (name) VALUES (...)` named all 6 "new" custodians
  in one statement. Because 3 of them (Joe/Veronica/Brandon) already
  existed, `idx_custodians_name`'s UNIQUE constraint failed the *entire*
  statement - SQLite's default single-statement multi-row INSERT is
  all-or-nothing, so Randall/Michael/Amos silently failed to insert too,
  which then silently dropped their `custodian_assignments` rows (the
  cross-join `WHERE c.name = '...'` subquery just matches zero rows for a
  nonexistent custodian rather than erroring). Fixed by inserting only the
  3 truly-new names; verified by re-running the seed and asserting
  `custodian_assignments` has exactly 37 rows, not just that `db:init`
  logged no warnings.
- Whiteboard transcription assumptions, documented here rather than
  guessed silently: "Auto Scrub" (Clif) and "Vac/Prog" (Ryan G) are
  freeform duty notes with no distinct building, folded into the `notes`
  column of an existing building row instead of modeled separately.
  Yuriy/Michael/Amos/Isaiah's rows had a day-restriction string
  ("Tue-Sat only" etc.) in the whiteboard's "Primary Buildings" column
  instead of an actual building name, with their real buildings in
  "Secondary/Notes" - read as a column swap for those four rows
  specifically, not a secondary-assignment signal; Amos and Isaiah still
  named no building at all even after that correction (see Known Issues).
- `custodian_status` "active" semantics, confirmed with the user before
  implementing: absence of any covering row means active. A status row's
  `[effective_date, end_date]` window (either end nullable = open-ended)
  determines coverage; when more than one row covers the same date, the
  most specific (non-null `effective_date`) and latest-starting one wins -
  so an explicit `active` row can end an earlier open-ended `fmla` row
  early without deleting it. Implemented identically in both
  `server/routes/schedules.ts` (`unavailableCustodianMap`) and
  `server/routes/custodians.ts` (`GET /:id/status`).
- `server/routes/schedules.ts`: `POST /generate` now loads the day's
  standing assignments (filtered by `days_of_week` against the actual
  day-of-week of the requested date), drops anyone unavailable per
  `custodian_status`, and inserts one `building_tasks` row per remaining
  assignment using `buildings.daily_hours_l2` as `estimated_hours` and a
  new `task_types` row (id 6, "Standing Assignment") since the old
  per-task-type APPA breakdown (Floors/Restrooms/Trash/Spot Clean) doesn't
  apply to a whole-building standing assignment. Replaces the entire
  carry-forward/AM-PM-budget/trash-pairing algorithm from 2026-07-31 - nothing
  from it is reused, since none of it is meaningful once assignment is a
  fixed lookup instead of a computed balance. `GET /` and `POST /generate`
  both now also return `coverage_gaps`: buildings where every assignee
  (primary or secondary) covering it that day is unavailable, with
  `daily_hours_l2` shown so the supervisor can see the weight of the gap.
  `zone_coverage`/`unassigned_tasks` (old response fields, only consumed by
  the now-rewritten `ScheduleBoard.tsx`) were dropped rather than kept
  dead; `DailySchedule`/`CoverageGap` types updated in `shared/types.ts`
  to match.
- Bug found and fixed only by actually running the generate flow in a
  browser (per this file's "don't mark something as working without
  running it" rule - screenshotted before and after): a `secondary`
  assignment on a building with an active `primary` was inserting its own
  full-`daily_hours_l2` `building_tasks` row every day alongside the
  primary's, double-counting that building's hours under two people
  simultaneously (Weyerhaeuser Hall showed 9.6hrs under both Olga and
  Bobbiann on a day neither was out). `secondary` rows now only generate a
  task when every `primary` assignment on that building is unavailable -
  a secondary is backup coverage, materializing only when actually needed,
  matching the already-correct `coverage_gaps` semantics ("anyone
  available" = no gap). Verified by re-screenshotting: Bobbiann now shows
  0hrs on a normal day, and the existing "secondary covers the primary's
  absence" test still passes unchanged.
- `server/routes/assignments.ts` (new): `GET/POST /api/assignments`,
  `DELETE /api/assignments/:id` for standing-assignment CRUD. Registered
  in `server/app.ts`.
- `server/routes/custodians.ts`: added `GET/POST /:id/status`, resolving
  and setting `custodian_status` rows per the semantics above.
- `shared/schemas.ts`: `assignmentCreateRequestSchema`,
  `custodianStatusCreateRequestSchema`.
- `client/src/pages/ScheduleBoard.tsx`: rewritten to a two-column layout -
  left column is custodians on today with their standing buildings and
  hours (red/bold "at 7hr limit" at >=7hrs, yellow "near" at >=6.5hrs -
  both hardcoded per the spec's "7hr productive limit" wording, distinct
  from `shift_templates.productive_min` which is 7.5hrs and describes
  shift capacity, not this warning threshold); right column is
  `coverage_gaps`. The old "Generate Schedule" button itself had no
  drag-drop (that lives in `Custodians.tsx`'s shift-bucket reassignment,
  confirmed out of scope with the user and left untouched) - only the
  APPA-ratio task-card grid and zone-coverage bar were replaced.
- `client/src/pages/Assignments.tsx` (new), `client/src/App.tsx`: new nav
  page mirroring the standing whiteboard, grouped by custodian with
  primary/secondary badges, days, and notes; add/remove standing
  assignments inline.
- `client/src/api.ts`: added `getAssignments`/`addAssignment`/
  `deleteAssignment`/`getCustodianStatus`/`setCustodianStatus`.
- `tests/schedules.test.ts` / `tests/schedules-team-fallback.test.ts`:
  rewritten in full (confirmed with the user first, since both files
  tested the exact algorithm being deleted) to cover the standing-
  assignment model instead: per-assignment `days_of_week` filtering,
  coverage gaps on a callout, secondary-covers-primary's-absence, and
  `custodian_status` date-range resolution including the dated-row-wins-
  over-open-ended case.
- Visually verified, not just typechecked: temporarily installed
  Playwright again (flagged and confirmed with the user first, same as
  the 2026-07-13 precedent), screenshotted the Daily Schedule and
  Assignments pages in both themes, confirmed zero console errors, caught
  the secondary-double-counting bug above this way, then uninstalled
  Playwright.

---

## 2026-10-07 (2)

### Made `buildings.target_appa_level` actually control schedule generation

`target_appa_level` and `PATCH /api/buildings/:id` already existed, but
nothing read the column - `POST /api/schedules/generate` hardcoded
`daily_hours_l2` for every building regardless of it. Management had no way
to lower a building's service level (and therefore its daily hours) to
redistribute coverage when staffing drops. Scope confirmed with the user
first (6 files) along with one open question - resolved as "per-building
dropdown + a bulk-apply control", not a single global level, matching the
column already being per-building.

- `shared/schemas.ts`: `buildingUpdateRequestSchema.target_appa_level`
  tightened from `z.number()` to a union of literals `1 | 2 | 3` - only
  those three have an hours column on `buildings`
  (`daily_hours_l1/l2/l3`); L4/L5 exist in `appa_service_levels` as a
  reference table but buildings has no corresponding hours column, so
  accepting them would silently have nothing for generate to read.
- `server/routes/schedules.ts`: `getAssignmentsForDate()` now also selects
  `daily_hours_l1`, `daily_hours_l3`, and `target_appa_level`; new
  `hoursAtTargetLevel()` picks the right column (default L2, matching the
  column's own `DEFAULT 2`) and is used both in `POST /generate`'s
  `estimated_hours` insert and in `buildCoverageGaps()`.
- `shared/types.ts`: `CoverageGap.daily_hours_l2` renamed to `daily_hours`
  (+ added `target_appa_level`) since the figure shown is no longer always
  L2 - updated the one call site in `ScheduleBoard.tsx` and one test
  assertion in `tests/schedules-team-fallback.test.ts` to match.
- `client/src/pages/Buildings.tsx`: was read-only before this - added a
  per-row APPA Level dropdown (L1/L2/L3, calling `PATCH /api/buildings/:id`
  via the new `api.updateBuilding`) plus checkbox selection and a bulk-apply
  bar ("N selected - Set APPA level to [L_] - Apply to N") for changing
  several buildings at once. The L1/L2/L3 hour columns now highlight
  whichever one is the building's active level. Bulk apply fires one
  `PATCH` per selected building via `Promise.all` rather than adding a new
  batch endpoint - 43 buildings max, not worth a server-side batch route
  for this volume.
- `client/src/api.ts`: added `updateBuilding` (the PATCH route existed
  with no client wrapper until now).
- `tests/schedules-team-fallback.test.ts`: added coverage that lowering a
  building's `target_appa_level` to 3 changes the hours the next
  `/generate` assigns, from L2 to L3.
- Verified by actually using the feature in a browser (not just
  typecheck/build): temporarily reinstalled Playwright (same precedent as
  above), changed WALT's level via its row dropdown, bulk-selected two more
  buildings and applied L3 to both, confirmed the Buildings page's
  per-level highlighting and running total updated correctly, then
  regenerated the day's schedule and confirmed the custodians holding
  those buildings showed the new (lower) L3 hours instead of L2 - then
  uninstalled Playwright again.

---

## 2026-10-07 (3)

### Assignments page restyled as a ledger table, matching the real whiteboard

`img/oct01.jpg` (gitignored source photo, not committed - same handling as
the other whiteboard photos) is the actual physical board
`seeds/010_standing_assignments.sql` was transcribed from: two columns,
"Building Coverage" and "Additional Coverage", one row per person. Asked
to make the Assignments page look like it; confirmed scope first (which
page, and structure-only vs. a literal whiteboard skin) since both were
genuinely ambiguous from the request alone.

- `client/src/pages/Assignments.tsx`: rewritten from one `<table>` per
  custodian card to a single table with exactly that shape - Custodian /
  Building Coverage / Additional Coverage columns, one row per custodian.
  Each assignment renders as a small removable chip (`building name -
  notes (days)`) instead of its own table row with a "Remove" button
  column. Clicking a chip's `×` now removes it directly, no confirm()
  dialog - chips read as lighter-weight than the old full table row, so
  the extra confirmation step was dropped.
- Every custodian from `GET /api/custodians` now gets a row, including
  ones with zero standing assignments (Amos, Carlie, Hope, Isaiah,
  Oksana) - rendered with `-` in both columns. The previous version only
  showed custodians who already had at least one `custodian_assignments`
  row, which silently hid anyone without one; the whiteboard itself shows
  every roster member as a row, blank cells included, so this now matches
  that structure, not just its styling.
- Kept modern UI (existing theme tokens, fonts, table styles already in
  `index.css`) rather than a literal whiteboard skin (ruled paper
  background, marker colors) - confirmed with the user as the intended
  fidelity level before building either.
- New `.coverage-chip`/`.coverage-chip-secondary`/`.coverage-chip-remove`
  styles in `index.css` - primary chips get a gold left border, secondary
  chips blue, consistent with the gold/blue primary/secondary badge
  colors already used elsewhere (e.g. the old per-row badges this
  replaces).
- Verified visually (Playwright, same temporary-install pattern as the
  two entries above) in both themes - zero console errors, every
  custodian row present including the zero-assignment ones.

Comparing the actual photo against `seeds/010_standing_assignments.sql`
surfaced discrepancies **not fixed in this entry** - the user asked for a
visual change here, not a data correction, so these are flagged rather
than silently patched:
- Miaya's row appears to also name "Ballard" (Ballard Hall) alongside
  Tacoma/Hendrick/Stewart 3 - not in the seed.
- Andrew's building reads as "HSB" on the photo, transcribed as "HUB"
  (Hixson Union Building) in the seed on the assumption it's the same
  abbreviation Joe's row uses in full - not confirmed against the
  photo's handwriting.
- The photo has an asterisk/checkmark column between "Building Coverage"
  and "Additional Coverage" (next to Clif, Ryan G, Andrew, Veronica,
  Angela, Olga, Yuriy's rows) with a legend at the bottom - "Scotford,
  Graves, Lower Fields, Golf, Maverik, Security, Jenkins Basement" - that
  reads like a shared/rotating-duty list. Not modeled anywhere; meaning
  unclear without asking the person who wrote it.
- Hope's "Additional Coverage" cell says "Baby" (likely the reason for
  her FMLA) - not captured; `custodian_status.notes` for her seed row
  just says "Whiteboard: FMLA, no dates given."
These would need the user's confirmation before changing seed data, same
as the original roster/building-name assumptions earlier in this file.

---

## 2026-11-12

### Custodians page: one-day Out/In switch

First of two parts for callout handling (the second, a coverage pool
that picks up a called-out custodian's trash and restrooms, is a
separate change). Uses the existing `custodian_status` table and the
existing "callout" status value - no schema change.

- `server/routes/custodians.ts`: `GET /` takes an optional `?date=`
  (default today) and returns `callout_id`, the id of the custodian's
  one-day callout row for that date (`effective_date = end_date = date`),
  or null. Multi-day fmla/vacation windows are not reflected in it.
- `server/routes/custodians.ts`: new `DELETE /:id/status/:statusId`
  (scoped to that custodian). Marking someone back "in" deletes the
  callout row rather than inserting an `active` row: status resolution
  sorts by `effective_date` only, so a same-day `active` row and
  `callout` row tie and either could win.
- `client/src/pages/Custodians.tsx`: new "Today" column with an In/Out
  badge-button per row, and an "N out today" count in the page subtitle.
  Any toggle shows a "Regenerate Today" banner, which calls the existing
  `POST /api/schedules/generate` with `force: true` (same confirm prompt
  as the Schedule Board). Regenerate still wipes that day's manual drag
  reassignments - existing behavior, unchanged.
- `client/src/api.ts`: `getCustodians(date?)`, new `deleteCustodianStatus`.
- `shared/types.ts`: optional `callout_id` on `Custodian`.
- Verified against a copy of the live db via the API: Olga out on a
  Monday -> regenerate drops her tasks (29 -> 27) and reports Weyerhaeuser
  Hall as a coverage gap; back in -> regenerate restores 29 tasks, 0 gaps.
  Typecheck and existing test suite pass. The page itself was not checked
  in a browser.
- Deferred: multi-day callouts (one day only, per user), no dedicated
  test file for the new routes.

---

## 2026-11-13

### 2pm and 3pm night crew shifts

- New `seeds/011_night_shifts.sql`: `shift_templates` rows 4 (`2pm Shift`,
  `14:00`) and 5 (`3pm Shift`, `15:00`). Productive minutes and break
  structure come from the table's column defaults (450 productive min,
  8.5-hr span), same as the morning shifts. 24-hour `start_time` keeps
  `ORDER BY s.start_time` placing night shifts after morning ones.
  Idempotent via explicit ids (re-run hits UNIQUE, skipped by init-db).
- `client/src/pages/Custodians.tsx`: added both to the hardcoded `SHIFTS`
  list, so they appear as drag targets and in the Add Custodian dropdown.
  The list is still hardcoded rather than fetched from the db - fine at
  5 shifts; a new shift still needs both a seed row and a list entry.
- Not changed: `ScheduleBoard.tsx`'s near/at-limit hour warnings and
  schedule generation don't look at shift start time, so night crew is
  scheduled exactly like morning crew. The planned coverage-pool seed
  moves to `012`.
- Verified on a copy of the live db: init-db applies 011 once and skips
  it on re-run; dragging Amos to the 2pm shift (PATCH) returns
  `2pm Shift / 14:00 / 450` and sorts him last. Typecheck and tests pass.
  Run `npm run db:init` to add the shifts to an existing db.

### Coverage pool: approved custodians pick up a callout's restrooms and trash

Second half of callout handling (first half: the Out/In switch,
2026-11-12). Per user: initial pool is everyone currently unassigned, with
a per-person approval flag; coverage is restrooms and trash only (floors
and vacuuming skipped), estimated at 43% of the building's daily hours;
nobody goes past their 7.5-hr productive shift.

- New `seeds/012_coverage_pool.sql`: `custodians.coverage_approved INTEGER
  NOT NULL DEFAULT 0`, then a guarded one-time UPDATE approving every
  active custodian with no `custodian_assignments` row. On the live db
  that is Carlie, Isaiah, Oksana, Amos, Bobbiann, Hope (Hope is on FMLA, so
  she is skipped by generation while unavailable).
- `server/routes/schedules.ts` `POST /generate`: after standing-assignment
  tasks, each uncovered building (largest hours first) gets a bundle of
  three tasks - Restrooms 22.6%, Trash (Classrooms) 11.3%, Trash (Common)
  9.1% of its target-level daily hours (43% total, the old APPA algorithm's
  30:15:12 proportions scaled down). The bundle goes to the available
  approved custodian with the most room left under their shift's
  `productive_min` (default 450), counting their own standing hours. If
  nobody has room, the building stays a gap: bundles are never split
  across people or assigned over the limit. Response gains
  `coverage_assigned` (`building_id`, `custodian_id`, `hours`).
- `buildCoverageGaps` now excludes buildings with an *assigned*
  restroom/trash task for that date; the old logic moved unchanged into
  `buildUncoveredBuildings`, which generate uses to find what needs
  covering. Unassigning a coverage task on the Schedule Board makes the
  building a gap again.
- `server/routes/custodians.ts` PATCH, `shared/schemas.ts`: accept
  `coverage_approved` (0/1). `shared/types.ts`: `Custodian.coverage_approved`.
- `client/src/pages/Custodians.tsx`: "Coverage" column with an
  Approved/No toggle per row, plus an "N approved for coverage" count in
  the subtitle. Toggling it does not show the stale-schedule banner;
  approval only matters on the next generate.
- Tests (`tests/schedules.test.ts`): Phil out -> WALT gets exactly task
  types 2/3/4, one assignee, ~43% of hours, assignee approved, not listed
  as a gap; everyone with a standing assignment out -> no custodian over
  their productive hours and some gaps remain; nobody approved -> WALT
  stays a gap. `tests/schedules-team-fallback.test.ts`'s "callout produces
  a coverage gap" test now empties the pool for its duration (its premise
  only holds when nobody can cover); its assertions are unchanged.
  14/14 pass, typecheck passes.
- Verified on a copy of the live db: Olga out on a Monday -> Weyerhaeuser
  Hall's 2.784h bundle went to Bobbiann, no gaps. The page itself was not
  checked in a browser.
- Deferred: a "covering for X" label on the Schedule Board (the task rows
  show as Restrooms/Trash under the coverer, but not whose building it
  is); splitting a bundle across two people when no one person has room.

### Custodians page: auto-scroll while dragging

Reported: dragging a custodian disables the mouse wheel, so a shift card
off-screen can't be reached. That is browser behavior, not an app bug -
Chrome/Edge on Windows don't scroll on wheel input during a native HTML5
drag, and the app can't re-enable it (no wheel events are dispatched).

- `client/src/pages/Custodians.tsx`: on drag start, a document-level
  `dragover` listener records the pointer's Y position, and a
  `requestAnimationFrame` loop scrolls `.main-content` (the actual scroll
  container - `.app-layout` is `overflow: hidden`) when the pointer is
  within 80px of its top or bottom edge, up to 18px/frame, scaled by
  closeness to the edge. Stops on `dragend`/`drop` (document-level, so
  drops outside a shift card and Esc-cancels also stop it) and on unmount.
- Not verified in a browser: native drag-and-drop can't be driven from
  the tools available here. Typecheck passes. Needs a manual check: drag
  a custodian toward the bottom edge of the page and confirm it scrolls,
  then drop and confirm scrolling stops.

---

## 2026-11-20

### Upgraded Express 4 -> 5 (async route errors no longer crash the server)

Prompted by a dev-server crash: a Coverage toggle hit a db that hadn't
run `seeds/012` (`no such column: coverage_approved`). Express 4 doesn't
catch rejected promises from async handlers, so the error became an
unhandled rejection, Node exited, and `tsx watch` waited for a file change
before restarting - every later request got ECONNREFUSED through the Vite
proxy. Express 5 forwards async handler rejections to its error handler
natively. Chosen over a hand-written async wrapper since the app is still
in development and Express 5 is the current npm `latest` (4 is
maintenance-only), so the upgrade was cheapest now.

- `package.json`: `express` `^4.19.2` -> `^5.3.0`, `@types/express`
  `^4.17.25` -> `^5.0.6`.
- `server/app.ts`: the production SPA catch-all `app.get("*")` ->
  `app.get("/{*splat}")`. Express 5's path-to-regexp v8 rejects unnamed
  wildcards; the braces make it optional so `/` also matches. This was the
  only breaking change in use - every other route is a plain `/:param`
  pattern, and a grep of `server/` found none of the other removed/changed
  APIs (`req.param()`, `app.del`, `res.send(status)`, writable
  `req.query`, `express.urlencoded` defaults).
- Verified: typecheck and 14/14 tests pass. Against an empty db (every
  query fails), GET/PATCH routes return 500 repeatedly with no crash and
  the server keeps serving. With `NODE_ENV=production` after `npm run
  build`, `/`, `/custodians` and a nested deep link return `index.html`,
  and `/api/zones` still returns JSON.
- Deferred (done in the next entry): Express 5's default error handler responds with an HTML 500
  page, while the client expects JSON. A small JSON error middleware in
  `server/app.ts` is a separate follow-up.
- Not addressed: `npm audit` reports 9 advisories, all in dev tooling
  (esbuild via vite, shell-quote via concurrently, nanoid, source-map-js,
  baseline-browser-mapping), none in express or other runtime deps.

### JSON error handler

Follow-up to the Express 5 upgrade above: its default error handler sends
an HTML 500 page, while every route already reports validation failures
as JSON `{ error }`.

- `server/app.ts`: error middleware registered after all routes (and after
  the production SPA catch-all). Responds `{ error: string }` with the
  error's own `status`/`statusCode` if it has one (e.g. `express.json()`'s
  400 for a malformed body), otherwise 500. 4xx messages are always
  passed through; 5xx messages are passed through outside production and
  replaced with "Internal server error" when `NODE_ENV=production`, so SQL
  and internal details don't reach clients. 5xx errors are written to
  stderr with `console.error` (no project logger exists; Express's default
  handler logged the same way). Defers to Express's default handler if
  headers were already sent (a failure mid-response).
- Verified on a running server: broken db -> `500 {"error":"SQLITE_ERROR:
  no such table: custodians"}` in dev and `500 {"error":"Internal server
  error"}` in production; malformed JSON body -> `400` with the parse
  message; 500s logged to stderr; real db unaffected (200). Typecheck and
  14/14 tests pass. No automated test added for the handler itself.
- Not changed: unknown `/api/*` paths still get Express's HTML 404 ("Cannot
  GET ..."), and `client/src/api.ts` still doesn't check `res.ok`, so the
  UI doesn't yet show these errors to the user - it just receives JSON it
  can now parse.

### UI shows API errors (app-wide toast)

Follow-up to the JSON error handler above: the client never checked
`res.ok`, so a failed toggle/drag/add looked like nothing happened, failed
loads left pages blank (or stored the error object as data), and the two
AI buttons could store an error body as their result and break rendering.

- `client/src/api.ts`: all helpers now go through one `request()` that
  throws `ApiError(message, status)` on any non-2xx response, and
  `ApiError(..., 0)` "Could not reach the server." when `fetch` itself
  rejects. The message comes from the `{ error }` body: a string as-is,
  zod `flatten()` output summarized as `Invalid request - field: msg; ...`,
  and a non-JSON 5xx (the Vite proxy failing to reach the API) as
  "Server error (N) - is the API server running?". The three hand-rolled
  DELETE `fetch` calls use a shared `deleteJSON` too. Return shapes are
  unchanged (`getJSON` -> data, post/patch -> `{ status, data }`), so no
  page call sites changed. `generateSchedule`'s `| { error, count }`
  union type was removed - a 409 now throws.
- `client/src/App.tsx`: a window `unhandledrejection` listener shows any
  uncaught `ApiError` as a toast (bottom-right, latest error only, click
  or 6s to dismiss; the timer restarts on a repeat error) and calls
  `preventDefault()` so the console doesn't also log it as uncaught.
  Chosen over a try/catch in each of ~20 handlers across 7 pages: those
  handlers already let rejections propagate, so this needed no page edits.
  Side effect: a failed call now stops the rest of its handler (e.g. no
  list reload after a failed toggle), which is correct since nothing
  changed server-side.
- `client/src/index.css`: `.toast-err`, the `.alert-err` red tint over a
  solid `--surface` (it floats over content) with a shadow.
- `client/src/pages/ScheduleBoard.tsx`: "Generate" catches `ApiError` 409
  to keep its inline "Schedule already exists for this date." message and
  rethrows anything else to the toast. "Could not load schedule." now
  includes the actual reason.
- Verified by importing `client/src/api.ts` in Node against running
  servers: healthy db -> data returned; invalid PATCH body -> 400
  `Invalid request - coverage_approved: Invalid input`; second generate ->
  409; empty db -> 500 `SQLITE_ERROR: no such table: custodians`; nothing
  listening -> status 0 "Could not reach the server.". Typecheck, `npm run
  build`, 14/14 tests pass. The toast itself was not seen in a browser.
- Not covered: retry buttons, per-page inline errors (other than the
  Schedule Board's), unknown `/api/*` paths still returning Express's HTML
  404 (shown as "Request failed (404 Not Found)").

### Leftover buildings covered daily at coverage level

Generation only ever looked at standing assignments: 19 of 43 buildings
had no active standing assignment, so they never got tasks and never
showed up as gaps (about 47 L2 hours/day of work invisible to the app).
Graves Gym (Michael, Wed-Sun) had the same problem on Mon/Tue. Per user:
assignments first, then leftover buildings covered at coverage level
(restrooms + trash, 43%) by everyone without an assignment, approved or
not; callout buildings go only to coverage-approved custodians, since
unapproved usually means limited physical capacity.

- `shared/types.ts`: `CoverageGap.reason` - `"callout"` (every standing
  assignee today is unavailable) or `"unassigned"` (no standing assignment
  applies today; `unavailable` is `[]`).
- `server/routes/schedules.ts` `buildUncoveredBuildings`: after the
  existing callout gaps (sorted by hours), appends every building with no
  assignment row applying today, also sorted by hours. Callouts come
  first because generate fills in this order, and a normally-daily
  building outranks a leftover. `hoursAtTargetLevel` now takes only the
  four hours/level columns so plain building rows can use it.
- `POST /generate`: two pools instead of one. Callout buildings -> active,
  available, `coverage_approved = 1`. Leftover buildings -> active,
  available custodians with no `custodian_assignments` row at all.
  "At all" rather than "none today": a days-limited assignment usually
  mirrors that person's work week, so "none today" would hand them
  leftovers on their days off. Someone in both pools (approved and
  unassigned) can take both, with callout work using up their room first.
  Same bundle, most-room-left pick and never-over-the-limit rule as
  before. `coverage_assigned` entries gain `reason`.
- `client/src/pages/ScheduleBoard.tsx`: gap cards show "No standing
  assignment today" for leftovers, "no hours data" instead of `0.0h`
  when a building has no hours figure, and the empty state reads "every
  building is covered today".
- Tests (`tests/schedules.test.ts`): the "nobody approved" test now
  asserts no *callout* coverage (leftovers still get assigned) and that
  WALT is a `callout` gap. New: with nobody approved, leftovers still go
  only to unassigned custodians, as exactly task types 2/3/4, with no
  coverer over their limit and nothing covered listed as a gap; with only
  Amos approved and Phil out, WALT's callout bundle goes to Amos ahead of
  the larger leftovers; Graves Gym is a leftover on a Monday and only
  Michael's standing task on a Wednesday. 17/17 pass, typecheck passes.
- Verified on a copy of the live db. Normal Monday: all 17 leftover
  buildings with hours data covered, split across Amos, Bobbiann and
  Isaiah at ~6.5h each. With Zach, Randall, Miaya, Angela and Andrew out:
  all 6 callout buildings covered first, the three filled to 7.45-7.50h,
  and 7 small leftovers (McMillan, Cowles, Lindaman, The Pines, FS Admin,
  MacKay, Auld House) left as gaps. Hawthorne Hall and Security have no
  hours data, so they are always listed as gaps and never covered.
- On the live roster the leftover pool and the approved pool are
  currently the same three people (Hope and Oksana are on open-ended
  FMLA, Carlie is inactive), so the two-pool split has no visible effect
  until an unapproved unassigned custodian exists.

### Assignment shares: shared buildings split their hours instead of double-counting

Asked whether Warren Hall's "Boys side" / "Girls side" were different in
the db: they weren't - one building row, two primary assignments, the
sides only in free-text notes. Generate credited each primary the full
building (Warren: 12.5h each, 25h for a 12.5h building), and with one
side out the other still "covered" it, so no gap or coverage happened.
Ten buildings had 2-3 primaries, all double/triple-counted (the
primary-primary overlap Known Issue, now removed). User chose a general
share percentage over splitting Warren into two building rows, starting
50/50 and editable (e.g. 60/40).

- New `seeds/013_assignment_share.sql`: `custodian_assignments.share_pct
  INTEGER NOT NULL DEFAULT 100`, then Warren's two rows set to 50,
  guarded to only run while both are still 100 so a re-run doesn't reset
  an edited split.
- `server/routes/schedules.ts`: new `planStandingAssignments(date)`, now
  the single place that decides standing tasks *and* callout gaps (both
  `POST /generate` and `buildUncoveredBuildings` call it, replacing two
  separate copies of the "who covers this building" logic):
  - `share_pct` is a relative weight among the building's primaries that
    apply *that day*: hours = building hours x share / (sum of that day's
    primary shares). 50/50 and 100/100 are the same even split. Chosen
    over literal fixed fractions because several overlaps are day-limited
    (Boppell: Randall all days, Yuriy Tue-Sat) - a fixed 50% would leave
    Monday half-staffed; weights give Randall 100% on Monday and 50% on
    Tue-Sat.
  - An unavailable primary's fraction is "missing". Available secondaries
    take over just that portion (split by their own shares) - previously
    a secondary only stepped in when *every* primary was out, and took the
    whole building. With no secondary, the missing portion becomes a
    callout gap with `daily_hours` scaled to it, so coverage gets 43% of
    that portion (Olga out -> Isaiah gets 43% of half of Warren).
  - A building with only secondaries that day treats them as primaries
    (unchanged behavior when shares are equal).
  - Standing task hours are no longer rounded, so a sole assignee gets
    exactly the building's hours (caught by an existing test).
- `shared/types.ts`: `CustodianAssignment.share_pct`;
  `CoverageGap.uncovered_fraction` (1 for whole-building gaps and
  leftovers). `shared/schemas.ts`: `share_pct` (int 1-100, default 100)
  on create; new `assignmentUpdateRequestSchema`.
- `server/routes/assignments.ts`: `POST` accepts `share_pct`; new
  `PATCH /:id` updates only `share_pct` (other fields still change by
  remove + re-add). `client/src/api.ts`: `updateAssignment`.
- `client/src/pages/Assignments.tsx`: primary chips on a building with 2+
  primaries get a small % box (saves on Enter/blur, out-of-range reverts;
  tooltip lists who it is weighed against and the split on days everyone
  works). Add form gains "Share %". Secondary chips have no editor -
  secondary shares only matter between two secondaries covering the same
  absence, which no current building has. `client/src/index.css`:
  `.share-input`.
- `client/src/pages/ScheduleBoard.tsx`: partial gaps say "N% of building
  uncovered".
- Tests (`tests/schedules.test.ts`, 4 new): Warren 50/50 from the seed and
  60/40 after PATCH, PATCH rejects 0; Olga out -> Brandon keeps exactly
  half and Warren is either covered at 43% of half or a 50% gap; Boppell
  is all Randall on Monday and an even split on Tuesday; Michael out on a
  Friday -> Clif (secondary) gets exactly Michael's half of Field House,
  no gap. 21/21 pass, typecheck passes.
- Verified on a copy of the live db (db:init applies 013 once, skips on
  re-run). Wednesday standing hours across the roster: 179.7 -> 114.4.
  Warren 12.50/12.50 -> 6.25/6.25; Andrew 14.42 -> 7.21; Michael 24.16 ->
  12.73. Olga out: Brandon keeps 6.25h, Isaiah gets Restrooms/Trash for
  her half (2.69h). The Assignments page editor was not checked in a
  browser.
- Still open: many people remain over 7.5h from standing work alone -
  that is the separate `daily_hours_l2` calibration Known Issue, not
  double-counting.
- Reverting: the code is one commit on top of `5f570ff`. The db column
  stays after a code revert (old code ignores it, default 100 is
  harmless); `data/custodial.db.pre-share-backup` is a pre-migration copy
  of the live db if a full rollback is wanted.

### Data: Hope and Oksana back from FMLA (live db, 2026-11-20)

Both had open-ended `fmla` rows from the 2026-10-07 whiteboard ("FMLA, no
dates given"), so generation treated them as unavailable every day while
the Custodians page showed them "In" (the badge only knew one-day
callouts). User confirmed both are back. Added an `active` row for each
via `POST /api/custodians/:id/status` (`effective_date` 2026-11-20, open
end, note "Back from FMLA"), which outranks the undated FMLA row under
status precedence. History kept: 2026-11-19 and earlier still resolve to
FMLA. Done before the "back" endpoint below existed; that endpoint would
have set the FMLA rows' `end_date` to 2026-11-19 instead. Equivalent
result, left as is.

### Extended absences: callout/vacation/FMLA date ranges, and "back"

The backend already stored and honored date ranges (`custodian_status`
`effective_date`/`end_date`, respected by generate); only the Custodians
page was limited to one-day callouts, and its badge didn't show
FMLA/vacation at all.

- `server/routes/custodians.ts`:
  - `GET /` (optional `?date=`, default today) returns `current_status`
    (the winning absence covering that date, or null when working) and
    `upcoming_status` (soonest absence starting after it) per custodian,
    replacing the one-day-only `callout_id`.
  - New `POST /:id/back { date }`: ends every non-active status row
    covering `date`. Rows starting on/after `date` are deleted; rows that
    started earlier (or have no start) get `end_date` = the day before, so
    the absence's history stays. Later absences are untouched. Replaces
    the page's use of `DELETE /:id/status/:statusId`, which is kept as a
    plain API for correcting a mistaken entry.
  - Status precedence extracted into `byPrecedence` (also used by
    `GET /:id/status`).
- Status precedence tiebreak, in both `byPrecedence` and
  `server/routes/schedules.ts`'s `unavailableCustodianMap`: rows with the
  same start date previously tied, and the winner depended on query
  order. Now the newest record (highest id) wins. Real case: Hope's
  "back" row starts 2026-11-20, so marking her out that same day would
  otherwise have been ignored by generate. The two precedence
  implementations remain duplicated (custodians.ts and schedules.ts);
  noted in both, not merged.
- `shared/schemas.ts`: status create rejects `end_date` before
  `effective_date` (400); new `custodianBackRequestSchema`.
  `shared/types.ts`: `Custodian.current_status`/`upcoming_status` replace
  `callout_id`. `client/src/api.ts`: `markCustodianBack`.
- `client/src/pages/Custodians.tsx`: the Today badge shows the absence in
  effect ("Out", "Out thru Fri 11/22", "Vacation thru ...", "FMLA", "Out
  until back"). Clicking "In" opens a form: Callout/Vacation/FMLA, From
  (default today), Through (default today; blank = until marked back),
  with "Just that day" / "Until marked back" shortcuts. Clicking a red
  badge confirms and marks the person back as of today. An upcoming
  absence shows under the badge ("Vacation Mon 11/24 - Wed 11/26"). The
  regenerate banner appears when a change touches today (a future-only
  absence doesn't trigger it). "N out today" counts any absence.
- Tests (`tests/schedules.test.ts`, 5 new): a 3-day vacation is upcoming
  before, current during and gone after, and generate skips the person
  mid-range only; back mid-range sets `end_date` to the day before with
  earlier days still out, back on the first day deletes the row; back
  ends an undated open-ended FMLA and keeps a later vacation as
  `upcoming_status`; a same-day callout beats an `active` row (badge and
  generate); end before start is a 400. 26/26 pass, typecheck passes.
- Verified on a copy of the live db: Hope and Oksana read FMLA on 11-19
  and in on 11-20, Ryan G out on 11-20; an Olga vacation 11-24..11-26
  shows as upcoming on 11-20 and current on 11-25. The page itself was
  not checked in a browser.
- Not done: editing an existing absence's dates in place (end it with
  "back" and re-add), and partial-day absences.
