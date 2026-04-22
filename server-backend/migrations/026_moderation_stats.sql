-- ── Moderation stats time-series ──
-- Her flood/profanity/spam block olayı bir satır olarak yazılır.
-- Aggregation sorguları index'lenmiş (server_id, created_at DESC) üzerinden hızlı.
-- İleride retention (cron job / partition) ile eski satırlar budanabilir.

CREATE TABLE IF NOT EXISTS moderation_stats (
  id          BIGSERIAL PRIMARY KEY,
  server_id   TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('flood','profanity','spam')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modstats_server_time
  ON moderation_stats (server_id, created_at DESC);
