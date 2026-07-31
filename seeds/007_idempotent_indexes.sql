-- ============================================================
-- Unique indexes needed for safe reseeding (npm run db:init).
-- Several seed INSERTs (custodians, building_spaces, daily_coverage)
-- don't specify explicit ids, so on an existing db they'd otherwise
-- insert duplicate rows every time this script runs, instead of being
-- skipped like the id-keyed tables already are.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_custodians_name
  ON custodians(name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_building_spaces_natural
  ON building_spaces(building_id, floor, space_type, sqft);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_coverage_natural
  ON daily_coverage(coverage_date, custodian_id, period, assignment);
