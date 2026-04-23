-- ══════════════════════════════════════════════════════════════════════════
-- Migration 031 — Voice Activity + Co-Presence Tracking
--
-- Amaç: voice odalardaki kullanıcı davranışını analiz için veri topla.
-- Additive / idempotent / NON-destructive.
--
-- Uygulama: Hetzner manuel psql (memory: npm run migrate YASAK).
--   psql "$DATABASE_URL" --single-transaction -e -f migrations/031_voice_activity.sql
--   psql "$DATABASE_URL" -c "INSERT INTO _migrations (name, applied_at) VALUES ('031_voice_activity.sql', now()) ON CONFLICT DO NOTHING;"
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. voice_sessions: her user-oda katılımı 1 row ──
CREATE TABLE IF NOT EXISTS voice_sessions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL,
  server_id    UUID NOT NULL,
  room_id      UUID NOT NULL,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at      TIMESTAMPTZ,
  duration_sec INT GENERATED ALWAYS AS (
    CASE
      WHEN left_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (left_at - joined_at))::INT)
    END
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_vs_user_server_time
  ON voice_sessions (user_id, server_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_server_time
  ON voice_sessions (server_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_active
  ON voice_sessions (room_id, user_id) WHERE left_at IS NULL;

COMMENT ON TABLE voice_sessions IS
  'Voice-oda katılım log''u. left_at IS NULL = aktif session. duration_sec generated.';

-- ── 2. co_presence: pair aggregation (kanonik user_a < user_b) ──
CREATE TABLE IF NOT EXISTS co_presence (
  user_a          UUID NOT NULL,
  user_b          UUID NOT NULL,
  server_id       UUID NOT NULL,
  total_sec       BIGINT NOT NULL DEFAULT 0,
  last_overlap_at TIMESTAMPTZ,
  PRIMARY KEY (user_a, user_b, server_id),
  CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_cp_server_total
  ON co_presence (server_id, total_sec DESC);

COMMENT ON TABLE co_presence IS
  'Aynı voice room''da birlikte geçirilen toplam süre. user_a < user_b kanonik sıra.';

-- ── 3. activity_heatmap MV: sunucu x DOW x HOUR toplam süre (Europe/Istanbul TZ) ──
-- Günlük refresh (setInterval 24h). Re-run güvenliği için DROP + CREATE.
DROP MATERIALIZED VIEW IF EXISTS activity_heatmap;
CREATE MATERIALIZED VIEW activity_heatmap AS
SELECT
  server_id,
  EXTRACT(DOW  FROM joined_at AT TIME ZONE 'Europe/Istanbul')::INT AS dow,
  EXTRACT(HOUR FROM joined_at AT TIME ZONE 'Europe/Istanbul')::INT AS hour,
  SUM(duration_sec)::BIGINT AS total_sec,
  COUNT(*)::INT                AS session_count
FROM voice_sessions
WHERE left_at IS NOT NULL
  AND joined_at > now() - INTERVAL '90 days'
GROUP BY server_id, dow, hour;

-- CONCURRENTLY refresh için UNIQUE index zorunlu
CREATE UNIQUE INDEX IF NOT EXISTS idx_heatmap_unique
  ON activity_heatmap (server_id, dow, hour);

COMMENT ON MATERIALIZED VIEW activity_heatmap IS
  'Sunucu x haftanın-günü x saat toplam süre. REFRESH MATERIALIZED VIEW CONCURRENTLY activity_heatmap günde bir.';

-- ── 4. Re-run güvenliği: eski orphan session'ları kapat ──
-- Eğer bu migration birden fazla kez çalıştırılırsa, 1 saatten eski aktif
-- session'lar ölmüş kabul edilir. İlk run'da etki yok (tablo boş).
UPDATE voice_sessions
SET left_at = joined_at + INTERVAL '5 minutes'
WHERE left_at IS NULL
  AND joined_at < now() - INTERVAL '1 hour';

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICATION SORGULARI (psql'de manuel çalıştır)
--
--   -- A) Tablolar oluştu mu
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('voice_sessions','co_presence')
--   ORDER BY table_name;
--   -- Beklenen: 2 satır
--
--   -- B) MV oluştu mu
--   SELECT matviewname FROM pg_matviews WHERE matviewname = 'activity_heatmap';
--   -- Beklenen: 1 satır
--
--   -- C) Aktif session yok (yeni tablo, orphan cleanup çalıştı)
--   SELECT COUNT(*) FROM voice_sessions WHERE left_at IS NULL;
--   -- Beklenen: 0
--
--   -- D) co_presence index + CHECK constraint aktif
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'co_presence'::regclass AND contype IN ('c', 'p');
--
-- ══════════════════════════════════════════════════════════════════════════
