-- ══════════════════════════════════════════════════════════════════════════
-- Migration 033 — activity_heatmap MV: unique_users kolonu
--
-- Hücre tooltip'inde "N kişi" göstermek için her (server, dow, hour) pencere
-- içinde unique user count gerekli. Mevcut session_count kaç oturum; bu farklı.
--
-- MV rebuild (DROP + CREATE). voice_sessions tablosu dokunulmaz.
-- Additive / non-destructive (eski kolonlar korunur).
--
-- Uygulama: Hetzner manuel psql
--   psql "$DATABASE_URL" --single-transaction -e -f migrations/033_heatmap_unique_users.sql
--   psql "$DATABASE_URL" -c "INSERT INTO _migrations (name, applied_at) VALUES ('033_heatmap_unique_users.sql', now()) ON CONFLICT DO NOTHING;"
-- ══════════════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS activity_heatmap;

CREATE MATERIALIZED VIEW activity_heatmap AS
SELECT
  server_id,
  EXTRACT(DOW  FROM joined_at AT TIME ZONE 'Europe/Istanbul')::INT AS dow,
  EXTRACT(HOUR FROM joined_at AT TIME ZONE 'Europe/Istanbul')::INT AS hour,
  SUM(duration_sec)::BIGINT          AS total_sec,
  COUNT(*)::INT                      AS session_count,
  COUNT(DISTINCT user_id)::INT       AS unique_users
FROM voice_sessions
WHERE left_at IS NOT NULL
  AND joined_at > now() - INTERVAL '90 days'
GROUP BY server_id, dow, hour;

CREATE UNIQUE INDEX IF NOT EXISTS idx_heatmap_unique
  ON activity_heatmap (server_id, dow, hour);

COMMENT ON MATERIALIZED VIEW activity_heatmap IS
  'Sunucu x haftanın-günü x saat: total_sec + session_count + unique_users.';

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICATION:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'activity_heatmap' ORDER BY ordinal_position;
--   -- Beklenen: server_id, dow, hour, total_sec, session_count, unique_users
-- ══════════════════════════════════════════════════════════════════════════
