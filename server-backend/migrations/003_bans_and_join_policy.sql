-- join_policy alanı ekle
ALTER TABLE servers ADD COLUMN join_policy VARCHAR(20) NOT NULL DEFAULT 'invite_only';

-- server_bans tablosu
CREATE TABLE server_bans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id     UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  reason        TEXT NOT NULL DEFAULT '',
  banned_by     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, user_id)
);

CREATE INDEX idx_bans_server ON server_bans(server_id);
CREATE INDEX idx_bans_user ON server_bans(user_id);
