-- ============================================================
-- AM/PM tagging for generated tasks. Every active custodian gets up to
-- 4 hours of common-building (team-owned) work tagged 'morning'; anything
-- beyond that, plus all residential-building work, is tagged 'afternoon'.
-- Residential assignment itself is still unsolved - those tasks are
-- tagged but left unassigned, same as before.
-- ============================================================

ALTER TABLE building_tasks ADD COLUMN period TEXT CHECK (period IN ('morning', 'afternoon'));
