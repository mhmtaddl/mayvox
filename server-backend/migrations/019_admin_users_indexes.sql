-- ── Admin users view — backend DB indexler ──
-- Büyük ölçekte owner_user_id → server listesi/count hızlı olsun.
CREATE INDEX IF NOT EXISTS idx_servers_owner_user_id ON servers(owner_user_id);
-- Plan bazlı sorgular için ikinci eksen
CREATE INDEX IF NOT EXISTS idx_servers_owner_plan    ON servers(owner_user_id, plan);
