-- ============================================================
-- Historical "Additional Coverage" board entries
-- Transcribed from photos of the physical whiteboard for
-- 2026-06-12, 2026-07-09, and 2026-07-13.
-- "No X" annotations are one-off exclusions for that day only,
-- stored per-row via excluded_note (not a standing custodian trait).
-- ============================================================

PRAGMA foreign_keys = ON;

INSERT INTO daily_coverage (coverage_date, custodian_id, period, assignment, excluded_note)
SELECT '2026-06-12', id, 'morning', 'Art/Chapel/Graves', NULL FROM custodians WHERE name = 'Phil'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Walt', NULL FROM custodians WHERE name = 'Phil'
UNION ALL SELECT '2026-06-12', id, 'morning', 'Vacuum Pines', NULL FROM custodians WHERE name = 'Bobbiann'
UNION ALL SELECT '2026-06-12', id, 'morning', 'Auditorium', NULL FROM custodians WHERE name = 'Isaiah'
UNION ALL SELECT '2026-06-12', id, 'morning', 'Vacuum Dixon', NULL FROM custodians WHERE name = 'Ryan G'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Duvall / Repair Vac', NULL FROM custodians WHERE name = 'Ryan G'
UNION ALL SELECT '2026-06-12', id, 'morning', 'Old FS', NULL FROM custodians WHERE name = 'Silas'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Warren', NULL FROM custodians WHERE name = 'Silas'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Auditorium/Oliver', NULL FROM custodians WHERE name = 'Yuriy'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Fieldhouse', NULL FROM custodians WHERE name = 'Zach'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Warren', NULL FROM custodians WHERE name = 'Olga'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Boppell', NULL FROM custodians WHERE name = 'Miaya'
UNION ALL SELECT '2026-06-12', id, 'morning', 'Auditorium', NULL FROM custodians WHERE name = 'Andrew'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Urec/Mac', NULL FROM custodians WHERE name = 'Andrew'
UNION ALL SELECT '2026-06-12', id, 'morning', 'Auditorium', NULL FROM custodians WHERE name = 'Hope'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Hub', NULL FROM custodians WHERE name = 'Hope'
UNION ALL SELECT '2026-06-12', id, 'morning', 'Carpet T.H.', NULL FROM custodians WHERE name = 'Ryan C'
UNION ALL SELECT '2026-06-12', id, 'afternoon', 'Graves/Hub', NULL FROM custodians WHERE name = 'Ryan C'
UNION ALL SELECT '2026-06-12', id, 'morning', 'H.F.', NULL FROM custodians WHERE name = 'Carlie'
UNION ALL SELECT '2026-06-12', id, 'morning', 'H.F.', NULL FROM custodians WHERE name = 'Joe'
UNION ALL SELECT '2026-06-12', id, 'morning', 'T.H.', NULL FROM custodians WHERE name = 'Veronica'
UNION ALL SELECT '2026-06-12', id, 'morning', 'T.H.', NULL FROM custodians WHERE name = 'Brandon'

UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Tractor', NULL FROM custodians WHERE name = 'Dale'
UNION ALL SELECT '2026-07-09', id, 'morning', 'Hub vac', 'No Art' FROM custodians WHERE name = 'Phil'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Hub/FH/Graves', 'No Art' FROM custodians WHERE name = 'Phil'
UNION ALL SELECT '2026-07-09', id, 'morning', 'Chapel trash', 'No Art' FROM custodians WHERE name = 'Clif'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Warren South 1,2,3 + 1st common', 'No Art' FROM custodians WHERE name = 'Clif'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Warren West 1,2,3', NULL FROM custodians WHERE name = 'Bobbiann'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Boppell', NULL FROM custodians WHERE name = 'Ryan G'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Oliver flip 3rd + Duvall 106', NULL FROM custodians WHERE name = 'Angela'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Jenkins flip 1st rooms + bathroom', NULL FROM custodians WHERE name = 'Silas'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Warren East 1,2,3 + laundry room', NULL FROM custodians WHERE name = 'Yuriy'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Trash', NULL FROM custodians WHERE name = 'Zach'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Baldwin flip 1st rooms + bathroom', NULL FROM custodians WHERE name = 'Olga'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Baldwin flip 2nd rooms + bathroom', NULL FROM custodians WHERE name = 'Miaya'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Oliver flip 2nd + Duvall 105', NULL FROM custodians WHERE name = 'Andrew'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Jenkins flip 2nd rooms', NULL FROM custodians WHERE name = 'Oksana'
UNION ALL SELECT '2026-07-09', id, 'morning', 'Carpet T.H.', NULL FROM custodians WHERE name = 'Ryan C'
UNION ALL SELECT '2026-07-09', id, 'afternoon', 'Baseball Dumpster ASAP', NULL FROM custodians WHERE name = 'Ryan C'
UNION ALL SELECT '2026-07-09', id, 'morning', 'H.F.', NULL FROM custodians WHERE name = 'Carlie'
UNION ALL SELECT '2026-07-09', id, 'morning', 'H.F.', NULL FROM custodians WHERE name = 'Joe'
UNION ALL SELECT '2026-07-09', id, 'morning', 'T.H.', NULL FROM custodians WHERE name = 'Veronica'
UNION ALL SELECT '2026-07-09', id, 'morning', 'T.H.', NULL FROM custodians WHERE name = 'Brandon'

UNION ALL SELECT '2026-07-13', id, 'morning', 'All Hub, FH, Graves', 'No Art / Chapel' FROM custodians WHERE name = 'Phil'
UNION ALL SELECT '2026-07-13', id, 'afternoon', 'Boppell', NULL FROM custodians WHERE name = 'Ryan G'
UNION ALL SELECT '2026-07-13', id, 'afternoon', 'Arend deep clean basement', NULL FROM custodians WHERE name = 'Angela'
UNION ALL SELECT '2026-07-13', id, 'afternoon', 'Arend deep clean 1st East', NULL FROM custodians WHERE name = 'Silas'
UNION ALL SELECT '2026-07-13', id, 'afternoon', 'Warren 1st,2nd,3rd East / 1st,2nd West', NULL FROM custodians WHERE name = 'Yuriy'
UNION ALL SELECT '2026-07-13', id, 'afternoon', 'Trash', NULL FROM custodians WHERE name = 'Zach'
UNION ALL SELECT '2026-07-13', id, 'afternoon', 'Arend deep clean 2nd East', NULL FROM custodians WHERE name = 'Olga'
UNION ALL SELECT '2026-07-13', id, 'afternoon', 'Arend deep clean 1st West', NULL FROM custodians WHERE name = 'Miaya'
UNION ALL SELECT '2026-07-13', id, 'afternoon', 'Lower Fields / Arend deep clean 2nd West', 'No Aqua' FROM custodians WHERE name = 'Andrew'
UNION ALL SELECT '2026-07-13', id, 'morning', 'All Aqua', NULL FROM custodians WHERE name = 'Hope'
UNION ALL SELECT '2026-07-13', id, 'morning', 'All Chapel', 'No FS' FROM custodians WHERE name = 'Oksana'
UNION ALL SELECT '2026-07-13', id, 'afternoon', 'Warren common', 'No FS' FROM custodians WHERE name = 'Oksana'
UNION ALL SELECT '2026-07-13', id, 'morning', 'Carpet T.H.', NULL FROM custodians WHERE name = 'Ryan C'
UNION ALL SELECT '2026-07-13', id, 'morning', 'H.F.', NULL FROM custodians WHERE name = 'Carlie'
UNION ALL SELECT '2026-07-13', id, 'morning', 'H.F.', NULL FROM custodians WHERE name = 'Joe'
UNION ALL SELECT '2026-07-13', id, 'morning', 'T.H.', NULL FROM custodians WHERE name = 'Veronica'
UNION ALL SELECT '2026-07-13', id, 'morning', 'T.H.', NULL FROM custodians WHERE name = 'Brandon';
