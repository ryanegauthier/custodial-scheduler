-- ============================================================
-- Correction: the productive shift is 450 min (7.5 hrs), not 420 (7.0),
-- e.g. a 4:00am-12:30pm shift with a half-hour lunch. The 30-min gap per
-- custodian compounds noticeably across a full crew.
-- 002_whitworth_data.sql's column DEFAULT only applies to newly inserted
-- rows, not the 3 shift_templates rows already sitting in any existing
-- db - this UPDATE is what actually corrects those (idempotent: re-running
-- it just sets the same value again).
-- ============================================================

UPDATE shift_templates SET productive_min = 450 WHERE productive_min = 420;
