-- Migration: add lat/lng columns to buildings table
-- Run this after init-db.js or add to a new seed file

ALTER TABLE buildings ADD COLUMN lat REAL;
ALTER TABLE buildings ADD COLUMN lng REAL;

-- Update coordinates for each building
UPDATE buildings SET lat = 47.7548, lng = -117.4165 WHERE name = 'Aquatic Center & Scotford SC';
UPDATE buildings SET lat = 47.7533, lng = -117.4154 WHERE name = 'Arend Hall';
UPDATE buildings SET lat = 47.7535, lng = -117.419 WHERE name = 'Auld House';
UPDATE buildings SET lat = 47.7547, lng = -117.4151 WHERE name = 'Baldwin-Jenkins Hall';
UPDATE buildings SET lat = 47.7532, lng = -117.4196 WHERE name = 'Ballard Hall';
UPDATE buildings SET lat = 47.7532, lng = -117.4178 WHERE name = 'Beeksma Theology Center & Seeley G. Mudd Chapel';
UPDATE buildings SET lat = 47.753, lng = -117.4132 WHERE name = 'Boppell Hall';
UPDATE buildings SET lat = 47.7517, lng = -117.418 WHERE name = 'Cowles Memorial Auditorium';
UPDATE buildings SET lat = 47.7536, lng = -117.4194 WHERE name = 'Cowles Music Center';
UPDATE buildings SET lat = 47.7522, lng = -117.4182 WHERE name = 'Dixon Hall';
UPDATE buildings SET lat = 47.7551, lng = -117.4175 WHERE name = 'Dornsife';
UPDATE buildings SET lat = 47.7537, lng = -117.4124 WHERE name = 'Duvall Hall';
UPDATE buildings SET lat = 47.7539, lng = -117.4158 WHERE name = 'Eric Johnston Science Center';
UPDATE buildings SET lat = 47.7536, lng = -117.4175 WHERE name = 'FS Admin';
UPDATE buildings SET lat = 47.7535, lng = -117.4185 WHERE name = 'FS Shops';
UPDATE buildings SET lat = 47.7534, lng = -117.4225 WHERE name = 'Field House';
UPDATE buildings SET lat = 47.7536, lng = -117.4208 WHERE name = 'Graves Gym';
UPDATE buildings SET lat = 47.753, lng = -117.4175 WHERE name = 'Hardwick House';
UPDATE buildings SET lat = 47.7533, lng = -117.4169 WHERE name = 'Harriet Cheney Cowles Memorial Library';
UPDATE buildings SET lat = 47.7515, lng = -117.4115 WHERE name = 'Hawthorne Hall';
UPDATE buildings SET lat = 47.7525, lng = -117.4165 WHERE name = 'Hendrick Hall';
UPDATE buildings SET lat = 47.7526, lng = -117.4153 WHERE name = 'Hixson Union Building (HUB)';
UPDATE buildings SET lat = 47.7549, lng = -117.4184 WHERE name = 'Lied Art Center';
UPDATE buildings SET lat = 47.754, lng = -117.4173 WHERE name = 'Lindaman Center';
UPDATE buildings SET lat = 47.7538, lng = -117.416 WHERE name = 'MAVRC';
UPDATE buildings SET lat = 47.7525, lng = -117.417 WHERE name = 'MacKay Hall';
UPDATE buildings SET lat = 47.7525, lng = -117.4165 WHERE name = 'McEachran Hall';
UPDATE buildings SET lat = 47.7539, lng = -117.4198 WHERE name = 'McMillan Hall';
UPDATE buildings SET lat = 47.7545, lng = -117.4128 WHERE name = 'Oliver Hall';
UPDATE buildings SET lat = 47.7545, lng = -117.4162 WHERE name = 'PACCAR Engineering';
UPDATE buildings SET lat = 47.7528, lng = -117.4138 WHERE name = 'Pigott Golf Center';
UPDATE buildings SET lat = 47.7542, lng = -117.4168 WHERE name = 'Robinson Science Hall';
UPDATE buildings SET lat = 47.7538, lng = -117.4165 WHERE name = 'Schumacher Hall';
UPDATE buildings SET lat = 47.7522, lng = -117.4172 WHERE name = 'Security';
UPDATE buildings SET lat = 47.7528, lng = -117.4195 WHERE name = 'Stewart Hall';
UPDATE buildings SET lat = 47.7534, lng = -117.417 WHERE name = 'Tacoma Hall';
UPDATE buildings SET lat = 47.7526, lng = -117.4145 WHERE name = 'The Pines';
UPDATE buildings SET lat = 47.7536, lng = -117.4155 WHERE name = 'University Recreation Center (U-Rec)';
UPDATE buildings SET lat = 47.7526, lng = -117.4151 WHERE name = 'Village (Akili, Tiki & Shalom)';
UPDATE buildings SET lat = 47.7527, lng = -117.4162 WHERE name = 'Viren House Admissions Visitor Center & Gathering Place';
UPDATE buildings SET lat = 47.7541, lng = -117.4218 WHERE name = 'WALT';
UPDATE buildings SET lat = 47.7525, lng = -117.419 WHERE name = 'Warren Hall';
UPDATE buildings SET lat = 47.7545, lng = -117.4175 WHERE name = 'Westminster Hall';
UPDATE buildings SET lat = 47.754, lng = -117.4186 WHERE name = 'Weyerhaeuser Hall';UPDATE buildings SET lat = 47.7527, lng = -117.4162 WHERE name = 'Viren House Admissions Visitor Center';
