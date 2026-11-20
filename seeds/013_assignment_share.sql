-- ============================================================
-- Assignment shares: how a building's daily hours split between the
-- custodians assigned to it. share_pct is a relative weight among the
-- primaries that apply on a given day (see planStandingAssignments in
-- server/routes/schedules.ts) - 100/100 and 50/50 both split evenly,
-- 60/40 splits 60/40. The default of 100 for every existing row means
-- every shared building (10 of them on the 2026-10-07 whiteboard) now
-- splits evenly instead of crediting each assignee the full building.
-- Editable per assignment on the Assignments page.
-- ============================================================

ALTER TABLE custodian_assignments ADD COLUMN share_pct INTEGER NOT NULL DEFAULT 100;

-- Warren Hall: Brandon (boys side) / Olga (girls side), shown as 50/50.
-- Same split as the 100/100 default, but reads as intended on the page.
-- Guarded so a db:init re-run doesn't reset a split someone has edited
-- (e.g. to 60/40): only applies while every Warren row is still 100.
UPDATE custodian_assignments SET share_pct = 50
WHERE building_id = (SELECT id FROM buildings WHERE name = 'Warren Hall')
  AND NOT EXISTS (
    SELECT 1 FROM custodian_assignments
    WHERE building_id = (SELECT id FROM buildings WHERE name = 'Warren Hall')
      AND share_pct <> 100);
