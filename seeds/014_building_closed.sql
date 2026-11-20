-- ============================================================
-- Building closed flag: a manual on/off for buildings that are out of
-- use (under construction, unoccupied). A closed building is skipped by
-- POST /api/schedules/generate entirely - no standing tasks, no coverage,
-- not listed as a gap - until it is reopened from the Buildings page.
-- Column only, every building starts open: which buildings are closed is
-- an operational choice made in the UI, and setting it here would re-close
-- them on every db:init.
-- ============================================================

ALTER TABLE buildings ADD COLUMN closed INTEGER NOT NULL DEFAULT 0;
