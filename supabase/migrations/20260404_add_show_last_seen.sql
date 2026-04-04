-- Son görülme gizlilik ayarı
-- true (default): diğer kullanıcılar son görülme bilgisini görebilir
-- false: kullanıcı hem kendi son görülmesini gizler hem başkalarınkini göremez
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_last_seen BOOLEAN DEFAULT true;
