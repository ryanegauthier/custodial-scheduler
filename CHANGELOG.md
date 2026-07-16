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
- No automated tests exist anywhere in the repo. The 2026-07-13 TypeScript
  migration was verified manually (curl against the running dev server,
  `tsc --noEmit`, a production `vite build`) rather than with a test suite.

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
