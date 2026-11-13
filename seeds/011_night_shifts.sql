-- ============================================================
-- Night crew shift start times. Same 8.5-hr span / 7.5-hr productive
-- structure as the morning shifts (column defaults from
-- 002_whitworth_data.sql), e.g. the 2pm shift runs 2:00pm-10:30pm.
-- start_time stays 24-hour 'HH:MM' so ORDER BY s.start_time keeps
-- sorting night shifts after morning ones.
-- Idempotent: explicit ids make a re-run hit a UNIQUE constraint, which
-- scripts/init-db.js skips.
-- ============================================================

INSERT INTO shift_templates (id, name, start_time) VALUES
(4, '2pm Shift', '14:00'),
(5, '3pm Shift', '15:00');
