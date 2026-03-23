-- profiles tablosuna app_version kolonu ekle (kalıcı sürüm takibi için)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_version TEXT;
