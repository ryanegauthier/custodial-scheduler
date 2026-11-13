-- ============================================================
-- Coverage pool: custodians approved to pick up a called-out
-- custodian's restrooms and trash (POST /api/schedules/generate).
-- Toggled per person on the Custodians page.
-- ============================================================

ALTER TABLE custodians ADD COLUMN coverage_approved INTEGER NOT NULL DEFAULT 0;

-- Initial pool: every active custodian with no standing assignment
-- (per user, 2026-11-13). Guarded so it only runs while nobody is
-- approved yet - init-db re-runs every statement, and an unguarded
-- UPDATE would re-approve anyone a manager un-flagged in the UI. Known
-- gap: if a manager un-flags *everyone*, the next db:init re-seeds this.
UPDATE custodians SET coverage_approved = 1
WHERE active = 1
  AND id NOT IN (SELECT custodian_id FROM custodian_assignments)
  AND NOT EXISTS (SELECT 1 FROM custodians WHERE coverage_approved = 1);
