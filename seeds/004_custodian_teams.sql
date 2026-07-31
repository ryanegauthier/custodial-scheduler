-- ============================================================
-- Custodian teams, from the posted team assignment sheets
-- (Team 1-6 whiteboard photos, 2026-07-30)
-- ============================================================

PRAGMA foreign_keys = ON;

-- Two buildings referenced on the sheets that weren't in the original
-- building list. seeds/003_add_coordinates.sql already carries lat/lng
-- for both names (it runs before this file, so those UPDATEs no-op -
-- coordinates are set directly below instead).
INSERT INTO buildings (id, name, category, zone_id, lat, lng, notes) VALUES
(42, 'Hawthorne Hall', 'Unknown', NULL, 47.7515, -117.4115, 'Added from Team 2 sheet ("Temp Hawthorne"). No sqft/APPA data yet - needs follow-up.'),
(43, 'Security', 'Administrative', 7, 47.7522, -117.4172, 'Added from Team 6 sheet ("Facilities Admin Security"), listed as its own space alongside FS Admin. No sqft/APPA data yet - needs follow-up.');

-- Teams
CREATE TABLE IF NOT EXISTS teams (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL,
    notes   TEXT
);

INSERT INTO teams (id, name, notes) VALUES
(1, 'Team 1', NULL),
(2, 'Team 2', NULL),
(3, 'Team 3', NULL),
(4, 'Team 4', NULL),
(5, 'Team 5', NULL),
(6, 'Team 6', 'Sheet has a handwritten addition, possibly "Outer Fields" - illegible, not mapped to a building.');

-- Custodians belong to one team
ALTER TABLE custodians ADD COLUMN team_id INTEGER REFERENCES teams(id);

-- Buildings a team is responsible for (many-to-many)
CREATE TABLE IF NOT EXISTS team_buildings (
    team_id     INTEGER NOT NULL REFERENCES teams(id),
    building_id INTEGER NOT NULL REFERENCES buildings(id),
    PRIMARY KEY (team_id, building_id)
);

INSERT INTO team_buildings (team_id, building_id)
SELECT 1, id FROM buildings WHERE name IN (
    'Hixson Union Building (HUB)', 'Graves Gym', 'Field House',
    'Lied Art Center', 'Beeksma Theology Center & Seeley G. Mudd Chapel')
UNION ALL
SELECT 2, id FROM buildings WHERE name IN (
    'The Pines', 'Dornsife', 'PACCAR Engineering', 'Dixon Hall', 'Hawthorne Hall')
UNION ALL
SELECT 3, id FROM buildings WHERE name IN (
    'Robinson Science Hall', 'Schumacher Hall', 'Cowles Music Center',
    'Lindaman Center', 'Harriet Cheney Cowles Memorial Library')
UNION ALL
SELECT 4, id FROM buildings WHERE name IN (
    'McEachran Hall', 'Tacoma Hall', 'Eric Johnston Science Center',
    'Westminster Hall', 'Weyerhaeuser Hall')
UNION ALL
SELECT 5, id FROM buildings WHERE name IN (
    'Aquatic Center & Scotford SC', 'University Recreation Center (U-Rec)',
    'WALT', 'FS Shops')
UNION ALL
SELECT 6, id FROM buildings WHERE name IN (
    'Viren House Admissions Visitor Center', 'MacKay Hall', 'Auld House',
    'Cowles Memorial Auditorium', 'Hardwick House', 'FS Admin', 'Security');

-- Custodians
INSERT INTO custodians (name, team_id) VALUES
('Clif', 1), ('Phil', 1), ('Dale', 1),
('Bobbiann', 2), ('Isaiah', 2), ('Ryan G', 2),
('Angela', 3), ('Silas', 3), ('Yuriy', 3),
('Zach', 4), ('Olga', 4), ('Miaya', 4),
('Hope', 5), ('Andrew', 5),
('Oksana', 6), ('Ryan C', 6);
