-- ── Audit log foundation ──
-- Authorization-sensitive action'lar için append-only kayıt.
-- UI yok; future moderation/support/premium admin tools temeli.

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id     UUID REFERENCES servers(id) ON DELETE CASCADE,
  actor_id      TEXT NOT NULL,
  action        VARCHAR(60) NOT NULL,
  resource_type VARCHAR(30),
  resource_id   TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_server_time ON audit_log(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time  ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit_log(action);
