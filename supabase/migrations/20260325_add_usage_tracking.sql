-- Kullanıcı aktivite takibi için profiles tablosuna iki kolon ekle
-- last_seen_at: son çevrimiçi olduğu zaman (logout veya window close'ta yazılır)
-- total_usage_minutes: tüm sessionların toplamı (dakika bazlı birikimli)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_usage_minutes INTEGER NOT NULL DEFAULT 0;
