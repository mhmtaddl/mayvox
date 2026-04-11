-- Kullanıcıya özel sunucu davetleri
CREATE TABLE server_user_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id     UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL,
  invited_by    TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  UNIQUE(server_id, invited_user_id, status)
);

CREATE INDEX idx_user_invites_invited ON server_user_invites(invited_user_id) WHERE status = 'pending';
CREATE INDEX idx_user_invites_server ON server_user_invites(server_id);
