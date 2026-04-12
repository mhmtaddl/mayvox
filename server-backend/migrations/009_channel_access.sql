-- Kanal bazlı erişim listesi: hidden / invite-only kanallara kullanıcı grant
CREATE TABLE IF NOT EXISTS channel_access (
  channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  granted_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_access_user ON channel_access(user_id);
