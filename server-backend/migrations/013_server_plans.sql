-- ── Plan enforcement foundation ──
-- Additive: mevcut servers.plan kolonu dokunulmaz. Resolver order:
--   server_plans.plan → servers.plan (legacy) → 'free'
-- Bu tablo dedicated plan kaydı tutar; ileride upgrade/downgrade action'ları
-- ve entitlement tracking için birincil kaynak olacak.

CREATE TABLE IF NOT EXISTS server_plans (
  server_id  UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  plan       TEXT NOT NULL DEFAULT 'free',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_server_plans_plan ON server_plans(plan);
