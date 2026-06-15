-- ============================================================
-- APPA Custodial Staffing Seed Data
-- Based on APPA Operational Guidelines for Educational Facilities
-- Values = cleanable sq ft per custodian per 8-hour shift
-- Level 1 = Orderly Spotlessness (highest)
-- Level 5 = Unkempt Neglect (lowest, most sq ft per person)
-- ============================================================

-- Service level reference table
CREATE TABLE IF NOT EXISTS appa_service_levels (
    id          INTEGER PRIMARY KEY,
    level       INTEGER NOT NULL UNIQUE,  -- 1-5
    name        TEXT    NOT NULL,
    description TEXT
);

INSERT INTO appa_service_levels (level, name, description) VALUES
(1, 'Orderly Spotlessness',
 'Floors and base moldings shine and are bright and clean. All surfaces freshly cleaned with no dust, dirt, marks, or fingerprints. Washrooms gleam and are odor-free. Highest standard; show-quality cleaning.'),
(2, 'Ordinary Tidiness',
 'Floors are swept clean; colors are fresh. No buildup in corners. Surfaces clean but may show dust or fingerprints on close inspection. Washroom fixtures gleam. Standard target for most university buildings.'),
(3, 'Casual Inattention',
 'Floors swept but dull and dingy with noticeable buildup. Surfaces have visible dust, lint, and smudges. Washrooms lack luster. Noticeable neglect present. Minimum acceptable for occupied facilities.'),
(4, 'Moderate Dinginess',
 'Floors are dirty. Surfaces have streaks, stains, and heavy dust. Fixtures are dirty. Condition is below standard and noticeable to building occupants. Inadequate staffing indicator.'),
(5, 'Unkempt Neglect',
 'Floors are dirty with buildup, stains, and litter. Surfaces heavily soiled. Washrooms have odor. Lighting failures present. Severely understaffed condition.');


-- Room type table with sq ft per custodian per 8-hour shift at each APPA level
-- Sources: APPA Custodial Staffing Guidelines (public university audit documents),
--          De Anza College staffing analysis, Slippery Rock University case study,
--          Purdue Building Services APPA matrix (420 productive min/shift basis)
CREATE TABLE IF NOT EXISTS appa_room_types (
    id           INTEGER PRIMARY KEY,
    code         TEXT    NOT NULL UNIQUE,
    name         TEXT    NOT NULL,
    category     TEXT    NOT NULL,  -- grouping for UI
    sqft_level_1 INTEGER NOT NULL,
    sqft_level_2 INTEGER NOT NULL,
    sqft_level_3 INTEGER NOT NULL,
    sqft_level_4 INTEGER NOT NULL,
    sqft_level_5 INTEGER NOT NULL,
    notes        TEXT
);

INSERT INTO appa_room_types
    (code, name, category, sqft_level_1, sqft_level_2, sqft_level_3, sqft_level_4, sqft_level_5, notes)
VALUES
-- CLASSROOMS
('CLASS_HARD',  'Classroom – Hard Floor',        'Classroom',   3500,  4600,  7200,  9200, 11600, 'Lecture rooms, seminar rooms with vinyl/tile/wood floors'),
('CLASS_CARP',  'Classroom – Carpet',            'Classroom',   4200,  5500,  8000, 10500, 13000, 'Carpeted lecture/seminar rooms'),
('LAB_SCI',     'Science Laboratory',            'Classroom',   2800,  3600,  5500,  7200,  9000, 'Chemistry, biology, physics labs; higher detail required'),
('LAB_COMP',    'Computer Laboratory',           'Classroom',   3200,  4200,  6200,  8000, 10000, 'Computer labs and technology classrooms'),
('LECTURE_LG',  'Large Lecture Hall',            'Classroom',   4000,  5200,  7800, 10000, 12500, 'Auditorium-style lecture halls >100 seats'),

-- OFFICES
('OFFICE_OPEN', 'Open Office / Cubicle Area',    'Office',      3800,  4900,  7500,  9800, 12300, 'Open-plan offices, bullpens, shared workspaces'),
('OFFICE_PRIV', 'Private Office',                'Office',      4500,  5800,  8500, 11000, 13500, 'Individual enclosed offices; lighter use'),
('CONF_ROOM',   'Conference / Meeting Room',     'Office',      3500,  4600,  6800,  8800, 11000, 'Boardrooms, small meeting rooms'),
('RECEPTION',   'Reception / Lobby Office',      'Office',      3000,  3900,  5800,  7500,  9500, 'Front-desk and reception areas with higher foot traffic'),

