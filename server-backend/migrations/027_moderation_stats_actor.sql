-- ── Moderation stats actor metadata (Faz 5) ──
-- Kim tetikledi + hangi kanalda. Mesaj içeriği ASLA yazılmaz.
-- Mevcut satırlar user_id/channel_id null kalır (geriye uyum).

ALTER TABLE moderation_stats
  ADD COLUMN IF NOT EXISTS user_id    TEXT,
  ADD COLUMN IF NOT EXISTS channel_id TEXT;

-- Per-user sorgular için (örn: "bu userın son 24s olayları")
CREATE INDEX IF NOT EXISTS idx_modstats_server_user_time
  ON moderation_stats (server_id, user_id, created_at DESC);
