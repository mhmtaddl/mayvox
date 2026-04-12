-- Kanallar tablosu — özel kanal alanları: sahiplik, kapasite, görünürlük, mod
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS owner_id       TEXT,
  ADD COLUMN IF NOT EXISTS max_users      INTEGER,
  ADD COLUMN IF NOT EXISTS is_invite_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mode           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_channels_server_position ON channels(server_id, position);
