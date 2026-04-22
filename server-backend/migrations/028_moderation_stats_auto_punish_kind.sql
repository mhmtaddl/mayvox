-- ── moderation_stats.kind CHECK: 'auto_punish' ekle ──
-- Faz A: auto punishment başarıyla uygulandığında event feed'e düşecek.
-- Mevcut 'flood','profanity','spam' değerleri korunur.

ALTER TABLE moderation_stats
  DROP CONSTRAINT IF EXISTS moderation_stats_kind_check;

ALTER TABLE moderation_stats
  ADD CONSTRAINT moderation_stats_kind_check
  CHECK (kind IN ('flood', 'profanity', 'spam', 'auto_punish'));
