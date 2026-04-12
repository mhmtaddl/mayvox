-- 015_server_name_unique.sql
-- Sunucu adı GLOBAL unique, case-insensitive.
-- Pre-check (serverService.createServer) + bu index = race condition'a karşı 2 katman savunma.
--
-- Not: Mevcut duplicate kayıt varsa CREATE UNIQUE INDEX fail eder. Öncesinde temizlik
-- gerekir. Eğer production'da duplicate name varsa admin elle düzeltmeli (rename veya sil).
-- Migration idempotent: IF NOT EXISTS.

CREATE UNIQUE INDEX IF NOT EXISTS servers_name_unique_idx
  ON servers (LOWER(name));
