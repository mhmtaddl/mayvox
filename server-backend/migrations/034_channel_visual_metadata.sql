-- Voice channel visual metadata shared across all members of a server.
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS icon_name  VARCHAR(32),
  ADD COLUMN IF NOT EXISTS icon_color VARCHAR(16);

UPDATE channels
SET
  icon_name = COALESCE(icon_name, CASE COALESCE(mode, '')
    WHEN 'gaming' THEN 'gamepad'
    WHEN 'broadcast' THEN 'radio'
    WHEN 'quiet' THEN 'quiet'
    ELSE 'coffee'
  END),
  icon_color = COALESCE(icon_color, CASE COALESCE(mode, '')
    WHEN 'gaming' THEN '#34d399'
    WHEN 'broadcast' THEN '#fb7185'
    WHEN 'quiet' THEN '#c4b5fd'
    ELSE '#38bdf8'
  END)
WHERE icon_name IS NULL OR icon_color IS NULL;
