-- 017_server_join_requests.sql
-- Davetli sunucular için başvuru akışı.
-- Invite-only sunucuya kullanıcı "İstek Gönder" dediğinde pending kayıt oluşur.
-- Admin Başvurular sekmesinden accept/reject eder.

CREATE TABLE IF NOT EXISTS server_join_requests (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID         NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL,
  status      TEXT         NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','rejected')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

-- Aynı kullanıcı için aktif (pending) tek başvuru olabilir.
-- (accepted/rejected çoklu olabilir — history tutulur.)
CREATE UNIQUE INDEX IF NOT EXISTS ux_join_requests_pending
  ON server_join_requests (server_id, user_id)
  WHERE status = 'pending';

-- Admin listing için: server_id + status + created_at DESC sort index.
CREATE INDEX IF NOT EXISTS idx_join_requests_server_status
  ON server_join_requests (server_id, status, created_at DESC);
