ALTER TABLE servers ALTER COLUMN capacity SET DEFAULT 100;
UPDATE servers SET capacity = 100 WHERE capacity = 50;
