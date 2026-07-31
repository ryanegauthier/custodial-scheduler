-- ============================================================
-- Daily "Additional Coverage" board
-- Captures the AM/PM ad-hoc reassignments written on the coverage
-- whiteboard each day, layered on top of a custodian's normal
-- team/building assignment (teams, team_buildings).
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS daily_coverage (
    id              INTEGER PRIMARY KEY,
    coverage_date   TEXT NOT NULL,
    custodian_id    INTEGER NOT NULL REFERENCES custodians(id),
    period          TEXT NOT NULL CHECK (period IN ('morning', 'afternoon')),
    assignment      TEXT NOT NULL,
    excluded_note   TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Summer-only flex staff seen on the coverage board doing hard floors (HF)
-- and theme houses (TH), not part of any of the 6 standing teams.
INSERT INTO custodians (name, team_id, notes) VALUES
('Carlie',    NULL, 'Summer-only: Hard Floors (HF) crew'),
('Joe',       NULL, 'Summer-only: Hard Floors (HF) crew'),
('Veronica',  NULL, 'Summer-only: Theme Houses (TH) crew'),
('Brandon',   NULL, 'Summer-only: Theme Houses (TH) crew');
