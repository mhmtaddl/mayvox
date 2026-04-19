-- Oda kalıcılığı (persistent room) ayrımı — 2026-04-19.
--
-- Yeni iş kuralı (canonical):
--   * is_default=true         → sistem oda (4 adet / server), silinemez, kotada sayılmaz
--   * is_persistent=true      → kullanıcı kalıcı oda, silinebilir, extraPersistentRooms
--                               kotasında sayılır (plan bazlı: free 0 / pro 2 / ultra 6)
--   * is_persistent=false     → normal (non-persistent) oda. Yeni modelde bu path
--                               şu anda KAPALI (maxNonPersistent=0 all plans).
--                               Schema hazır — gelecekte açmak için kod değişikliği yeterli.
--
-- Sistem odaları daima kalıcı sayılır (is_default=true ⇒ is_persistent=true kavramsal olarak).
-- Uygulamada sistem oda silinmez; is_persistent değeri onlar için informational.
--
-- Backfill stratejisi (veri kaybı yok):
--   1. Tüm var olan sistem odaları (is_default=true) → is_persistent=true
--   2. Tüm var olan kullanıcı odaları (is_default=false) → is_persistent=true
--      Gerekçe: mevcut ürün davranışında kullanıcı odaları DB'de kalıcıydı
--      (manuel silinene kadar). Yeni modelde de öyle davranmaları için persistent
--      olarak kaydedilir. Pro/Ultra'da fazla oda varsa (örn. eski ultra 16 özel
--      oda) plan downgrade yapılmadan silinmez — sadece yeni create engellenir.

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS is_persistent BOOLEAN NOT NULL DEFAULT false;

-- Backfill — idempotent (birden fazla çalıştırılırsa aynı sonuç)
UPDATE channels SET is_persistent = true
  WHERE is_persistent = false;

-- Index — create/delete limit check'leri hızlandırır (per-server persistent count)
CREATE INDEX IF NOT EXISTS idx_channels_server_persistent
  ON channels (server_id)
  WHERE is_default = false AND is_persistent = true;

-- ── Comments (schema dokümantasyonu) ───────────────────────────────────
COMMENT ON COLUMN channels.is_default IS
  'Sistem odası (4/server, otomatik seed, silinemez). Bootstrap: serverService.ts';

COMMENT ON COLUMN channels.is_persistent IS
  'Kullanıcı kalıcı odası. Plan extraPersistentRooms kotasında sayılır. '
  'is_default=true için de true; sistem odaları her zaman kalıcı. '
  'false = non-persistent (yeni modelde kota=0, future-use).';
