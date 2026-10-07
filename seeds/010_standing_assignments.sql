-- ============================================================
-- Standing custodian assignments, from the current whiteboard
-- (2026-10-07). Replaces the Team 1-6 model (seeds/004) as the source
-- of truth for POST /api/schedules/generate - custodians have fixed
-- building assignments that change ~once a semester, and daily
-- scheduling is exception handling (callouts/FMLA/events) against
-- those standing assignments, not a fresh APPA-derived computation.
--
-- seeds/004's teams/team_buildings tables are left in place (not
-- dropped) since nothing but the old /generate algorithm read them
-- and dropping tables is out of scope here - they're just unused now.
-- ============================================================

PRAGMA foreign_keys = ON;

-- The new whiteboard is treated as the authoritative current roster.
-- Dale and Silas (seeds/004) aren't on it, so they're deactivated
-- rather than deleted - history (team_id, old assignments) is kept.
UPDATE custodians SET active = 0 WHERE name IN ('Dale', 'Silas');

-- New names on the whiteboard not already in the roster. Of the 20
-- whiteboard names, 14 already exist from seeds/004 (Clif, Phil,
-- Bobbiann, Isaiah, Ryan G, Angela, Yuriy, Zach, Olga, Miaya, Hope,
-- Andrew, Oksana, Ryan C - reused as-is, "Bobbiann" keeping its
-- existing casing) and 3 more already exist from seeds/005's
-- summer-only Hard Floors/Theme Houses crew (Joe, Veronica, Brandon).
-- Only Randall, Michael, and Amos are genuinely new - a single INSERT
-- statement naming an already-present name would UNIQUE-constraint-fail
-- as a whole (seeds/007's idx_custodians_name), silently dropping every
-- row in that statement, Randall/Michael/Amos included. Caught by
-- checking actual assignment counts after a dry run, not assumed.
INSERT INTO custodians (name) VALUES
('Randall'), ('Michael'), ('Amos');

-- A generic task type for whole-building standing-assignment cleaning,
-- since building_tasks.task_type_id is NOT NULL and the old APPA-rate
-- per-task-type breakdown (Floors/Restrooms/Trash/Spot Clean) doesn't
-- apply to this model - one custodian owns the whole building's daily
-- cleaning as a single block of hours.
INSERT INTO task_types (id, name, priority, is_disruptive, description) VALUES
(6, 'Standing Assignment', 0, FALSE,
 'Whole-building daily cleaning generated from a custodian''s standing assignment - supersedes the per-task-type APPA breakdown for buildings covered by this model');

CREATE TABLE IF NOT EXISTS custodian_assignments (
  id              INTEGER PRIMARY KEY,
  custodian_id    INTEGER NOT NULL REFERENCES custodians(id),
  building_id     INTEGER NOT NULL REFERENCES buildings(id),
  assignment_type TEXT NOT NULL DEFAULT 'primary',  -- primary | secondary
  days_of_week    TEXT,   -- null = all days, comma-separated otherwise e.g. 'tue,wed,thu,fri,sat'
  notes           TEXT    -- freeform e.g. 'Fridays only', 'Vac/Prog', 'Auto Scrub'
);

CREATE TABLE IF NOT EXISTS custodian_status (
  id              INTEGER PRIMARY KEY,
  custodian_id    INTEGER NOT NULL REFERENCES custodians(id),
  status          TEXT NOT NULL,  -- 'active' | 'fmla' | 'callout' | 'vacation'
  effective_date  TEXT,
  end_date        TEXT,
  notes           TEXT
);

-- Standing assignments. Explicit ids (matching the project's convention
-- for fixed/curated seed data, e.g. buildings/teams) so reseeding is
-- naturally idempotent via primary-key conflicts, same as every other
-- id-keyed seed table - no extra unique index needed like custodians
-- (seeds/007) required for its no-id inserts.
--
-- Two whiteboard entries are deliberately NOT seeded here, left as open
-- issues in CHANGELOG.md rather than guessed:
--   - Amos ("Thu-Mon only... see worksheets"): no building named.
--   - Isaiah ("M-F"): no building or secondary note at all.
INSERT INTO custodian_assignments (id, custodian_id, building_id, assignment_type, days_of_week, notes)
SELECT  1, c.id, b.id, 'primary',   NULL, NULL                           FROM custodians c, buildings b WHERE c.name = 'Phil'     AND b.name = 'WALT'
UNION ALL SELECT  2, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Phil'     AND b.name = 'Field House'
UNION ALL SELECT  3, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Phil'     AND b.name = 'Aquatic Center & Scotford SC'
UNION ALL SELECT  4, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Randall'  AND b.name = 'PACCAR Engineering'
UNION ALL SELECT  5, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Randall'  AND b.name = 'University Recreation Center (U-Rec)'
UNION ALL SELECT  6, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Randall'  AND b.name = 'Boppell Hall'
UNION ALL SELECT  7, c.id, b.id, 'primary',   NULL, 'Auto Scrub'         FROM custodians c, buildings b WHERE c.name = 'Clif'     AND b.name = 'Dixon Hall'
UNION ALL SELECT  8, c.id, b.id, 'primary',   NULL, '1st & 2nd floors'   FROM custodians c, buildings b WHERE c.name = 'Clif'     AND b.name = 'Stewart Hall'
UNION ALL SELECT  9, c.id, b.id, 'secondary', 'fri', 'Fridays only - court' FROM custodians c, buildings b WHERE c.name = 'Clif'  AND b.name = 'Field House'
UNION ALL SELECT 10, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Ryan G'   AND b.name = 'Robinson Science Hall'
UNION ALL SELECT 11, c.id, b.id, 'primary',   NULL, 'Vac/Prog'           FROM custodians c, buildings b WHERE c.name = 'Ryan G'   AND b.name = 'Duvall Hall'
UNION ALL SELECT 12, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Andrew'   AND b.name = 'Hixson Union Building (HUB)'
UNION ALL SELECT 13, c.id, b.id, 'primary',   NULL, '2nd & 3rd West'     FROM custodians c, buildings b WHERE c.name = 'Andrew'   AND b.name = 'Arend Hall'
UNION ALL SELECT 14, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Joe'      AND b.name = 'Hixson Union Building (HUB)'
UNION ALL SELECT 15, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Veronica' AND b.name = 'Cowles Music Center'
UNION ALL SELECT 16, c.id, b.id, 'primary',   NULL, 'Basement 1, 3rd East' FROM custodians c, buildings b WHERE c.name = 'Veronica' AND b.name = 'Arend Hall'
UNION ALL SELECT 17, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Brandon'  AND b.name = 'Lied Art Center'
UNION ALL SELECT 18, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Brandon'  AND b.name = 'Hendrick Hall'
UNION ALL SELECT 19, c.id, b.id, 'primary',   NULL, 'Boys side'          FROM custodians c, buildings b WHERE c.name = 'Brandon'  AND b.name = 'Warren Hall'
UNION ALL SELECT 20, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Angela'   AND b.name = 'Westminster Hall'
UNION ALL SELECT 21, c.id, b.id, 'primary',   NULL, '2nd, 3rd & Basement West' FROM custodians c, buildings b WHERE c.name = 'Angela' AND b.name = 'Oliver Hall'
UNION ALL SELECT 22, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Zach'     AND b.name = 'Eric Johnston Science Center'
UNION ALL SELECT 23, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Zach'     AND b.name = 'McEachran Hall'
UNION ALL SELECT 24, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Miaya'    AND b.name = 'Tacoma Hall'
UNION ALL SELECT 25, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Miaya'    AND b.name = 'Hendrick Hall'
UNION ALL SELECT 26, c.id, b.id, 'primary',   NULL, '3rd floor'          FROM custodians c, buildings b WHERE c.name = 'Miaya'    AND b.name = 'Stewart Hall'
UNION ALL SELECT 27, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Olga'     AND b.name = 'Weyerhaeuser Hall'
UNION ALL SELECT 28, c.id, b.id, 'primary',   NULL, 'Girls side'         FROM custodians c, buildings b WHERE c.name = 'Olga'     AND b.name = 'Warren Hall'
UNION ALL SELECT 29, c.id, b.id, 'primary',   NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Ryan C'   AND b.name = 'Harriet Cheney Cowles Memorial Library'
UNION ALL SELECT 30, c.id, b.id, 'primary',   NULL, 'Basement & 1st'     FROM custodians c, buildings b WHERE c.name = 'Ryan C'   AND b.name = 'Oliver Hall'
UNION ALL SELECT 31, c.id, b.id, 'primary',   'tue,wed,thu,fri,sat', 'Tue-Sat only' FROM custodians c, buildings b WHERE c.name = 'Yuriy' AND b.name = 'Duvall Hall'
UNION ALL SELECT 32, c.id, b.id, 'primary',   'tue,wed,thu,fri,sat', 'Tue-Sat only' FROM custodians c, buildings b WHERE c.name = 'Yuriy' AND b.name = 'Boppell Hall'
UNION ALL SELECT 33, c.id, b.id, 'primary',   'wed,thu,fri,sat,sun', '1st + Basement East; Wed-Sun only' FROM custodians c, buildings b WHERE c.name = 'Michael' AND b.name = 'Oliver Hall'
UNION ALL SELECT 34, c.id, b.id, 'primary',   'wed,thu,fri,sat,sun', 'Scotford; Wed-Sun only' FROM custodians c, buildings b WHERE c.name = 'Michael' AND b.name = 'Aquatic Center & Scotford SC'
UNION ALL SELECT 35, c.id, b.id, 'primary',   'wed,thu,fri,sat,sun', 'Wed-Sun only' FROM custodians c, buildings b WHERE c.name = 'Michael' AND b.name = 'Graves Gym'
UNION ALL SELECT 36, c.id, b.id, 'primary',   'wed,thu,fri,sat,sun', 'Wed-Sun only' FROM custodians c, buildings b WHERE c.name = 'Michael' AND b.name = 'Field House'
UNION ALL SELECT 37, c.id, b.id, 'secondary', NULL, NULL                 FROM custodians c, buildings b WHERE c.name = 'Bobbiann' AND b.name = 'Weyerhaeuser Hall';

-- Standing status flags. Explicit ids for the same idempotency reason
-- as above. "active" semantics (server/routes/schedules.ts): a
-- custodian is available on a date unless a fmla/callout/vacation row's
-- [effective_date, end_date] window covers it - absence of any row
-- means active. These two have no dates because the whiteboard gave
-- none; they read as open-ended until an end_date (or an explicit
-- 'active' row ending the window early) is added.
INSERT INTO custodian_status (id, custodian_id, status, effective_date, end_date, notes)
SELECT 1, id, 'fmla', NULL, NULL, 'Whiteboard: FMLA, no dates given' FROM custodians WHERE name = 'Hope'
UNION ALL
SELECT 2, id, 'fmla', NULL, NULL, 'Whiteboard: FMLA, no dates given' FROM custodians WHERE name = 'Oksana';