-- RESTROOMS
('RESTROOM',    'Restroom / Toilet Room',        'Restroom',     900,  1200,  1700,  2200,  2800, 'Standard multi-stall restrooms; most labor-intensive space type'),
('LOCKER_RM',   'Locker Room / Shower',          'Restroom',     750,  1000,  1500,  2000,  2500, 'Athletic or gym locker rooms with showers'),
('SINGLE_RR',   'Single-Occupancy Restroom',     'Restroom',    1100,  1500,  2200,  2800,  3500, 'ADA single-occupancy or family restrooms'),

-- CIRCULATION
('CORRIDOR',    'Corridor / Hallway',            'Circulation', 7000,  9000, 13500, 17500, 22000, 'Interior hallways; high traffic, mostly sweeping/mopping'),
('LOBBY_MAIN',  'Main Lobby / Entrance',         'Circulation', 3500,  4500,  6500,  8500, 10500, 'Building main entrances and atriums; high visibility'),
('STAIRWELL',   'Stairwell / Landing',           'Circulation', 6000,  8000, 12000, 15500, 19500, 'Interior stairs; mostly sweeping and spot mopping'),
('ELEVATOR',    'Elevator Cab',                  'Circulation', 2000,  2600,  3800,  5000,  6200, 'Interior elevator cabs; small area but daily service needed'),

-- COMMON / SUPPORT
('LOUNGE',      'Lounge / Break Room',           'Common',      3000,  3900,  5800,  7500,  9500, 'Student lounges, faculty break rooms, kitchenettes'),
('LIBRARY_GEN', 'Library – General Stack Area',  'Common',      4500,  5800,  8500, 11000, 13500, 'Open library stacks and reading rooms'),
('LIBRARY_REF', 'Library – Reference / Study',  'Common',      3500,  4600,  6800,  8800, 11000, 'Busy study and reference areas with heavier use'),
('FOOD_COURT',  'Dining / Food Service Area',    'Common',      2000,  2600,  3800,  5000,  6200, 'Cafeterias and dining halls; grease and food debris'),
('GYM_ARENA',   'Gymnasium / Arena Floor',       'Common',      5000,  6500,  9500, 12500, 15500, 'Large open athletic floors; efficient with proper equipment'),
('CHAPEL_AUD',  'Chapel / Auditorium',           'Common',      4500,  5800,  8500, 11000, 13500, 'Fixed-seating performance or worship spaces'),

-- RESIDENTIAL (relevant for dorms)
('DORM_ROOM',   'Residence Hall – Bedroom',      'Residential', 4000,  5200,  7800, 10000, 12500, 'Individual dorm rooms; occupant cleans own space in most models'),
('DORM_BATH',   'Residence Hall – Hall Bath',    'Residential',  900,  1200,  1700,  2200,  2800, 'Shared floor bathrooms in residence halls'),
('DORM_LOUNGE', 'Residence Hall – Floor Lounge', 'Residential', 3500,  4600,  6800,  8800, 11000, 'Common living areas in residence halls'),

-- SPECIALTY / SUPPORT
('MECH_ROOM',   'Mechanical / Utility Room',     'Support',    10000, 13000, 18000, 23000, 28000, 'Boiler rooms, electrical rooms; minimal detail cleaning'),
('STORAGE',     'Storage Room',                  'Support',    12000, 15000, 20000, 26000, 32000, 'Closets and storage; swept periodically only'),
('HEALTH_CTR',  'Health / Clinic Space',         'Support',     1800,  2400,  3500,  4500,  5600, 'Medical or counseling offices; higher sanitation standard'),
('CHAPEL_OFF',  'Campus Ministry / Quiet Room',  'Support',     4000,  5200,  7500,  9800, 12000, 'Low-traffic spiritual or meditation spaces');


-- Convenience view: FTE required given sqft and target level
-- Usage: SELECT * FROM v_fte_calculator WHERE room_type_code = 'RESTROOM' AND target_level = 2;
-- Requires the calling app to supply actual_sqft; this view shows sqft_per_fte for reference.
CREATE VIEW IF NOT EXISTS v_room_type_summary AS
SELECT
    rt.id,
    rt.code,
    rt.name,
    rt.category,
    sl1.name  AS level_1_name,
    rt.sqft_level_1,
    sl2.name  AS level_2_name,
    rt.sqft_level_2,
    sl3.name  AS level_3_name,
    rt.sqft_level_3,
    sl4.name  AS level_4_name,
    rt.sqft_level_4,
    sl5.name  AS level_5_name,
    rt.sqft_level_5,
    rt.notes
FROM appa_room_types rt
JOIN appa_service_levels sl1 ON sl1.level = 1
JOIN appa_service_levels sl2 ON sl2.level = 2
JOIN appa_service_levels sl3 ON sl3.level = 3
JOIN appa_service_levels sl4 ON sl4.level = 4
JOIN appa_service_levels sl5 ON sl5.level = 5;
